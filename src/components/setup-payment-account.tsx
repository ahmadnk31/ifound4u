"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { ExternalLink, CreditCard, TruckIcon } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShippingConfigForm } from "@/components/shipping-config-form";

interface SetupPaymentAccountProps {
  onComplete?: () => void;
  claimId?: string;
  itemId?: string;
  defaultTab?: "account" | "shipping";
}

export function SetupPaymentAccount({
  onComplete,
  claimId,
  itemId,
  defaultTab = "account",
}: SetupPaymentAccountProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [directLink, setDirectLink] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const setupStripeAccount = async () => {
    setIsLoading(true);
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
            "Popup was blocked. Please click the button below to open the Stripe setup page.",
            { duration: 6000 }
          );

          // Show direct link button
          setDirectLink(data.accountLinkUrl);
        } else {
          toast.success(
            "Stripe account setup initiated. Complete the onboarding process in the new tab."
          );

          // Notify parent component
          if (onComplete) {
            onComplete();
          }
        }
      }
    } catch (error: any) {
      console.error("Stripe setup error:", error);
      toast.error(error.message || "Failed to set up Stripe account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleShippingConfigComplete = () => {
    toast.success("Shipping options saved successfully");
    // Notify parent component
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle>Payment & Shipping Setup</CardTitle>
        <CardDescription>
          Configure your payment account and shipping options
        </CardDescription>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
        <TabsList className='grid w-full grid-cols-2'>
          <TabsTrigger value='account' className='flex items-center gap-2'>
            <CreditCard className='h-4 w-4' />
            <span>Stripe Account</span>
          </TabsTrigger>
          <TabsTrigger value='shipping' className='flex items-center gap-2'>
            <TruckIcon className='h-4 w-4' />
            <span>Shipping Options</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value='account'>
          <CardContent className='pt-6'>
            <p className='text-sm'>
              Before users can pay you for shipping, you need to connect a
              Stripe account. This is a quick process that allows you to receive
              payments securely.
            </p>
            {directLink && (
              <div className='mt-4'>
                <Button asChild>
                  <Link
                    href={directLink}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='w-full'
                  >
                    Open Stripe Setup Page
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter>
            <Button
              onClick={setupStripeAccount}
              disabled={isLoading}
              className='w-full gap-2'
            >
              {isLoading ? "Setting up..." : "Set Up Stripe Account"}
              {!isLoading && <ExternalLink className='h-4 w-4' />}
            </Button>
          </CardFooter>
        </TabsContent>

        <TabsContent value='shipping' className='p-0'>
          <ShippingConfigForm
            claimId={claimId}
            itemId={itemId}
            onComplete={handleShippingConfigComplete}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
