import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { MessageCircle, Send, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { messagesApi, type Conversation, type Message } from "@/lib/messages";
import { messagesWebSocketUrl } from "@/lib/api-url";
import {
  Badge,
  Button,
  Feedback,
  QueryState,
  SectionTitle,
} from "@/components/ui-kit";
import { ProfileAvatar } from "@/components/profile-ui";

function timeLabel(value?: string | null) {
  if (!value) return "No messages yet";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessagesPage() {
  const { profile } = useAuth();
  const [location, setLocation] = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("conversation"),
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const conversationsPollingRef = useRef(false);
  const messagesPollingRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const selected = useMemo(
    () =>
      conversations.find((item) => item.conversation_id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const refreshConversations = async () => {
    if (conversationsPollingRef.current) return;
    conversationsPollingRef.current = true;
    try {
      const result = await messagesApi.listConversations();
      if (!mountedRef.current) return;
      setConversations(result);
      if (!selectedId && result[0]) setSelectedId(result[0].conversation_id);
    } finally {
      conversationsPollingRef.current = false;
    }
  };

  const refreshMessages = async (conversationId: string) => {
    if (messagesPollingRef.current) return;
    messagesPollingRef.current = true;
    try {
      const result = await messagesApi.getMessages(conversationId);
      if (!mountedRef.current) return;
      setMessages(result.messages);
      const unread = result.messages.filter(
        (message) => !message.is_read && message.receiver_id === profile?.id,
      );
      await Promise.all(
        unread.map((message) =>
          messagesApi.markRead(message.id).catch(() => undefined),
        ),
      );
      await messagesApi
        .markConversationNotificationsRead(conversationId)
        .catch(() => undefined);
      messageListRef.current?.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: "smooth",
      });
      if (unread.length) void refreshConversations().catch(() => undefined);
    } finally {
      messagesPollingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void refreshConversations()
      .catch(() => {
        if (active)
          setError(
            "Unable to load messages. Check your connection and try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(
      () =>
        void refreshConversations().catch(() => {
          if (active) setError("Reconnecting...");
        }),
      5000,
    );
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void refreshMessages(selectedId).catch(() => {
      if (mountedRef.current)
        setError(
          "Unable to load messages. Check your connection and try again.",
        );
    });
    const timer = window.setInterval(
      () =>
        void refreshMessages(selectedId).catch(() => {
          if (mountedRef.current) setError("Reconnecting...");
        }),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [selectedId, profile?.id]);

  useEffect(() => {
    if (!selectedId) return;
    let retries = 0;
    let active = true;
    const connect = () => {
      if (!active) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(messagesWebSocketUrl());
      } catch {
        setSocketConnected(false);
        if (active && retries < 3) {
          retries += 1;
          retryTimerRef.current = window.setTimeout(connect, retries * 1000);
        }
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => {
        if (!active) {
          socket.close();
          return;
        }
        retries = 0;
        setSocketConnected(true);
        socket.send(
          JSON.stringify({ type: "subscribe", conversationId: selectedId }),
        );
      };
      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const message = JSON.parse(event.data as string) as {
            type?: string;
            message?: Message;
          };
          if (message.type === "message:new")
            void refreshMessages(selectedId).catch(() => {
              if (mountedRef.current) setError("Reconnecting...");
            });
        } catch {
          if (mountedRef.current) setError("Reconnecting...");
        }
      };
      socket.onclose = () => {
        if (!active) return;
        setSocketConnected(false);
        if (active && retries < 3) {
          retries += 1;
          retryTimerRef.current = window.setTimeout(connect, retries * 1000);
        }
      };
      socket.onerror = () => setSocketConnected(false);
    };
    connect();
    return () => {
      active = false;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [selectedId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!selectedId || !content || sending) return;
    setSending(true);
    setError(null);
    try {
      await messagesApi.sendMessage(selectedId, content);
      setDraft("");
      await refreshMessages(selectedId);
      await refreshConversations();
    } catch {
      setError("Message failed to send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Private messages"
        title="Keep the conversation moving."
        detail="Message the buyer or farmer connected to your order."
        action={
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            {socketConnected ? (
              <>
                <Wifi size={14} /> Live
              </>
            ) : (
              <>
                <WifiOff size={14} /> Reconnecting
              </>
            )}
          </div>
        }
      />
      {error && <Feedback message={error} kind="error" />}
      <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-[hsl(var(--border))] lg:border-b-0 lg:border-r">
          <div className="border-b border-[hsl(var(--border))] px-5 py-4 font-bold">
            Conversations
          </div>
          <QueryState
            loading={loading}
            error={Boolean(error && !conversations.length)}
          >
            {conversations.length ? (
              conversations.map((conversation) => {
                const other =
                  profile?.role === "FARMER"
                    ? conversation.buyer_name
                    : conversation.farmer_name;
                return (
                  <button
                    type="button"
                    key={conversation.conversation_id}
                    onClick={() => {
                      setSelectedId(conversation.conversation_id);
                      setLocation(
                        `/messages?conversation=${conversation.conversation_id}`,
                      );
                    }}
                    className={`w-full border-b border-[hsl(var(--border))] p-4 text-left ${selectedId === conversation.conversation_id ? "bg-[hsl(var(--muted))]" : "hover:bg-[hsl(var(--muted)/.5)]"}`}
                  >
                    <div className="flex items-start gap-3">
                      <ProfileAvatar src={profile?.role === "FARMER" ? conversation.buyer_photo_url : conversation.farmer_photo_url} name={other} size="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold">
                            {other}
                          </span>
                          {conversation.unread_count > 0 && (
                            <Badge tone="green">
                              {conversation.unread_count}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                          {conversation.crop_name ??
                            (conversation.order_id
                              ? `Order ${conversation.order_id.slice(0, 8)}`
                              : "Direct conversation")}
                        </div>
                        <div className="mt-2 truncate text-xs text-[hsl(var(--muted-foreground))]">
                          {conversation.latest_message ??
                            "Start a conversation"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">
                No conversations yet. Open a farmer listing to start a
                conversation.
              </div>
            )}
          </QueryState>
        </aside>
        <section className="flex min-h-[520px] flex-col">
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
                <ProfileAvatar src={profile?.role === "FARMER" ? selected.buyer_photo_url : selected.farmer_photo_url} name={profile?.role === "FARMER" ? selected.buyer_name : selected.farmer_name} size="size-10" />
                <div>
                  <div className="font-bold">{profile?.role === "FARMER" ? selected.buyer_name : selected.farmer_name}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{selected.crop_name ?? "Direct conversation"}{selected.order_id ? ` · Order ${selected.order_id}` : " · Before order"}</div>
                </div>
              </div>
              <div
                ref={messageListRef}
                className="flex-1 space-y-3 overflow-y-auto p-5"
              >
                {messages.length ? (
                  messages.map((message) => {
                    const mine = message.sender_id === profile?.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "bg-[hsl(var(--primary))] text-white" : "bg-[hsl(var(--muted))]"}`}
                        >
                          <div>{message.content}</div>
                          <div
                            className={`mt-1 text-[10px] ${mine ? "text-white/60" : "text-[hsl(var(--muted-foreground))]"}`}
                          >
                            {timeLabel(message.created_at)}
                            {mine && (message.is_read ? " · Read" : " · Sent")}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
                    Start a conversation with this farmer.
                  </div>
                )}
              </div>
              <form
                onSubmit={submit}
                className="flex gap-2 border-t border-[hsl(var(--border))] p-4"
              >
                <input
                  value={draft}
                  onChange={(event) =>
                    setDraft(event.target.value.slice(0, 2000))
                  }
                  placeholder="Write a message..."
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="min-h-11"
                >
                  <Send size={16} /> Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              <MessageCircle size={28} />
              <div>Select a conversation to begin.</div>
              <Link
                href="/marketplace"
                className="font-bold text-[hsl(var(--primary))]"
              >
                Browse farmer listings
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
