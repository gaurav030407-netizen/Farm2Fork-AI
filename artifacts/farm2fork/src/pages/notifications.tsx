import { useEffect, useState, useTransition } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  CheckCheck,
  Clock,
  ExternalLink,
  Loader2,
  MailCheck,
  MessageSquare,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { messagesApi, type Notification } from "@/lib/messages";
import { toast } from "@/hooks/use-toast";

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Recently";
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "Recently";
  }
}

function getNotificationIcon(notification: Notification) {
  const type = (notification.type || "").toLowerCase();
  if (type.includes("order") || notification.order_id) {
    return <Package className="size-5 text-emerald-600" />;
  }
  if (type.includes("pickup") || type.includes("driver") || type.includes("logistics")) {
    return <Truck className="size-5 text-amber-600" />;
  }
  if (type.includes("verify") || type.includes("security") || type.includes("account")) {
    return <ShieldCheck className="size-5 text-blue-600" />;
  }
  return <MessageSquare className="size-5 text-emerald-600" />;
}

export function NotificationsPage() {
  const [, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isPending, startTransition] = useTransition();

  const loadNotifications = async () => {
    try {
      const data = await messagesApi.listNotifications();
      setNotifications(data);
    } catch {
      toast({
        title: "Could not load notifications",
        description: "Please check your network and refresh.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const handleMarkAsRead = async (id: string) => {
    try {
      await messagesApi.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item,
        ),
      );
    } catch {
      toast({
        title: "Could not mark as read",
        variant: "destructive",
      });
    }
  };

  const handleMarkAllRead = async () => {
    startTransition(async () => {
      try {
        await messagesApi.markAllNotificationsRead();
        setNotifications((prev) =>
          prev.map((item) => ({ ...item, is_read: true, read_at: new Date().toISOString() })),
        );
        toast({
          title: "All marked as read",
          description: "All notifications are now up to date.",
        });
      } catch {
        toast({
          title: "Failed to mark all as read",
          variant: "destructive",
        });
      }
    });
  };

  const filteredNotifications = notifications.filter((item) => {
    if (filter === "unread") return !item.is_read;
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-2">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[hsl(var(--border))] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
              Notifications
            </h1>
            {unreadCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                {unreadCount} new
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                <Sparkles size={12} className="text-amber-500" /> All caught up
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Real-time alerts, conversation updates, order milestones, and verification notices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2 text-xs font-semibold text-[hsl(var(--foreground))] shadow-xs transition hover:bg-[hsl(var(--muted))] disabled:opacity-50"
              data-testid="button-mark-all-read"
            >
              <CheckCheck size={15} className="text-emerald-600" />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            filter === "all"
              ? "bg-[hsl(var(--primary))] text-white shadow-xs"
              : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
          data-testid="tab-filter-all"
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            filter === "unread"
              ? "bg-[hsl(var(--primary))] text-white shadow-xs"
              : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
          data-testid="tab-filter-unread"
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
          <Loader2 size={28} className="animate-spin text-emerald-600" />
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
            Loading your notifications...
          </p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
            <Bell size={28} />
          </div>
          <h2 className="font-display text-lg font-bold text-[hsl(var(--foreground))]">
            No new notifications
          </h2>
          <p className="max-w-md text-sm text-[hsl(var(--muted-foreground))]">
            {filter === "unread"
              ? "You've read all your notifications. Switch to 'All' to review past updates."
              : "You're completely up to date! New order inquiries, crop bids, pickup status, and direct messages will appear here."}
          </p>
          <div className="mt-2 flex gap-3">
            <Link
              href="/messages"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-95"
            >
              <MessageSquare size={14} /> Go to Messages
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotifications.map((notification) => {
            const hasConversation = Boolean(notification.conversation_id);
            return (
              <div
                key={notification.id}
                className={`group relative flex flex-col gap-3 rounded-2xl border p-4 transition-all duration-200 sm:flex-row sm:items-center sm:justify-between ${
                  !notification.is_read
                    ? "border-emerald-300/80 bg-emerald-50/40 shadow-xs dark:border-emerald-800/60 dark:bg-emerald-950/20"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--border)/80)]"
                }`}
                data-testid={`notification-item-${notification.id}`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${
                      !notification.is_read
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {getNotificationIcon(notification)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {notification.actor_name && (
                        <span className="font-semibold text-sm text-[hsl(var(--foreground))]">
                          {notification.actor_name}
                        </span>
                      )}
                      {notification.actor_role && (
                        <span className="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                          {notification.actor_role.replace("_", " ")}
                        </span>
                      )}
                      {!notification.is_read && (
                        <span className="inline-block size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900" />
                      )}
                    </div>

                    <p className="text-sm leading-snug text-[hsl(var(--foreground)/90)]">
                      {notification.message_content || "You have a new message update regarding your farm transaction."}
                    </p>

                    <div className="flex items-center gap-3 pt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatRelativeTime(notification.created_at)}
                      </span>
                      {notification.order_id && (
                        <span className="truncate max-w-[180px]">
                          Order: #{notification.order_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
                  {hasConversation && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!notification.is_read) {
                          void handleMarkAsRead(notification.id);
                        }
                        setLocation(`/messages?conversation=${notification.conversation_id}`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                      data-testid={`button-view-conv-${notification.id}`}
                    >
                      <MessageSquare size={14} />
                      <span>View Message</span>
                      <ExternalLink size={12} className="opacity-75" />
                    </button>
                  )}

                  {!notification.is_read ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkAsRead(notification.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                      title="Mark as read"
                      data-testid={`button-mark-read-${notification.id}`}
                    >
                      <MailCheck size={14} />
                      <span className="hidden sm:inline">Mark read</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[hsl(var(--muted-foreground)/60)] px-2 py-1">
                      Read
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default NotificationsPage;
