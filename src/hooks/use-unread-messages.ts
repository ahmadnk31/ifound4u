'use client'
import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/client";
import { useIsMobile } from "./use-mobile";

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
  const isMobile = useIsMobile();

  // Use a ref to track if a fetch is in progress to prevent multiple simultaneous requests
  const isFetchingRef = useRef(false);
  // Track if component is mounted
  const mountedRef = useRef(true);

  // Make fetchUnreadCounts a memoized function with useCallback
  const fetchUnreadCounts = useCallback(async () => {
    // Prevent multiple simultaneous fetches or fetching after unmount
    if (isFetchingRef.current || !mountedRef.current) return;

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

      try {
        const response = await fetch("/api/unread-messages", {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error("Failed to fetch unread counts");
        }

        const data = await response.json();

        if (mountedRef.current) {
          setUnreadCounts(data.unreadCounts || {});
          setTotalUnread(data.totalUnread || 0);
        }
      } catch (fetchError) {
        if (fetchError.name === "AbortError") {
          console.warn("Fetch timeout - network might be slow on mobile");
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      console.error("Error fetching unread counts:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [supabase]);

  // Set up a Supabase realtime subscription for new chat messages
  useEffect(() => {
    let isSubscribed = true;
    let connectionTimeout: NodeJS.Timeout;
    let pollingInterval: NodeJS.Timeout | null = null;

    const setupRealtimeSubscription = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session || !isSubscribed) return;

        // Set a timeout to handle potential connection issues on mobile
        connectionTimeout = setTimeout(
          () => {
            if (isSubscribed) {
              console.log("Realtime connection timeout - switching to polling");
              fetchUnreadCounts();

              // If we're on mobile, set up polling as a fallback mechanism
              if (isMobile && isSubscribed) {
                pollingInterval = setInterval(() => {
                  if (isSubscribed && document.visibilityState === "visible") {
                    fetchUnreadCounts();
                  }
                }, 30000); // Poll every 30 seconds on mobile
              }
            }
          },
          isMobile ? 8000 : 5000
        );

        // Mobile-optimized channel setup
        const channel = supabase
          .channel("chat_notifications", {
            config: {
              broadcast: { ack: true },
              presence: { key: "" },
            },
          })
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
          .subscribe((status) => {
            console.log(`Subscription status: ${status}`);
            // If subscription fails and we're on mobile, fall back to polling
            if (
              status !== "SUBSCRIBED" &&
              isMobile &&
              isSubscribed &&
              !pollingInterval
            ) {
              pollingInterval = setInterval(() => {
                if (isSubscribed && document.visibilityState === "visible") {
                  fetchUnreadCounts();
                }
              }, 30000);
            } else if (status === "SUBSCRIBED" && pollingInterval) {
              // If subscription succeeds later, clear polling
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
          });

        return () => {
          if (channel) {
            supabase.removeChannel(channel);
          }
        };
      } catch (err) {
        console.error("Error setting up realtime subscription:", err);
        // Fall back to polling on error for mobile
        if (isMobile && isSubscribed && !pollingInterval) {
          pollingInterval = setInterval(() => {
            if (isSubscribed && document.visibilityState === "visible") {
              fetchUnreadCounts();
            }
          }, 30000);
        }
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
        }
      } finally {
        clearTimeout(connectionTimeout);
      }
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
      clearTimeout(connectionTimeout);

      // Clean up polling interval
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }

      // Clean up subscription properly
      if (subscription) {
        subscription
          .then((cleanup) => {
            if (cleanup) cleanup();
          })
          .catch((err) => {
            console.error("Error cleaning up subscription:", err);
          });
      }
    };
  }, [supabase, fetchUnreadCounts, isMobile]);

  // Implement a more robust refreshCounts function that handles mobile browser quirks
  const refreshCountsWithRetry = useCallback(async () => {
    let retries = 0;
    const maxRetries = 2;

    const attemptFetch = async (): Promise<void> => {
      try {
        await fetchUnreadCounts();
      } catch (err) {
        console.error(`Fetch attempt ${retries + 1} failed:`, err);
        if (retries < maxRetries) {
          retries++;
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 1000 * retries));
          return attemptFetch();
        }
      }
    };

    return attemptFetch();
  }, [fetchUnreadCounts]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    unreadCounts,
    totalUnread,
    isLoading,
    error,
    refreshCounts: refreshCountsWithRetry,
  };
}
