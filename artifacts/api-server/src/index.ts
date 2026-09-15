import { createServer, type IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { parseCookie } from "cookie";
import { WebSocketServer, WebSocket } from "ws";
import { broadcastMessage, subscribeToConversation, unsubscribeFromConversation } from "./message-hub";

type WebSocketMessageData = Buffer | string | ArrayBuffer | Buffer[];

process.loadEnvFile(resolve(import.meta.dirname, "../.env"));

const { default: app } = await import("./app");
const { userFromToken, pool } = await import("./auth");
const { logger } = await import("./lib/logger");

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const wss: WebSocketServer = new WebSocketServer({ server, path: "/ws/calls" });
const callConnections = new Map<string, Set<WebSocket>>();
const clientMeta = new Map<WebSocket, { callId: string; userId: string }>();
const messageWss = new WebSocketServer({ server, path: "/ws/messages" });

wss.on("connection", async (socket: WebSocket, request: IncomingMessage) => {
  const cookieHeader = request.headers.cookie ?? "";
  const cookies = parseCookie(cookieHeader);
  const token = cookies["farm2fork_auth"] ?? null;
  const user = token ? await userFromToken(token) : null;

  if (!user) {
    socket.close(1008, "Authentication required.");
    return;
  }

  socket.on("message", async (raw: WebSocketMessageData) => {
    const payload = raw.toString();
    if (payload.length > 16384) {
      socket.close(1009, "Message too large.");
      return;
    }

    let message: { type?: string; callId?: string; payload?: unknown };
    try {
      message = JSON.parse(payload);
    } catch {
      socket.close(1008, "Malformed signaling message.");
      return;
    }

    const type = message.type;
    if (!type || !["join", "offer", "answer", "ice-candidate", "hangup", "ping"].includes(type)) {
      socket.close(1008, "Unsupported signaling message.");
      return;
    }

    const callId = typeof message.callId === "string" ? message.callId : null;
    if (!callId) {
      socket.close(1008, "Call identifier required.");
      return;
    }

    const result = await pool.query(
      `
        SELECT c.id, c.status, c.expires_at,
               b.profile_id AS buyer_profile_id,
               f.profile_id AS farmer_profile_id
        FROM public.call_sessions c
        JOIN public.buyers b ON b.id = c.buyer_id
        JOIN public.farmers f ON f.id = c.farmer_id
        WHERE c.id = $1
        LIMIT 1
      `,
      [callId],
    );

    const call = result.rows[0];
    if (
      !call ||
      call.status === "ENDED" ||
      call.status === "DECLINED" ||
      call.status === "EXPIRED" ||
      new Date(call.expires_at).getTime() <= Date.now()
    ) {
      socket.close(1008, "Call is not currently valid for signaling.");
      return;
    }

    const isParticipant =
      String(user.id) === String(call.buyer_profile_id) ||
      String(user.id) === String(call.farmer_profile_id);
    if (!isParticipant) {
      socket.close(1008, "You are not a participant in that call.");
      return;
    }

    if (type === "join") {
      const callSet = callConnections.get(callId) ?? new Set<WebSocket>();
      for (const peer of callSet) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: "peer-joined", callId }));
        }
      }
      callSet.add(socket);
      callConnections.set(callId, callSet);
      clientMeta.set(socket, { callId, userId: user.id });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "joined", callId, status: call.status }));
      }
      return;
    }

    const meta = clientMeta.get(socket);
    if (!meta || meta.callId !== callId) {
      socket.close(1008, "Call membership mismatch.");
      return;
    }

    for (const peer of callConnections.get(callId) ?? []) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) {
        peer.send(
          JSON.stringify({
            type,
            callId,
            payload: message.payload,
            senderId: user.id,
          }),
        );
      }
    }

    if (type === "hangup") {
      socket.close();
    }
  });

  socket.on("close", () => {
    const meta = clientMeta.get(socket);
    if (!meta) return;
    clientMeta.delete(socket);
    const members = callConnections.get(meta.callId);
    if (members) {
      members.delete(socket);
      if (members.size === 0) callConnections.delete(meta.callId);
    }
  });

  socket.on("error", (error: Error) => {
    logger.warn({ err: error }, "WebSocket signaling error");
  });
});

messageWss.on("connection", async (socket: WebSocket, request: IncomingMessage) => {
  const cookies = parseCookie(request.headers.cookie ?? "");
  const token = cookies["farm2fork_auth"] ?? null;
  const user = token ? await userFromToken(token) : null;
  const subscriptions = new Set<string>();
  if (!user) {
    socket.close(1008, "Authentication required.");
    return;
  }

  socket.on("message", async (raw: WebSocketMessageData) => {
    if (raw.toString().length > 4096) return socket.close(1009, "Message too large.");
    let message: { type?: string; conversationId?: string };
    try { message = JSON.parse(raw.toString()) as { type?: string; conversationId?: string }; }
    catch { return socket.close(1008, "Malformed message."); }
    if (message.type === "ping") return socket.send(JSON.stringify({ type: "pong" }));
    if (message.type !== "subscribe" || typeof message.conversationId !== "string") return socket.close(1008, "Invalid subscription.");
    const result = await pool.query(
      `SELECT 1 FROM public.conversations c
       JOIN public.buyers b ON b.id = c.buyer_id
       JOIN public.farmers f ON f.id = c.farmer_id
       WHERE c.id = $1 AND (b.profile_id = $2 OR f.profile_id = $2)`,
      [message.conversationId, user.id],
    );
    if (result.rowCount !== 1) return socket.close(1008, "Conversation access denied.");
    subscriptions.add(message.conversationId);
    subscribeToConversation(message.conversationId, socket);
    socket.send(JSON.stringify({ type: "subscribed", conversationId: message.conversationId }));
  });
  socket.on("close", () => { for (const conversationId of subscriptions) unsubscribeFromConversation(conversationId, socket); });
  socket.on("error", (error: Error) => logger.warn({ err: error }, "Message WebSocket error"));
});

server.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
