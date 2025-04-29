"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import { ExternalLink, CheckCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export function StripeAccountSetup() {
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [hasStripeAccount, setHasStripeAccount] = useState(false);
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [directLink, setDirectLink] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") === "true";

  // Check if we've just returned from Stripe onboarding
  useEffect(() => {
    if (success) {
      // Start polling for account status updates
      startPollingForAccountStatus();
      toast.info("Verifying account status with Stripe...");
    }
  }, [success]);

  // Function to poll for account status updates after successful onboarding
  const startPollingForAccountStatus = () => {
    setIsPolling(true);

    // Try checking the account status multiple times
    let attempts = 0;
    const maxAttempts = 5;
    const pollInterval = 2000; // 2 seconds between checks

    const pollForStatus = () => {
      if (attempts >= maxAttempts) {
        setIsPolling(false);
        toast.info(
          "Account verification complete. If your account status hasn't updated, please click 'Refresh Account Status'."
        );
        return;
      }

      attempts++;
      setRefreshCounter((prev) => prev + 1);

      // Continue polling if account isn't enabled yet and we haven't reached max attempts
      setTimeout(() => {
        if (!accountEnabled && isPolling) {
          pollForStatus();
        } else {
          setIsPolling(false);
          if (accountEnabled) {
            toast.success(
              "Your Stripe account is now fully verified and ready to receive payments!"
            );
          }
        }
      }, pollInterval);
    };

    pollForStatus();
  };

  useEffect(() => {
    const checkStripeAccount = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        // First, directly check the Stripe account status on the server
        if (success || isPolling || refreshCounter > 0) {
          try {
            const response = await fetch("/api/stripe/account-status", {
              method: "GET",
            });

            if (response.ok) {
              // This will force a refresh from the Stripe API
              console.log("Checked Stripe account status directly");
            }
          } catch (error) {
            console.error("Error refreshing Stripe status:", error);
          }
        }

        const { data: account } = await supabase
          .from("user_payment_accounts")
          .select("stripe_account_id, account_enabled, is_onboarded")
          .eq("user_id", user.id)
          .single();

        if (account) {
          setHasStripeAccount(!!account.stripe_account_id);
          setAccountEnabled(!!account.account_enabled);

          // If we're polling and account is now enabled, we can stop polling
          if (account.account_enabled && isPolling) {
            setIsPolling(false);
            toast.success("Your account is now fully verified!");
          }
        } else {
          setHasStripeAccount(false);
          setAccountEnabled(false);
        }
      } catch (error) {
        console.error("Error checking Stripe account:", error);
      } finally {
        setLoading(false);
      }
    };

    checkStripeAccount();
  }, [supabase, refreshCounter, success, isPolling]);

  const setupStripeAccount = async () => {
    setSetupLoading(true);
    setDirectLink(null); // Reset direct link

    try {
      const response = await fetch("/api/stripe/create-account", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create Stripe account");
      }

      // Redirect to Stripe's onboarding flow
      if (data.accountLinkUrl) {
        // Try to open in a new window with specific size to avoid popup blockers
        const stripeWindow = window.open(
          data.accountLinkUrl,
          "stripeConnect",
          "width=1000,height=800,left=100,top=100"
        );

        // If popup was blocked, provide a direct link
        if (
          !stripeWindow ||
          stripeWindow.closed ||
          typeof stripeWindow.closed === "undefined"
        ) {
          toast.error(
            "Popup was blocked. Please click the link below to open the Stripe setup page.",
            { duration: 6000 }
          );

          // Show direct link
          setDirectLink(data.accountLinkUrl);
        } else {
          toast.success(
            "Stripe account setup initiated. Complete the onboarding process in the new tab."
          );
        }
        setRefreshCounter((prev) => prev + 1);
      }
    } catch (error: any) {
      console.error("Stripe setup error:", error);
      toast.error(error.message || "Failed to set up Stripe account");
    } finally {
      setSetupLoading(false);
    }
  };

  const refreshAccountStatus = async () => {
    setRefreshCounter((prev) => prev + 1);
    toast.info("Checking account status...");

    try {
      const response = await fetch("/api/stripe/account-status?force=true", {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.accountEnabled) {
          toast.success(
            "Your account is verified and ready to receive payments!"
          );
        } else {
          toast.info("Your account is still pending verification.");
        }
      }
    } catch (error) {
      console.error("Error refreshing account status:", error);
    }
  };

  if (loading || isPolling) {
    return (
      <div className='flex flex-col items-center justify-center p-8 space-y-4'>
        <div className='h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent'></div>
        <p className='text-sm text-muted-foreground'>
          {isPolling ? "Verifying account status with Stripe..." : "Loading..."}
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Settings</CardTitle>
        <CardDescription>
          Set up your Stripe account to receive payments for shipping found
          items
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {hasStripeAccount ? (
          <div className='space-y-4'>
            <div className='flex items-start space-x-3'>
              {accountEnabled ? (
                <CheckCircle className='h-5 w-5 text-green-500 mt-0.5' />
              ) : (
                <div className='h-5 w-5 rounded-full border-2 border-amber-500 flex items-center justify-center'>
                  <span className='block h-3 w-3 rounded-full bg-amber-500'></span>
                </div>
              )}
              <div>
                <p className='font-medium'>
                  {accountEnabled
                    ? "Your Stripe account is fully set up"
                    : "Your Stripe account is pending"}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {accountEnabled
                    ? "You can now receive payments for shipping found items"
                    : "Please complete the onboarding process to receive payments"}
                </p>
              </div>
            </div>

            {!accountEnabled && (
              <div className='flex flex-col gap-2'>
                <p className='text-sm text-muted-foreground'>
                  If you&apos;ve already completed the onboarding but your
                  account status hasn&apos;t updated:
                </p>
                <Button
                  variant='outline'
                  onClick={refreshAccountStatus}
                  className='w-full sm:w-auto'
                >
                  Refresh Account Status
                </Button>

                {directLink && (
                  <div className='mt-2'>
                    <p className='text-sm text-muted-foreground mb-2'>
                      If your onboarding was interrupted, continue setting up
                      your account:
                    </p>
                    <Button asChild variant='secondary'>
                        <Link
                      as='a'
                      href={directLink}
                      target='_blank'
                      rel='noopener noreferrer'
                      
                      className='w-full sm:w-auto'
                    >
                      <ExternalLink className='h-4 w-4 mr-2' />
                      Continue Stripe Setup
                    </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className='space-y-4'>
            <p>
              To receive payments for shipping found items, you need to connect
              a Stripe account.
            </p>
            <p className='text-sm text-muted-foreground'>
              Stripe is our payment processor that enables secure transactions.
              When someone claims an item you found, they'll pay you directly
              for shipping costs through this platform.
            </p>

            {directLink && (
              <div className='mt-4 p-3 border rounded-md bg-muted/30'>
                <p className='text-sm font-medium mb-2'>
                  Your browser blocked the popup. Please use this link instead:
                </p>
                <Button
                  as='a'
                  href={directLink}
                  target='_blank'
                  rel='noopener noreferrer'
                  variant='secondary'
                  className='w-full'
                >
                  <ExternalLink className='h-4 w-4 mr-2' />
                  Open Stripe Setup Page
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter
        className={hasStripeAccount ? "justify-between" : "justify-end"}
      >
        {hasStripeAccount && !accountEnabled && (
          <Button
            variant='outline'
            onClick={setupStripeAccount}
            disabled={setupLoading}
            className='gap-2'
          >
            <ExternalLink className='h-4 w-4' />
            Complete Onboarding
          </Button>
        )}

        {!hasStripeAccount && (
          <Button
            onClick={setupStripeAccount}
            disabled={setupLoading}
            className='gap-2'
          >
            {setupLoading ? "Setting up..." : "Set Up Stripe Account"}
            {!setupLoading && <ExternalLink className='h-4 w-4' />}
          </Button>
        )}

        {hasStripeAccount && accountEnabled && (
          <p className='text-sm text-muted-foreground'>
            Your account is fully set up and ready to receive payments
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
