import { WebSocket } from "ws";

const conversationSockets = new Map<string, Set<WebSocket>>();

export function subscribeToConversation(conversationId: string, socket: WebSocket): void {
  const sockets = conversationSockets.get(conversationId) ?? new Set<WebSocket>();
  sockets.add(socket);
  conversationSockets.set(conversationId, sockets);
}

export function unsubscribeFromConversation(conversationId: string, socket: WebSocket): void {
  const sockets = conversationSockets.get(conversationId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) conversationSockets.delete(conversationId);
}

export function broadcastMessage(conversationId: string, message: unknown): void {
  for (const socket of conversationSockets.get(conversationId) ?? []) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
