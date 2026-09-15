import { useCallback, useEffect, useRef, useState } from "react";
import { getCallIceConfig, useCreateCall } from "@workspace/api-client-react";
import { apiUrl, callsWebSocketUrl } from "@/lib/api-url";

export type CallState =
  | "idle"
  | "creating"
  | "ringing"
  | "incoming"
  | "connecting"
  | "active"
  | "declined"
  | "ended"
  | "expired"
  | "failed";

export type UseCallOptions = {
  orderId?: string;
  listenForIncoming?: boolean;
  onStateChange?: (state: CallState) => void;
};

type SignalingMessage = {
  type?: string;
  callId?: string;
  payload?: unknown;
  status?: string;
};

type CallDebug = {
  websocket: "OPEN" | "CLOSED";
  role: "buyer" | "farmer" | "unknown";
  callId: string | null;
  peerJoined: boolean;
  signalingState: string;
  iceGatheringState: string;
  iceConnectionState: string;
  connectionState: string;
  localDescription: string;
  remoteDescription: string;
  localIceCandidates: number;
  remoteIceCandidates: number;
  remoteTrackReceived: boolean;
};

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Call failed.";
}

export function useCall({ orderId, listenForIncoming = false, onStateChange }: UseCallOptions = {}) {
  const createCall = useCreateCall();
  const [callState, setCallState] = useState<CallState>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callTimerSeconds, setCallTimerSeconds] = useState(0);
  const [signalReady, setSignalReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ call_id: string; farmer_name: string; farmer_photo_url?: string | null; crop_name?: string | null; order_id: string } | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStateRef = useRef<CallState>("idle");
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const [iceConfig, setIceConfig] = useState<RTCConfiguration | null>(null);
  const pendingMessagesRef = useRef<SignalingMessage[]>([]);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const joinedRef = useRef(false);
  const callPollingErrorRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const debugRef = useRef<CallDebug>({
    websocket: "CLOSED",
    role: orderId ? "buyer" : listenForIncoming ? "farmer" : "unknown",
    callId: null,
    peerJoined: false,
    signalingState: "stable",
    iceGatheringState: "new",
    iceConnectionState: "new",
    connectionState: "new",
    localDescription: "none",
    remoteDescription: "none",
    localIceCandidates: 0,
    remoteIceCandidates: 0,
    remoteTrackReceived: false,
  });
  const [callDebug, setCallDebug] = useState<CallDebug>(debugRef.current);

  const updateDebug = useCallback((changes: Partial<CallDebug>) => {
    debugRef.current = { ...debugRef.current, ...changes };
    setCallDebug(debugRef.current);
    if (!import.meta.env.PROD) console.debug("CALL_DEBUG", debugRef.current);
  }, []);

  const updateState = useCallback(
    (next: CallState) => {
      setCallState(next);
      callStateRef.current = next;
      onStateChange?.(next);
    },
    [onStateChange],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getCallIceConfig();
        if (!cancelled) {
          setIceConfig({
            iceServers: config.ice_servers.map((server) => ({
              urls: server.urls,
              ...(server.username ? { username: server.username } : {}),
              ...(server.credential ? { credential: server.credential } : {}),
            })),
          });
        }
      } catch (caught) {
        if (!cancelled) {
          const status = typeof caught === "object" && caught !== null && "status" in caught
            ? Number((caught as { status: unknown }).status)
            : 0;
          setError(status === 401 ? "Your session has expired. Please sign in again." : "ICE configuration is unavailable. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (callState !== "active") return;
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      setCallTimerSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [callState]);

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setSignalReady(false);
    setIsMuted(false);
    pendingMessagesRef.current = [];
    pendingCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];
    joinedRef.current = false;
    setCallId(null);
    callIdRef.current = null;
    updateDebug({ websocket: "CLOSED", peerJoined: false, connectionState: "closed" });
  }, [updateDebug]);

  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    const peer = peerConnectionRef.current;
    const socket = socketRef.current;
    if (!peer || !socket) {
      pendingMessagesRef.current.push(message);
      return;
    }
    if (message.type === "peer-joined") {
      updateDebug({ peerJoined: true });
      return;
    }
    if (message.type === "answer" && message.payload) {
      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      updateDebug({ remoteDescription: "answer" });
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(candidate);
      }
    } else if (message.type === "offer" && message.payload) {
      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      updateDebug({ remoteDescription: "offer" });
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(candidate);
      }
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      updateDebug({ localDescription: "answer" });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "answer", callId: callIdRef.current, payload: answer }));
      }
    } else if (message.type === "ice-candidate" && message.payload) {
      const candidate = message.payload as RTCIceCandidateInit;
      if (peer.remoteDescription) {
        await peer.addIceCandidate(candidate);
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
      updateDebug({ remoteIceCandidates: debugRef.current.remoteIceCandidates + 1 });
    } else if (message.type === "hangup") {
      cleanup();
      updateState("idle");
    }
  }, [cleanup, updateDebug, updateState]);

  const createPeer = useCallback(async (socket: WebSocket, activeCallId: string, generation: number) => {
    if (generationRef.current !== generation) throw new Error("Call was ended.");
    const iceServers = iceConfig?.iceServers ?? [];
    if (iceServers.length === 0) {
      throw new Error("ICE configuration is unavailable. Please try again.");
    }
    const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (generationRef.current !== generation) {
      media.getTracks().forEach((track) => track.stop());
      throw new Error("Call was ended.");
    }
    localStreamRef.current = media;
    const peer = new RTCPeerConnection({ iceServers });
    peerConnectionRef.current = peer;
    updateDebug({ callId: activeCallId, websocket: socket.readyState === WebSocket.OPEN ? "OPEN" : "CLOSED" });
    media.getTracks().forEach((track) => peer.addTrack(track, media));
    peer.onicecandidate = (event) => {
      if (generationRef.current !== generation) return;
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        if (!joinedRef.current || socket.readyState !== WebSocket.OPEN) {
          pendingLocalCandidatesRef.current.push(candidate);
          return;
        }
        updateDebug({ localIceCandidates: debugRef.current.localIceCandidates + 1 });
        socket.send(JSON.stringify({ type: "ice-candidate", callId: activeCallId, payload: candidate }));
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (generationRef.current !== generation) return;
      updateDebug({ iceConnectionState: peer.iceConnectionState });
      if (["connected", "completed"].includes(peer.iceConnectionState)) updateState("active");
      if (["failed", "closed"].includes(peer.iceConnectionState)) updateState("failed");
    };
    peer.onicegatheringstatechange = () => {
      if (generationRef.current === generation) updateDebug({ iceGatheringState: peer.iceGatheringState });
    };
    peer.onsignalingstatechange = () => {
      if (generationRef.current === generation) updateDebug({ signalingState: peer.signalingState });
    };
    peer.onconnectionstatechange = () => {
      if (generationRef.current !== generation) return;
      updateDebug({ connectionState: peer.connectionState });
      if (peer.connectionState === "connected") updateState("active");
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) updateState("failed");
    };
    peer.ontrack = (event) => {
      if (generationRef.current !== generation) return;
      const audio = remoteAudioRef.current ?? new Audio();
      remoteAudioRef.current = audio;
      audio.autoplay = true;
      audio.muted = false;
      audio.srcObject = event.streams[0];
      updateDebug({ remoteTrackReceived: true });
      void audio.play().catch(() => setError("Remote audio is blocked. Tap the page to allow call audio."));
    };
    for (const message of pendingMessagesRef.current.splice(0)) {
      await handleSignalingMessage(message);
    }
    return peer;
  }, [handleSignalingMessage, iceConfig, updateDebug, updateState]);

  const startCall = useCallback(async () => {
    if (!orderId) {
      setError("No order is selected for the call.");
      updateState("failed");
      return;
    }
    setError(null);
    updateState("creating");
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    try {
      const call = await createCall.mutateAsync({ data: { order_id: orderId } });
      if (generationRef.current !== generation) {
        void fetch(apiUrl(`/api/calls/${call.call_id}/end`), { method: "POST", credentials: "include" }).catch(() => undefined);
        return;
      }
      setCallId(call.call_id);
      callIdRef.current = call.call_id;
      updateState("ringing");
      const wsUrl = callsWebSocketUrl();
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = () => void (async () => {
        if (generationRef.current !== generation) return;
        await createPeer(socket, call.call_id, generation);
        socket.send(JSON.stringify({ type: "join", callId: call.call_id }));
      })().catch((caught) => {
        setError(safeErrorMessage(caught));
        updateState("failed");
      });
      socket.onmessage = (event) => {
        if (generationRef.current !== generation) return;
        const message = JSON.parse(event.data as string) as SignalingMessage;
        if (!import.meta.env.PROD) console.debug("CALL_SIGNAL", message.type);
        if (message.type === "joined") {
          joinedRef.current = true;
          for (const candidate of pendingLocalCandidatesRef.current.splice(0)) {
            socket.send(JSON.stringify({ type: "ice-candidate", callId: call.call_id, payload: candidate }));
          }
          setSignalReady(true);
          return;
        }
        if (message.type === "peer-joined" && peerConnectionRef.current && socket.readyState === WebSocket.OPEN) {
          void peerConnectionRef.current.createOffer().then(async (offer) => {
            await peerConnectionRef.current?.setLocalDescription(offer);
            updateDebug({ localDescription: "offer", peerJoined: true });
            socket.send(JSON.stringify({ type: "offer", callId: call.call_id, payload: offer }));
          }).catch((caught) => {
            setError(safeErrorMessage(caught));
            updateState("failed");
          });
          return;
        }
        void handleSignalingMessage(message).catch((caught) => {
          setError(safeErrorMessage(caught));
          updateState("failed");
        });
      };
      socket.onerror = () => {
        if (generationRef.current !== generation) return;
        setError("The call signaling connection is unavailable.");
        updateState("failed");
      };
      socket.onclose = () => {
        if (generationRef.current !== generation) return;
        updateDebug({ websocket: "CLOSED" });
        if (callStateRef.current !== "active" && callStateRef.current !== "ended") {
          updateState("failed");
        }
      };
    } catch (caught) {
      setError(safeErrorMessage(caught));
      updateState("failed");
    }
  }, [createCall, createPeer, handleSignalingMessage, orderId, updateDebug, updateState]);

  const acceptIncomingCall = useCallback(async (incomingCallId: string) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setCallId(incomingCallId);
    callIdRef.current = incomingCallId;
    updateState("connecting");
    try {
      const response = await fetch(apiUrl(`/api/calls/${incomingCallId}/accept`), { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Unable to accept call.");
      if (generationRef.current !== generation) return;
      const wsUrl = callsWebSocketUrl();
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = async () => {
        try {
          if (generationRef.current !== generation) return;
          await createPeer(socket, incomingCallId, generation);
          socket.send(JSON.stringify({ type: "join", callId: incomingCallId }));
        } catch (caught) {
          setError(safeErrorMessage(caught));
          updateState("failed");
        }
      };
      socket.onmessage = (event) => {
        if (generationRef.current !== generation) return;
        const message = JSON.parse(event.data as string) as SignalingMessage;
        if (!import.meta.env.PROD) console.debug("CALL_SIGNAL", message.type);
        if (message.type === "joined") {
          joinedRef.current = true;
          for (const candidate of pendingLocalCandidatesRef.current.splice(0)) {
            socket.send(JSON.stringify({ type: "ice-candidate", callId: incomingCallId, payload: candidate }));
          }
          setSignalReady(true);
          return;
        }
        void handleSignalingMessage(message).catch((caught) => {
          setError(safeErrorMessage(caught));
          updateState("failed");
        });
      };
      socket.onerror = () => {
        if (generationRef.current === generation) setError("The call signaling connection is unavailable.");
      };
      socket.onclose = () => {
        if (generationRef.current === generation) updateDebug({ websocket: "CLOSED" });
      };
    } catch (caught) {
      setError(safeErrorMessage(caught));
      updateState("failed");
    }
  }, [createPeer, handleSignalingMessage, updateDebug, updateState]);

  const declineIncomingCall = useCallback(async (incomingCallId: string) => {
    updateState("declined");
    cleanup();
    updateState("idle");
    setIncomingCall(null);
    void fetch(apiUrl(`/api/calls/${incomingCallId}/decline`), { method: "POST", credentials: "include" }).catch(() => undefined);
  }, [cleanup, updateState]);

  const endCall = useCallback(async () => {
    const activeCallId = callIdRef.current ?? callId;
    generationRef.current += 1;
    if (activeCallId && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "hangup", callId: activeCallId }));
    }
    cleanup();
    updateState("idle");
    if (activeCallId) {
      void fetch(apiUrl(`/api/calls/${activeCallId}/end`), {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    }
  }, [callId, cleanup, updateState]);

  const joinCall = useCallback(async (incomingCallId: string) => {
    await acceptIncomingCall(incomingCallId);
  }, [acceptIncomingCall]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    if (!listenForIncoming) return;
    let active = true;
    let polling = false;
    const controller = new AbortController();
    const poll = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const response = await fetch(apiUrl("/api/calls"), { credentials: "include", signal: controller.signal });
        if (!active || !response.ok) {
          if (active && response.status >= 500) setError("Call service unavailable. Reconnecting...");
          return;
        }
        const calls = (await response.json()) as Array<{ call_id: string; status: string; farmer_name: string; farmer_photo_url?: string | null; crop_name?: string | null; order_id: string }>;
        if (!active) return;
        const ringing = calls.find((call) => call.status === "RINGING");
        callPollingErrorRef.current = false;
        setIncomingCall(ringing ?? null);
        if (ringing && callStateRef.current === "idle") updateState("incoming");
        if (!ringing && callStateRef.current === "incoming") updateState("idle");
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError") && !callPollingErrorRef.current) {
          callPollingErrorRef.current = true;
          setError("Call service unavailable. Reconnecting...");
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [listenForIncoming, updateState]);

  useEffect(() => {
    const activeCallId = callId;
    if (!activeCallId || !["ringing", "connecting"].includes(callState)) return;
    let active = true;
    let polling = false;
    const controller = new AbortController();
    const pollStatus = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const response = await fetch(apiUrl(`/api/calls/${activeCallId}`), { credentials: "include", signal: controller.signal });
        if (!active || !response.ok) return;
        const call = await response.json() as { status?: string };
        if (call.status === "DECLINED") {
          cleanup();
          setError("Call declined by farmer.");
          updateState("idle");
        }
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError("Call service unavailable. Reconnecting...");
        }
      } finally {
        polling = false;
      }
    };
    void pollStatus();
    const timer = window.setInterval(() => void pollStatus(), 2000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [callId, callState, cleanup, updateState]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setIsMuted(nextMuted);
  }, [isMuted]);

  return {
    callState,
    callId,
    error,
    callTimerSeconds,
    signalReady,
    startCall,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    joinCall,
    incomingCall,
    cleanup,
    isMuted,
    toggleMute,
    callDebug,
  };
}
