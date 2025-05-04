import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { toast } from "sonner";

// Define types for the chat
export interface ChatUser {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  roomName: string;
  senderId: string;
  user: ChatUser;
  isRead: boolean;
}

export interface RealtimeChatOptions {
  roomName: string;
  username: string;
  initialMessages?: ChatMessage[];
}

export function useRealtimeChat({
  roomName,
  username,
  initialMessages = [],
}: RealtimeChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Get messages from the database initially
  useEffect(() => {
    const getInitialMessages = async () => {
      try {
        setIsLoading(true);
        // Get current user
        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData?.user?.id || null;
        setUserId(currentUserId);

        // Get messages from the database
        const { data: messagesData, error: messagesError } = await supabase
          .from("chat_messages")
          .select(
            `
            id,
            content,
            created_at,
            room_name,
            is_read,
            sender_id,
            users (id, user_metadata->name)
            `
          )
          .eq("room_name", roomName)
          .order("created_at", { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        // Transform the data to match the ChatMessage type
        const transformedMessages: ChatMessage[] = messagesData.map((msg) => ({
          id: msg.id,
          content: msg.content,
          createdAt: msg.created_at,
          roomName: msg.room_name,
          senderId: msg.sender_id,
          isRead: msg.is_read,
          user: {
            id: msg.sender_id,
            // Use the username from users table, fallback to the one provided
            name:
              (msg.users?.name as string) ||
              (msg.sender_id === currentUserId ? username : "Unknown User"),
          },
        }));

        setMessages((prev) => {
          // Merge with previous messages to avoid duplicates
          const merged = [...prev, ...transformedMessages];
          // Remove duplicates based on message id
          const unique = merged.filter(
            (msg, index, self) =>
              index === self.findIndex((m) => m.id === msg.id)
          );
          // Sort by creation date
          return unique.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });

        // Count unread messages
        if (currentUserId) {
          const unread = transformedMessages.filter(
            (msg) => !msg.isRead && msg.senderId !== currentUserId
          );
          setUnreadCount(unread.length);
        }
      } catch (err) {
        console.error("Error fetching chat messages:", err);
        setError("Failed to load messages. Please try refreshing.");
      } finally {
        setIsLoading(false);
      }
    };

    getInitialMessages();
  }, [roomName, username, supabase]);

  // Listen for new messages
  useEffect(() => {
    const subscription = supabase
      .channel(`room:${roomName}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_name=eq.${roomName}`,
        },
        async (payload) => {
          // When a new message comes in, fetch the user data to display the name
          const { data: userData } = await supabase.auth.getUser();
          const currentUserId = userData?.user?.id;

          // Get the sender information
          const { data: senderData } = await supabase
            .from("users")
            .select("id, user_metadata->name")
            .eq("id", payload.new.sender_id)
            .single();

          const isOwnMessage = payload.new.sender_id === currentUserId;

          // Create the new message
          const newMessage: ChatMessage = {
            id: payload.new.id,
            content: payload.new.content,
            createdAt: payload.new.created_at,
            roomName: payload.new.room_name,
            senderId: payload.new.sender_id,
            isRead: payload.new.is_read || isOwnMessage, // Mark own messages as read
            user: {
              id: payload.new.sender_id,
              name:
                (senderData?.name as string) ||
                (isOwnMessage ? username : "Unknown User"),
            },
          };

          // Add the new message to the list
          setMessages((prev) => [...prev, newMessage]);

          // Increment unread count if message is from someone else
          if (!isOwnMessage) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
        }
      });

    // Cleanup function
    return () => {
      subscription.unsubscribe();
    };
  }, [roomName, username, supabase]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async () => {
    try {
      // Get current user ID
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) return;

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
  }, [messages, supabase]);

  // Mark messages as read when component is visible and focused
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && unreadCount > 0) {
        markMessagesAsRead();
      }
    };

    // For mobile: handle when app comes back from background
    const handleFocus = () => {
      if (unreadCount > 0) {
        markMessagesAsRead();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("touchstart", handleFocus, { once: true });

    // Mark as read when component mounts if document is visible
    if (document.visibilityState === "visible" && unreadCount > 0) {
      markMessagesAsRead();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("touchstart", handleFocus);
    };
  }, [markMessagesAsRead, unreadCount]);

  // Send message function
  const sendMessage = useCallback(
    async (content: string) => {
      try {
        // Check for empty message
        const trimmedContent = content.trim();
        if (!trimmedContent) {
          return;
        }

        // Get current user
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) {
          toast.error("You need to be logged in to send messages");
          return;
        }

        // Insert the new message into the database
        const { error } = await supabase.from("chat_messages").insert({
          content: trimmedContent,
          room_name: roomName,
          sender_id: userData.user.id,
        });

        if (error) {
          console.error("Error sending message:", error);
          toast.error("Failed to send message. Please try again.");
        }
      } catch (err) {
        console.error("Error in sendMessage:", err);
        toast.error("An error occurred. Please try again.");
      }
    },
    [roomName, supabase]
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
