import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { useRouter } from "next/navigation";

interface UnreadMessageCounts {
  unreadCounts: Record<string, number>;
  totalUnread: number;
  isLoading: boolean;
  error: Error | null;
  refreshCounts: () => Promise<void>;
}

export function useUnreadMessages(): UnreadMessageCounts {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const fetchUnreadCounts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        // Not authenticated, no unread counts to fetch
        setUnreadCounts({});
        setTotalUnread(0);
        return;
      }

      const response = await fetch("/api/unread-messages");
      if (!response.ok) {
        throw new Error("Failed to fetch unread counts");
      }

      const data = await response.json();
      setUnreadCounts(data.unreadCounts || {});
      setTotalUnread(data.totalUnread || 0);
    } catch (err) {
      console.error("Error fetching unread counts:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  // Set up a Supabase realtime subscription for new chat messages
  useEffect(() => {
    const setupRealtimeSubscription = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      // Subscribe to chat_messages table for new inserts
      const channel = supabase
        .channel("chat_notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
          },
          (payload) => {
            // When a new message is sent, refresh the counts
            fetchUnreadCounts();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "chat_messages",
            filter: "is_read=eq.true",
          },
          (payload) => {
            // When messages are marked as read, refresh the counts
            fetchUnreadCounts();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    setupRealtimeSubscription();
    fetchUnreadCounts();

    // Refresh counts when the user navigates between pages
    const handleRouteChange = () => {
      fetchUnreadCounts();
    };

    window.addEventListener("focus", fetchUnreadCounts);

    return () => {
      window.removeEventListener("focus", fetchUnreadCounts);
    };
  }, [supabase, router]);

  return {
    unreadCounts,
    totalUnread,
    isLoading,
    error,
    refreshCounts: fetchUnreadCounts,
  };
}
