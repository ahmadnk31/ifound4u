"use client";

import { cn } from "@/lib/utils";
import { ChatMessageItem } from "@/components/chat-message";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { type ChatMessage, useRealtimeChat } from "@/hooks/use-realtime-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, DollarSign, CreditCard } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ShippingPaymentWrapper } from "./shipping-payment-form";
import { SetupPaymentAccount } from "./setup-payment-account";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RealtimeChatProps {
  roomName: string;
  username: string;
  onMessage?: (messages: ChatMessage[]) => void;
  messages?: ChatMessage[];
}

/**
 * Realtime chat component
 * @param roomName - The name of the room to join. Each room is a unique chat.
 * @param username - The username of the user
 * @param onMessage - The callback function to handle the messages. Useful if you want to store the messages in a database.
 * @param messages - The messages to display in the chat. Useful if you want to display messages from a database.
 * @returns The chat component
 */
export const RealtimeChat = ({
  roomName,
  username,
  onMessage,
  messages: initialMessages = [],
}: RealtimeChatProps) => {
  const { containerRef, scrollToBottom } = useChatScroll();
  const supabase = createClient();

  const {
    messages: realtimeMessages,
    sendMessage,
    isConnected,
    isLoading,
    error,
    unreadCount,
    markMessagesAsRead,
  } = useRealtimeChat({
    roomName,
    username,
  });
  const [newMessage, setNewMessage] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showSetupPaymentForm, setShowSetupPaymentForm] = useState(false);
  const [claimInfo, setClaimInfo] = useState<{
    id: string;
    itemTitle: string;
    status: string;
    isUserClaimer: boolean;
  } | null>(null);
  const [hasFinderStripeAccount, setHasFinderStripeAccount] = useState<
    boolean | null
  >(null);
  const [stableFinderStripeAccount, setStableFinderStripeAccount] = useState<
    boolean | null
  >(null);
  const stripeAccountCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isCheckingStripeAccount, setIsCheckingStripeAccount] = useState(false);
  const [needsSetupPayment, setNeedsSetupPayment] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Add a new function to check finder's account status against Stripe API
  const checkFinderAccountWithStripe = useCallback(async (finderId: string) => {
    if (!finderId) return false;

    try {
      console.log(
        "Checking finder account status via API for finder ID:",
        finderId
      );

      // We'll use a dedicated endpoint to check the finder's account status
      const response = await fetch("/api/stripe/check-finder-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ finderId }),
      });

      // Handle non-200 responses explicitly
      if (!response.ok) {
        // If it's 403 or 404, we just log it - it means the user doesn't have permission
        // or the finder has no items
        if (response.status === 403 || response.status === 404) {
          console.log(
            `Status ${response.status}: User doesn't have permission or finder has no items`
          );
          return false;
        }

        // For other errors, we throw to trigger the catch block
        const errorText = await response.text();
        throw new Error(
          `Failed to verify finder account status: ${response.status} - ${errorText}`
        );
      }

      // Parse the response
      const data = await response.json();
      console.log("Finder account status data:", data);

      // Return the account status
      return !!data.accountEnabled;
    } catch (error) {
      console.error("Error checking finder account with Stripe:", error);
      return false;
    }
  }, []);

  const refreshFinderStatus = useCallback(async () => {
    if (!claimInfo) {
      toast.error(
        "Unable to check finder's payment status: Missing claim information"
      );
      return;
    }

    setIsCheckingStripeAccount(true);
    try {
      // Get the chat room details to find the claim ID
      console.log(
        "Starting payment status check for chat room:",
        roomName,
        "claim ID:",
        claimInfo.id
      );

      // First, get the claim directly using the chat room ID since that's more reliable
      const { data: claim, error: claimError } = await supabase
        .from("item_claims")
        .select(
          `
          id,
          item_id,
          chat_room_id
        `
        )
        .eq("chat_room_id", roomName)
        .single();

      if (claimError || !claim || !claim.item_id) {
        console.error("Error finding claim by chat room:", claimError);
        toast.error("Could not find the claim details for this chat");
        setIsCheckingStripeAccount(false);
        return;
      }

      console.log("Found claim with item ID:", claim.item_id);

      // Now get the item details to find the finder's user ID
      const { data: item, error: itemError } = await supabase
        .from("items")
        .select("id, user_id, title")
        .eq("id", claim.item_id)
        .single();
      console.log("item", item);
      console.log("itemError", itemError);
      // Check if the item exists and has a user ID

      const founderId = item?.user_id;
      console.log("founderId", founderId);

      if (founderId) {
        const founderAccountStatu = await supabase
          .from("user_payment_accounts")
          .select("account_enabled")
          .eq("user_id", founderId)
          .single();
        console.log("founderAccountStatus", founderAccountStatu);
      }

      if (itemError || !item) {
        console.error("Error finding item:", itemError);
        toast.error("Could not find the item details");
        setIsCheckingStripeAccount(false);
        return;
      }

      // This is the actual finder's user ID (the person who posted/found the item)
      const finderId = item.user_id;

      if (!finderId) {
        console.error("Item has no associated user ID");
        toast.error("The item doesn't have an associated user");
        setIsCheckingStripeAccount(false);
        return;
      }

      console.log("Found item owned by finder ID:", finderId);

      // First check with the dedicated API endpoint (more reliable)
      const stripeAccountEnabled = await checkFinderAccountWithStripe(finderId);

      if (stripeAccountEnabled) {
        setHasFinderStripeAccount(true);
        setStableFinderStripeAccount(true);
        toast.success(
          "The finder has set up their payment account. You can now pay for shipping."
        );
        setIsCheckingStripeAccount(false);
        return;
      }

      // Fallback to direct database query if API endpoint failed
      const { data: finderAccount, error: accountError } = await supabase
        .from("user_payment_accounts")
        .select("stripe_account_id, account_enabled, is_onboarded")
        .eq("user_id", finderId)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 errors

      if (accountError) {
        console.error("Error checking finder account:", accountError);
        // Error handling for unexpected errors, not "no rows found"
        toast.error("Could not verify the finder's payment account status");
        setIsCheckingStripeAccount(false);
        return;
      }

      // Check if the finder has an account (might be null if no record found)
      if (!finderAccount) {
        setHasFinderStripeAccount(false);
        setStableFinderStripeAccount(false);
        toast.info("The finder has not set up their payment account yet.");
        setIsCheckingStripeAccount(false);
        return;
      }

      const hasAccount = !!finderAccount?.account_enabled;
      console.log("Finder has enabled account:", hasAccount);

      // Update both state values to ensure UI consistency
      setHasFinderStripeAccount(hasAccount);
      setStableFinderStripeAccount(hasAccount);

      // Show appropriate toast message
      if (hasAccount) {
        toast.success(
          "The finder has set up their payment account. You can now pay for shipping."
        );
      } else {
        toast.info(
          "The finder still needs to complete their payment account setup."
        );
      }
    } catch (error) {
      console.error("Error refreshing finder status:", error);
      toast.error(
        "An error occurred while checking the finder's payment account"
      );
    } finally {
      setIsCheckingStripeAccount(false);
    }
  }, [claimInfo, supabase, toast, roomName, checkFinderAccountWithStripe]);

  // Merge realtime messages with initial messages
  const allMessages = useMemo(() => {
    const mergedMessages = [...initialMessages, ...realtimeMessages];
    // Remove duplicates based on message id
    const uniqueMessages = mergedMessages.filter(
      (message, index, self) =>
        index === self.findIndex((m) => m.id === message.id)
    );
    // Sort by creation date
    const sortedMessages = uniqueMessages.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );

    return sortedMessages;
  }, [initialMessages, realtimeMessages]);

  useEffect(() => {
    if (onMessage) {
      onMessage(allMessages);
    }
  }, [allMessages, onMessage]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    scrollToBottom();
  }, [allMessages, scrollToBottom]);

  // Get claim information and check finder's Stripe account when the component mounts
  useEffect(() => {
    const fetchClaimInfo = async () => {
      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        setUserId(user.id);

        // Get claim information for this chat room
        const { data: claim } = await supabase
          .from("item_claims")
          .select(
            `
            id,
            user_id,
            status,
            claimer_email,
            items:item_id (
              id,
              title,
              user_id
            )
          `
          )
          .eq("chat_room_id", roomName)
          .single();

        if (!claim) return;

        // Check if current user is the claimer
        const isUserClaimer =
          user.id === claim.user_id ||
          user.email?.toLowerCase() === claim.claimer_email?.toLowerCase();

        setClaimInfo({
          id: claim.id,
          itemTitle: claim.items.title,
          status: claim.status,
          isUserClaimer,
        });

        // Check payment account setup needs - only run this check when needed
        if (isUserClaimer && claim.status === "accepted") {
          setIsCheckingStripeAccount(true);

          // For claimer: check if finder has set up account
          try {
            const { data: itemOwnerPaymentAccount, error: accountError } =
              await supabase
                .from("user_payment_accounts")
                .select("stripe_account_id, account_enabled")
                .eq("user_id", claim.items.user_id)
                .maybeSingle(); // Use maybeSingle instead of single to avoid 406 errors

            if (accountError) {
              console.error(
                "Error fetching finder payment account:",
                accountError
              );
              setHasFinderStripeAccount(false);
              setStableFinderStripeAccount(false);
            } else {
              const hasAccount = !!itemOwnerPaymentAccount?.account_enabled;
              setHasFinderStripeAccount(hasAccount);

              // Add a small delay before updating the stable state to prevent flickering
              if (stripeAccountCheckTimeoutRef.current) {
                clearTimeout(stripeAccountCheckTimeoutRef.current);
              }

              stripeAccountCheckTimeoutRef.current = setTimeout(() => {
                setStableFinderStripeAccount(hasAccount);
              }, 500);
            }
          } catch (error) {
            console.error("Error checking finder's payment account:", error);
            setHasFinderStripeAccount(false);
            setStableFinderStripeAccount(false);
          } finally {
            setIsCheckingStripeAccount(false);
          }
        }

        // For finder: check if I need to set up an account
        if (!isUserClaimer && claim.status === "accepted") {
          try {
            // Check if I have a payment account set up
            const { data: myPaymentAccount, error: myAccountError } =
              await supabase
                .from("user_payment_accounts")
                .select("stripe_account_id, account_enabled")
                .eq("user_id", user.id)
                .maybeSingle(); // Use maybeSingle instead of single

            const needsSetup = !myPaymentAccount?.account_enabled;
            setNeedsSetupPayment(needsSetup);

            // Set showSetupPaymentForm to true if there's no account and the claimer has asked about shipping
            const paymentMentioned = allMessages
              .slice(-10)
              .some(
                (msg) =>
                  msg.user.name !== username &&
                  (msg.content.toLowerCase().includes("payment") ||
                    msg.content.toLowerCase().includes("pay") ||
                    msg.content.toLowerCase().includes("stripe") ||
                    msg.content.toLowerCase().includes("shipping"))
              );

            if (
              (paymentMentioned && needsSetup) ||
              (paymentMentioned && !showSetupPaymentForm)
            ) {
              // First, check if the finder has configured shipping options
              const { data: shippingConfig } = await supabase
                .from("shipping_configs")
                .select("*")
                .eq("user_id", user.id)
                .is("claim_id", claim.id)
                .maybeSingle();

              // If no claim-specific config, check for user's default config
              if (!shippingConfig) {
                const { data: defaultConfig } = await supabase
                  .from("shipping_configs")
                  .select("*")
                  .eq("user_id", user.id)
                  .is("claim_id", null)
                  .is("item_id", null)
                  .maybeSingle();

                // If no shipping config exists or the finder has an account but hasn't configured shipping,
                // show the setup form with the shipping tab selected
                if (!defaultConfig) {
                  setShowSetupPaymentForm(true);
                } else if (!needsSetup) {
                  // Only show shipping tab if the account is already set up
                  setShowSetupPaymentForm(true);
                }
              } else if (!needsSetup) {
                // If claim-specific config exists and account is set up, still allow editing
                setShowSetupPaymentForm(true);
              } else {
                setShowSetupPaymentForm(true);
              }
            }
          } catch (error) {
            console.error("Error checking payment account:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching claim info:", error);
        setIsCheckingStripeAccount(false);
      }
    };

    if (roomName) {
      fetchClaimInfo();
    }

    // Cleanup the timeout
    return () => {
      if (stripeAccountCheckTimeoutRef.current) {
        clearTimeout(stripeAccountCheckTimeoutRef.current);
      }
    };
  }, [roomName, supabase, username]);

  // Mark messages as read when user interacts with the chat
  const handleChatFocus = useCallback(() => {
    if (unreadCount > 0) {
      markMessagesAsRead();
    }
  }, [unreadCount, markMessagesAsRead]);

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim() || !isConnected) return;

      sendMessage(newMessage);
      setNewMessage("");
    },
    [newMessage, isConnected, sendMessage]
  );

  const handlePaymentComplete = useCallback(() => {
    setShowPaymentForm(false);
    sendMessage("I've completed the payment for shipping.");
    toast.success(
      "Payment completed! Your message has been sent to the other user."
    );
  }, [sendMessage, toast]);

  const handlePaymentCancel = useCallback(() => {
    setShowPaymentForm(false);
  }, []);

  const handleSetupComplete = useCallback(() => {
    setShowSetupPaymentForm(false);
    sendMessage("I've set up my payment account to receive shipping payments.");
    toast.success(
      "Stripe account setup initiated. Complete the process in the new tab."
    );
    setNeedsSetupPayment(false);
  }, [sendMessage]);

  const showPaymentOption = useMemo(() => {
    if (!claimInfo) return false;

    // Show payment option if:
    // 1. The claim exists (accepted or not)
    // 2. The current user is the claimer (they need to pay)
    // 3. The payment hasn't been made yet (status is not 'paid', 'shipped', or 'delivered')
    return (
      claimInfo.isUserClaimer &&
      !["paid", "shipped", "delivered"].includes(claimInfo.status)
    );
  }, [claimInfo]);

  // Use the stable state value for rendering to prevent flickering
  const showPaymentButton = useMemo(() => {
    return showPaymentOption && !showPaymentForm && !showSetupPaymentForm;
  }, [showPaymentOption, showPaymentForm, showSetupPaymentForm]);

  // Use the stable value for account status
  const accountStatus = useMemo(() => {
    return stableFinderStripeAccount !== null
      ? stableFinderStripeAccount
      : hasFinderStripeAccount;
  }, [stableFinderStripeAccount, hasFinderStripeAccount]);

  return (
    <div
      className='flex flex-col h-full w-full bg-background text-foreground antialiased'
      onClick={handleChatFocus}
      onFocus={handleChatFocus}
    >
      {/* Setup payment account banner for finders */}
      {needsSetupPayment && !claimInfo?.isUserClaimer && (
        <Alert className='m-2 mb-0 bg-muted/50'>
          <CreditCard className='h-4 w-4' />
          <AlertTitle>Payment account setup required</AlertTitle>
          <AlertDescription className='flex flex-col gap-2'>
            <span>
              You need to set up a payment account to receive shipping fees from
              the claimer.
            </span>
            <Button
              variant='outline'
              size='sm'
              className='self-start'
              onClick={() => setShowSetupPaymentForm(true)}
            >
              Set up payment account
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Messages */}
      <div ref={containerRef} className='flex-1 overflow-y-auto p-4 space-y-4'>
        {unreadCount > 0 && (
          <div
            className='sticky top-2 z-10 text-center mx-auto mb-2'
            onClick={markMessagesAsRead}
          >
            <div className='inline-flex items-center px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-sm cursor-pointer hover:bg-primary/90 transition-colors'>
              {unreadCount} new {unreadCount === 1 ? "message" : "messages"}
            </div>
          </div>
        )}

        {showPaymentForm ? (
          <div className='w-full py-4'>
            <ShippingPaymentWrapper
              claimId={claimInfo?.id || ""}
              itemTitle={claimInfo?.itemTitle || ""}
              onComplete={handlePaymentComplete}
              onCancel={handlePaymentCancel}
            />
          </div>
        ) : showSetupPaymentForm ? (
          <div className='w-full py-4'>
            <SetupPaymentAccount onComplete={handleSetupComplete} />
          </div>
        ) : isLoading ? (
          <div className='flex items-center justify-center h-full'>
            <div className='flex flex-col items-center'>
              <div className='animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary'></div>
              <p className='mt-2 text-sm text-muted-foreground'>
                Loading messages...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className='text-center py-4 text-destructive'>
            <p className='mb-2 font-medium'>{error}</p>
            <p className='text-sm text-muted-foreground'>
              Please try refreshing the page.
            </p>
          </div>
        ) : allMessages.length === 0 ? (
          <div className='text-center text-sm text-muted-foreground'>
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className='space-y-1'>
            {allMessages.map((message, index) => {
              const prevMessage = index > 0 ? allMessages[index - 1] : null;
              const showHeader =
                !prevMessage || prevMessage.user.name !== message.user.name;

              return (
                <div
                  key={message.id}
                  className='animate-in fade-in slide-in-from-bottom-4 duration-300'
                >
                  <ChatMessageItem
                    message={message}
                    isOwnMessage={message.user.name === username}
                    showHeader={showHeader}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment Button or Chat Input */}
      {showPaymentButton ? (
        <div className='border-t border-border p-4'>
          <div className='mb-2 text-sm text-muted-foreground'>
            {claimInfo?.status === "accepted"
              ? accountStatus === false
                ? "The finder needs to set up their payment account before you can pay for shipping. Please ask them to set up their Stripe account."
                : "The claim for this item has been accepted. Please pay for shipping to receive your item."
              : "You can pay for shipping once your claim is accepted."}
          </div>
          <Button
            onClick={() => setShowPaymentForm(true)}
            className='w-full gap-2 mb-3'
            disabled={
              claimInfo?.status !== "accepted" ||
              accountStatus === false ||
              isCheckingStripeAccount
            }
          >
            <DollarSign className='size-4' />
            {isCheckingStripeAccount
              ? "Checking payment availability..."
              : accountStatus === false
              ? "Awaiting finder setup"
              : "Pay for Shipping"}
          </Button>

          {/* Refresh button */}
          {claimInfo?.status === "accepted" && (
            <Button
              onClick={refreshFinderStatus}
              className='w-full gap-2'
              disabled={isCheckingStripeAccount}
            >
              Refresh Finder Status
            </Button>
          )}

          {/* Chat input below the payment button */}
          <form onSubmit={handleSendMessage} className='flex w-full gap-2'>
            <Input
              className={cn(
                "rounded-full bg-background text-sm transition-all duration-300",
                isConnected && newMessage.trim()
                  ? "w-[calc(100%-36px)]"
                  : "w-full"
              )}
              type='text'
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder='Type a message...'
              disabled={!isConnected || isLoading || !!error || showPaymentForm}
            />

            {isConnected && newMessage.trim() && (
              <Button
                className='aspect-square rounded-full animate-in fade-in slide-in-from-right-4 duration-300'
                type='submit'
                disabled={!isConnected || showPaymentForm}
              >
                <Send className='size-4' />
              </Button>
            )}
          </form>
        </div>
      ) : (
        <form
          onSubmit={handleSendMessage}
          className='flex w-full gap-2 border-t border-border p-4'
        >
          <Input
            className={cn(
              "rounded-full bg-background text-sm transition-all duration-300",
              isConnected && newMessage.trim()
                ? "w-[calc(100%-36px)]"
                : claimInfo?.isUserClaimer && claimInfo?.status === "pending"
                ? "w-[calc(100%-44px)]"
                : needsSetupPayment && !claimInfo?.isUserClaimer
                ? "w-[calc(100%-44px)]"
                : "w-full"
            )}
            type='text'
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              isLoading
                ? "Loading messages..."
                : error
                ? "Try refreshing the page"
                : "Type a message..."
            }
            disabled={
              !isConnected ||
              isLoading ||
              !!error ||
              showPaymentForm ||
              showSetupPaymentForm
            }
          />

          {/* Payment setup icon for finders */}
          {needsSetupPayment &&
            !claimInfo?.isUserClaimer &&
            !showSetupPaymentForm && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='rounded-full hover:bg-primary/10 text-yellow-500'
                onClick={() => setShowSetupPaymentForm(true)}
                title='Set up payment account to receive shipping fees'
              >
                <CreditCard className='size-4' />
              </Button>
            )}

          {/* Payment icon in chat input area */}
          {claimInfo && claimInfo.isUserClaimer && !showSetupPaymentForm && (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='rounded-full hover:bg-primary/10'
              onClick={() => setShowPaymentForm(true)}
              disabled={!["pending", "accepted"].includes(claimInfo.status)}
              title={
                claimInfo.status === "accepted"
                  ? "Pay for Shipping"
                  : "Payment option (available after claim is accepted)"
              }
            >
              <DollarSign className='size-4' />
            </Button>
          )}

          {isConnected && newMessage.trim() && !showSetupPaymentForm && (
            <Button
              className='aspect-square rounded-full animate-in fade-in slide-in-from-right-4 duration-300'
              type='submit'
              disabled={!isConnected || showPaymentForm || showSetupPaymentForm}
            >
              <Send className='size-4' />
            </Button>
          )}
        </form>
      )}
    </div>
  );
};
