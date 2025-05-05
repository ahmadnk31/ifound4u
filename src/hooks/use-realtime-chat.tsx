"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import { showNotification } from "@/lib/notification-utils";

// Constants
const EVENT_MESSAGE_TYPE = "chat_message";

// Types
export type ChatMessage = {
  id: string;
  content: string;
  timestamp: string;
  user: {
    name: string;
    id: string;
  };
  senderId: string;
  isRead: boolean;
};

export type UseRealtimeChatProps = {
  roomName: string;
  username: string;
};

export function useRealtimeChat({ roomName, username }: UseRealtimeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();
  const isFirstLoad = useRef(true);
  // Function to mark all messages as read
  const markMessagesAsRead = useCallback(async () => {
    if (!roomName) return;

    try {
      // Make API call to mark messages as read
      const response = await fetch(
        `/api/chat-message?room=${encodeURIComponent(roomName)}`,
        {
          method: "GET",
        }
      );

      if (response.ok) {
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  }, [roomName]);

  // Load initial messages and set up realtime subscription
  useEffect(() => {
    // Don't attempt connection without room name
    if (!roomName) {
      setIsLoading(false);
      return;
    }

    const fetchMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch messages from the API
        const response = await fetch(
          `/api/chat-message?room=${encodeURIComponent(roomName)}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load messages");
        }

        const data = await response.json();

        // Convert API response to chat messages format
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          content: msg.message,
          timestamp: msg.created_at,
          user: {
            name: msg.sender_name,
            id: msg.sender_id,
          },
          senderId: msg.sender_id,
          isRead: msg.is_read,
        }));

        setMessages(formattedMessages);

        // Mark all messages as read on initial load
        markMessagesAsRead();
      } catch (err) {
        console.error("Error fetching chat messages:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
        isFirstLoad.current = false;
      }
    };

    fetchMessages();

    // Set up realtime subscription
    const newChannel = supabase
      .channel(`room:${roomName}`)
      .on("broadcast", { event: EVENT_MESSAGE_TYPE }, (payload) => {
        const newMessage = payload.payload as ChatMessage;
        setMessages((current) => [...current, newMessage]);

        // Get current user to check if we need to update unread count
        supabase.auth.getSession().then(({ data }) => {
          const currentUserId = data?.session?.user?.id;

          // If the message is from someone else, increment unread count
          if (newMessage.senderId !== currentUserId) {
            setUnreadCount((prev) => prev + 1);

            // Show browser notification if supported and if we have permission
            if (document.visibilityState !== "visible") {
              showNotification("New Message", {
                body: `${newMessage.user.name}: ${newMessage.content}`,
              });
            }

            // Mark as read if document is visible
            if (document.visibilityState === "visible") {
              setTimeout(() => markMessagesAsRead(), 1000);
            }
          }
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
        }
      });

    setChannel(newChannel);

    // No longer automatically requesting notification permission
    // This will now be handled by a user action

    return () => {
      supabase.removeChannel(newChannel);
    };
  }, [roomName, username, supabase, markMessagesAsRead]);

  // Function to send a new message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!channel || !isConnected || !content.trim()) return;

      try {
        const messageId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // Get current user's session info
        const { data } = await supabase.auth.getSession();
        const userId = data?.session?.user?.id || "anonymous";

        // Create message object
        const message: ChatMessage = {
          id: messageId,
          content,
          timestamp,
          user: {
            name: username,
            id: userId,
          },
          senderId: userId,
          isRead: false,
        };

        // Send message to server via API
        const response = await fetch("/api/chat-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: messageId,
            chat_room_id: roomName,
            sender_id: userId,
            sender_name: username,
            sender_email: data?.session?.user?.email || "",
            message: content,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to send message");
        }

        // Broadcast message to other clients
        channel.send({
          type: "broadcast",
          event: EVENT_MESSAGE_TYPE,
          payload: message,
        });
      } catch (err) {
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
      }
    },
    [channel, isConnected, username, roomName, supabase]
  );


  // Function to request notification permission
  const requestNotifications = useCallback(async () => {
    // This function will be called from a user action (like clicking a button)
    if (!("Notification" in window)) {
      toast.error("This browser does not support desktop notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission !== "denied") {
      try {
        const permission = await Notification.requestPermission();
        return permission === "granted";
      } catch (error) {
        console.error("Error requesting notification permission:", error);
        return false;
      }
    }

    return false;
  }, []);

  // Effect to handle document visibility change for marking messages as read
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && unreadCount > 0) {
        markMessagesAsRead();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [unreadCount, markMessagesAsRead]);

  // Return values and functions
  return useMemo(
    () => ({
      messages,
      isConnected,
      isLoading,
      error,
      sendMessage,
      unreadCount,
      markMessagesAsRead,
      requestNotifications,
    }),
    [
      messages,
      isConnected,
      isLoading,
      error,
      sendMessage,
      unreadCount,
      markMessagesAsRead,
      requestNotifications,
    ]
  );
}
