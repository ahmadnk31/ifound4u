"use client";

import { StripeAccountSetup } from "@/components/settings/stripe-account-setup";
import { ShippingConfigForm } from "@/components/shipping-config-form";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

export default function PaymentsPage() {
  const searchParams = useSearchParams();
  const success = searchParams?.get("success");
  const refresh = searchParams?.get("refresh");

  useEffect(() => {
    if (success === "true") {
      toast.success("Stripe account setup completed successfully!");
    }
    if (refresh === "true") {
      toast.info(
        "Please complete your Stripe account setup to receive payments."
      );
    }
  }, [success, refresh]);

  return (
    <div className='container max-w-3xl py-10'>
      <h1 className='text-2xl font-bold mb-6'>Payment Settings</h1>
      <div className='space-y-6'>
        <p className='text-muted-foreground'>
          Set up your payment account to receive shipping fees when others claim
          your found items.
        </p>
        <StripeAccountSetup />

        {/* Add shipping configuration form with some spacing */}
        <div className='mt-12'>
          <h2 className='text-xl font-bold mb-4'>Shipping Configuration</h2>
          <p className='text-muted-foreground mb-6'>
            Configure your shipping preferences for when others claim your found
            items.
          </p>
          <ShippingConfigForm
            onComplete={() =>
              toast.success("Shipping settings updated successfully!")
            }
          />
        </div>
      </div>
    </div>
  );
}
