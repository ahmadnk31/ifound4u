import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/client";

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

  // Use a ref to track if a fetch is in progress to prevent multiple simultaneous requests
  const isFetchingRef = useRef(false);

  // Make fetchUnreadCounts a memoized function with useCallback
  const fetchUnreadCounts = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
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
      isFetchingRef.current = false;
    }
  }, [supabase]);

  // Set up a Supabase realtime subscription for new chat messages
  useEffect(() => {
    let isSubscribed = true;

    const setupRealtimeSubscription = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || !isSubscribed) return;

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
          (_payload) => {
            // When a new message is sent, refresh the counts
            if (isSubscribed) {
              fetchUnreadCounts();
            }
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
          (_payload) => {
            // When messages are marked as read, refresh the counts
            if (isSubscribed) {
              fetchUnreadCounts();
            }
          }
        )
        .subscribe();

      return () => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    };

    const subscription = setupRealtimeSubscription();

    // Initial fetch
    if (isSubscribed) {
      fetchUnreadCounts();
    }

    // Use a single focus handler that's debounced for mobile
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isSubscribed) {
        fetchUnreadCounts();
      }
    };

    // Using visibilitychange instead of focus for better mobile support
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Clean up subscription
      subscription.then((cleanup) => {
        if (cleanup) cleanup();
      });
    };
  }, [supabase, fetchUnreadCounts]);

  return {
    unreadCounts,
    totalUnread,
    isLoading,
    error,
    refreshCounts: fetchUnreadCounts,
  };
}
