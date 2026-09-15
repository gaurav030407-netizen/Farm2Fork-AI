import { customFetch } from "@workspace/api-client-react";

export type Conversation = {
  conversation_id: string;
  order_id?: string | null;
  crop_listing_id?: string | null;
  buyer_name: string;
  farmer_name: string;
  buyer_photo_url?: string | null;
  farmer_photo_url?: string | null;
  crop_name?: string | null;
  latest_message?: string | null;
  latest_message_at?: string | null;
  unread_count: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
};

export type ConversationMessages = {
  conversation: Conversation;
  messages: Message[];
};

export type Notification = {
  id: string;
  conversation_id: string;
  message_id: string;
  actor_id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  message_content?: string | null;
  order_id?: string | null;
  crop_listing_id?: string | null;
};

export const messagesApi = {
  listConversations: () =>
    customFetch<Conversation[]>("/api/messages/conversations", {
      responseType: "json",
    }),
  createConversation: (context: { order_id?: string; listing_id?: string }) =>
    customFetch<Conversation>("/api/messages/conversations", {
      method: "POST",
      responseType: "json",
      body: JSON.stringify(context),
    }),
  listNotifications: () =>
    customFetch<Notification[]>("/api/messages/notifications", {
      responseType: "json",
    }),
  getMessages: (conversationId: string) =>
    customFetch<ConversationMessages>(
      `/api/messages/conversations/${conversationId}/messages`,
      { responseType: "json" },
    ),
  sendMessage: (conversationId: string, content: string) =>
    customFetch<Message>(
      `/api/messages/conversations/${conversationId}/messages`,
      {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ content }),
      },
    ),
  markRead: (messageId: string) =>
    customFetch<Message>(`/api/messages/messages/${messageId}/read`, {
      method: "PATCH",
      responseType: "json",
    }),
  markConversationNotificationsRead: (conversationId: string) =>
    customFetch<void>(
      `/api/messages/notifications/conversations/${conversationId}/read`,
      {
        method: "PATCH",
        responseType: "json",
      },
    ),
  markNotificationRead: (notificationId: string) =>
    customFetch<void>(
      `/api/messages/notifications/${notificationId}/read`,
      {
        method: "PATCH",
        responseType: "json",
      },
    ),
  markAllNotificationsRead: () =>
    customFetch<void>("/api/messages/notifications/read-all", {
      method: "POST",
      responseType: "json",
    }),
};
