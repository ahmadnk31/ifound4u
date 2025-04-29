"use client";

import { createClient } from "@/lib/client";
import { useCallback, useEffect, useState } from "react";

interface UseRealtimeChatProps {
  roomName: string;
  username: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  user: {
    name: string;
  };
  createdAt: string;
  isRead?: boolean; // Add isRead property
  senderId?: string; // Add sender ID for read status checks
}

const EVENT_MESSAGE_TYPE = "message";

export function useRealtimeChat({ roomName, username }: UseRealtimeChatProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channel, setChannel] = useState<ReturnType<
    typeof supabase.channel
  > | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Load existing messages from the database
  useEffect(() => {
    const loadExistingMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use the API endpoint to fetch messages instead of direct database access
        const response = await fetch(
          `/api/chat-message?room=${encodeURIComponent(roomName)}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch messages");
        }

        const data = await response.json();

        if (data.messages) {
          // Get current user for unread count calculation
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUserId = sessionData?.session?.user?.id;
          let count = 0;

          // Transform database messages to match our ChatMessage format
          const formattedMessages: ChatMessage[] = data.messages.map(
            (msg: any) => {
              // Count unread messages not sent by current user
              if (!msg.is_read && msg.sender_id !== currentUserId) {
                count++;
              }

              return {
                id: msg.id,
                content: msg.message,
                user: {
                  name: msg.sender_name,
                },
                createdAt: msg.created_at,
                isRead: msg.is_read,
                senderId: msg.sender_id,
              };
            }
          );

          setMessages(formattedMessages);
          setUnreadCount(count);

          // Mark messages as read after a short delay
          if (count > 0) {
            setTimeout(() => markMessagesAsRead(), 2000);
          }
        }
      } catch (err: any) {
        console.error("Failed to load chat messages:", err);
        setError("Failed to load chat messages");
      } finally {
        setIsLoading(false);
      }
    };

    if (roomName) {
      loadExistingMessages();
    }
  }, [roomName]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async () => {
    try {
      // Get current user ID
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) return;

      // Get the chat room details to determine who's the item owner and who's the claimer
      const { data: chatRoom } = await supabase
        .from("item_claims")
        .select(
          `
          id, 
          user_id, 
          item_id,
          items:items (user_id)
        `
        )
        .eq("chat_room_id", roomName)
        .single();

      if (!chatRoom) {
        console.error("Could not find chat room details");
        return;
      }

      // Determine if current user is item owner or claimer
      const isItemOwner = chatRoom.items?.user_id === currentUserId;
      const isClaimer = chatRoom.user_id === currentUserId;

      if (!isItemOwner && !isClaimer) {
        console.log(
          "Current user is neither item owner nor claimer, cannot mark messages as read"
        );
        return;
      }

      console.log("User role in chat:", { isItemOwner, isClaimer });

      // Get unread messages sent by the OTHER party (not by current user)
      const unreadMessages = messages.filter(
        (msg) => !msg.isRead && msg.senderId !== currentUserId
      );

      if (unreadMessages.length === 0) {
        console.log("No unread messages to mark as read");
        return;
      }

      console.log(`Marking ${unreadMessages.length} messages as read`);

      // Update messages in the database
      const { error } = await supabase
        .from("chat_messages")
        .update({ is_read: true })
        .in(
          "id",
          unreadMessages.map((msg) => msg.id)
        );

      if (error) {
        console.error("Error marking messages as read:", error);
        return;
      }

      // Update local state
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          unreadMessages.some((unread) => unread.id === msg.id)
            ? { ...msg, isRead: true }
            : msg
        )
      );

      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  }, [messages, roomName, supabase]);

  // Mark messages as read when component is visible and focused
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && unreadCount > 0) {
        markMessagesAsRead();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Mark as read when component mounts if document is visible
    if (document.visibilityState === "visible" && unreadCount > 0) {
      markMessagesAsRead();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markMessagesAsRead, unreadCount]);

  // Set up realtime subscription for new messages
  useEffect(() => {
    const newChannel = supabase.channel(roomName);

    newChannel
      .on("broadcast", { event: EVENT_MESSAGE_TYPE }, (payload) => {
        const newMessage = payload.payload as ChatMessage;
        setMessages((current) => [...current, newMessage]);

        // Get current user to check if we need to update unread count
        supabase.auth.getSession().then(({ data }) => {
          const currentUserId = data?.session?.user?.id;

          // If the message is from someone else, increment unread count
          if (newMessage.senderId !== currentUserId) {
            setUnreadCount((prev) => prev + 1);

            // Show browser notification if supported
            if (Notification.permission === "granted") {
              new Notification("New Message", {
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

    // Request notification permission if not already granted
    if (
      Notification.permission !== "granted" &&
      Notification.permission !== "denied"
    ) {
      Notification.requestPermission();
    }

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
        const userEmail = data?.session?.user?.email || "anonymous@user.com";
        const userId = data?.session?.user?.id || null;

        // Get the chat room details to determine who's the other participant
        const { data: chatRoom } = await supabase
          .from("item_claims")
          .select(
            `
            user_id, 
            claimer_email,
            items:items (user_id)
          `
          )
          .eq("chat_room_id", roomName)
          .single();

        // Determine if message sender is item owner or claimer
        const isItemOwner = chatRoom?.items?.user_id === userId;
        const isClaimer =
          chatRoom?.user_id === userId ||
          (chatRoom?.claimer_email &&
            chatRoom.claimer_email.toLowerCase() === userEmail.toLowerCase());

        // Always mark your own messages as read (for yourself)
        // The other party will see them as unread
        const isSelfRead = true;

        console.log("Sending message as:", { isItemOwner, isClaimer });

        // Update local state immediately for the sender
        const message: ChatMessage = {
          id: messageId,
          content,
          user: {
            name: username,
          },
          createdAt: timestamp,
          isRead: isSelfRead,
          senderId: userId,
        };

        setMessages((current) => [...current, message]);

        console.log("Attempting to save message:", {
          roomName,
          username,
          userId: userId || "none",
          userEmail,
        });

        // Store message in database for persistence
        const { error: dbError } = await supabase.from("chat_messages").insert({
          id: messageId,
          chat_room_id: roomName,
          sender_id: userId,
          sender_name: username,
          sender_email: userEmail,
          message: content,
          is_read: false, // Initially unread for the recipient
          created_at: timestamp,
        });

        if (dbError) {
          console.error("Database error saving message:", dbError);
          throw dbError;
        }

        // Send message through realtime channel with additional metadata
        await channel.send({
          type: "broadcast",
          event: EVENT_MESSAGE_TYPE,
          payload: {
            ...message,
            isItemOwnerSender: isItemOwner,
            isClaimerSender: isClaimer,
          },
        });

        console.log("Message sent and saved successfully");
      } catch (err) {
        console.error("Error sending message:", err);

        // If there was an error, try to fall back to just realtime messaging
        try {
          const fallbackMsg = {
            id: crypto.randomUUID(),
            content,
            user: { name: username },
            createdAt: new Date().toISOString(),
          };

          await channel.send({
            type: "broadcast",
            event: EVENT_MESSAGE_TYPE,
            payload: fallbackMsg,
          });

          console.log("Sent message via realtime only (database save failed)");
        } catch (fallbackErr) {
          console.error("Even fallback messaging failed:", fallbackErr);
        }
      }
    },
    [channel, isConnected, username, roomName, supabase]
  );

  return {
    messages,
    sendMessage,
    isConnected,
    isLoading,
    error,
    unreadCount,
    markMessagesAsRead,
  };
}
