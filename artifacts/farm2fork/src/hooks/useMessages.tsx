import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { messagesApi } from "@/lib/messages";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export function useUnreadMessages() {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    let polling = false;
    const refresh = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const conversations = await messagesApi.listConversations();
        if (active) {
          const total = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
          setUnreadCount(total);
        }
      } catch {
        if (active) setUnreadCount(0);
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);
  return unreadCount;
}

export function useUnreadNotifications() {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    let polling = false;
    const refresh = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const notifications = await messagesApi.listNotifications();
        if (active) {
          setUnreadCount(notifications.filter((item) => !item.is_read).length);
        }
      } catch {
        if (active) setUnreadCount(0);
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);
  return unreadCount;
}

export function MessageNotificationWatcher() {
  const { isAuthenticated, profile } = useAuth();
  const [, setLocation] = useLocation();
  const seen = useRef(new Map<string, string>());
  const initialized = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    let polling = false;
    const refresh = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const notifications = await messagesApi.listNotifications();
        if (!active) return;
        for (const notification of notifications.filter((item) => !item.is_read)) {
          const latest = notification.created_at;
          const previous = seen.current.get(notification.id);
          if (initialized.current && latest !== previous) {
            toast({
              title: "New message",
              description: "Open your messages to read it.",
              action: <ToastAction altText="Open message" onClick={() => setLocation(`/messages?conversation=${notification.conversation_id}`)}>Open</ToastAction>,
            });
          }
          seen.current.set(notification.id, latest);
        }
        initialized.current = true;
      } catch { /* Keep polling; HTTP remains the source of truth. */ }
      finally { polling = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isAuthenticated, profile?.role, setLocation]);
  return null;
}
