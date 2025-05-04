"use client";

import {
  useStripe,
  useElements,
  Elements,
  PaymentElement,
} from "@stripe/react-stripe-js";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatAmountForDisplay, getStripe } from "@/lib/stripe";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Load Stripe outside of the component to avoid recreation
const stripePromise = getStripe();
// Check if Stripe is initialized properly
const isStripeReady = stripePromise !== null;

/**
 * Interface representing a shipping address
 */
interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Base interface for shipping payment form props
 */
interface ShippingPaymentFormProps {
  claimId: string;
  itemTitle: string;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * Shipping configuration interface
 */
interface ShippingConfig {
  default_shipping_fee: number;
  allow_claimer_custom: boolean;
  min_shipping_fee: number;
  max_shipping_fee: number;
  allow_tipping: boolean;
  shipping_notes?: string;
  isDefaultConfig?: boolean;
  isSystemDefault?: boolean;
}

// Wrapper component that provides Stripe Elements
export function ShippingPaymentWrapper({
  claimId,
  itemTitle,
  onComplete,
  onCancel,
}: ShippingPaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string>("");

  if (!isStripeReady) {
    return (
      <Card className='w-full max-w-lg mx-auto shadow-md'>
        <CardHeader>
          <CardTitle>Payment Error</CardTitle>
          <CardDescription>
            We encountered an issue setting up the payment system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Payment Configuration Missing</AlertTitle>
            <AlertDescription>
              The payment system has not been properly configured. Please
              contact support.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button variant='outline' onClick={onCancel} className='w-full'>
            Return to Chat
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className='w-full max-w-lg mx-auto'>
      {clientSecret ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <ShippingPaymentForm
            claimId={claimId}
            itemTitle={itemTitle}
            clientSecret={clientSecret}
            onComplete={onComplete}
            onCancel={onCancel}
          />
        </Elements>
      ) : (
        <ShippingPaymentSetup
          claimId={claimId}
          itemTitle={itemTitle}
          onClientSecret={setClientSecret}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

// Component to collect shipping and payment details
interface ShippingPaymentSetupProps {
  claimId: string;
  itemTitle: string;
  onClientSecret: (secret: string) => void;
  onCancel: () => void;
}

function ShippingPaymentSetup({
  claimId,
  itemTitle,
  onClientSecret,
  onCancel,
}: ShippingPaymentSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [shippingFee, setShippingFee] = useState(500); // Default $5.00
  const [tipAmount, setTipAmount] = useState(0); // Default $0
  const [address, setAddress] = useState<ShippingAddress>({
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(
    null
  );
  const [configError, setConfigError] = useState<string | null>(null);

  // Fetch shipping configuration when the component mounts
  useEffect(() => {
    const fetchShippingConfig = async () => {
      setIsLoadingConfig(true);
      setConfigError(null);

      try {
        const response = await fetch(
          `/api/stripe/shipping-config?claimId=${encodeURIComponent(claimId)}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Error loading shipping config:", errorData);
          setConfigError(
            "Could not load shipping options. Using default values."
          );
          // Use default values
          setShippingFee(500); // $5.00
          return;
        }

        const config = await response.json();
        setShippingConfig(config);

        // Set initial values based on the configuration
        setShippingFee(config.default_shipping_fee);

        if (!config.allow_tipping) {
          setTipAmount(0);
        }
      } catch (error) {
        console.error("Failed to fetch shipping configuration:", error);
        setConfigError(
          "Could not connect to the payment server. Please try again later."
        );
      } finally {
        setIsLoadingConfig(false);
      }
    };

    fetchShippingConfig();
  }, [claimId]);

  // Handle shipping fee input change (convert to cents)
  const handleShippingFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dollars = parseFloat(e.target.value) || 0;
    const cents = Math.round(dollars * 100); // Convert to cents

    // Apply min/max constraints if custom fees are allowed
    if (shippingConfig?.allow_claimer_custom) {
      const min = shippingConfig.min_shipping_fee;
      const max = shippingConfig.max_shipping_fee;

      if (cents < min) {
        setShippingFee(min);
      } else if (cents > max) {
        setShippingFee(max);
      } else {
        setShippingFee(cents);
      }
    } else {
      // If custom fees are not allowed, reset to default
      setShippingFee(shippingConfig?.default_shipping_fee || 500);
    }
  };

  // Handle tip amount input change (convert to cents)
  const handleTipAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!shippingConfig?.allow_tipping) {
      return;
    }

    const dollars = parseFloat(e.target.value) || 0;
    setTipAmount(Math.round(dollars * 100)); // Convert to cents
  };

  // Handle address field changes
  const handleAddressChange = (field: keyof ShippingAddress, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
  };

  // Validate address fields
  const validateAddress = (): boolean => {
    if (!address.line1.trim()) {
      toast.error("Please enter a street address");
      return false;
    }
    if (!address.city.trim()) {
      toast.error("Please enter a city");
      return false;
    }
    if (!address.state.trim()) {
      toast.error("Please enter a state");
      return false;
    }
    if (!address.postalCode.trim()) {
      toast.error("Please enter a postal code");
      return false;
    }
    // Could add regex validation for postal code here
    return true;
  };

  // Calculate total amount
  const totalAmount = shippingFee + tipAmount;
  const platformFee = Math.round(totalAmount * 0.1); // 10% platform fee

  // Create payment intent when ready
  const handleContinue = async () => {
    // Validate shipping address
    if (!validateAddress()) {
      return;
    }

    // Validate shipping fee
    if (shippingFee < 100) {
      // Minimum $1.00 shipping fee
      toast.error("Shipping fee must be at least $1.00.");
      return;
    }

    // Check shipping fee against allowed range if custom fees are enabled
    if (shippingConfig?.allow_claimer_custom) {
      if (shippingFee < shippingConfig.min_shipping_fee) {
        toast.error(
          `Shipping fee must be at least ${formatAmountForDisplay(
            shippingConfig.min_shipping_fee
          )}.`
        );
        setShippingFee(shippingConfig.min_shipping_fee);
        return;
      }

      if (shippingFee > shippingConfig.max_shipping_fee) {
        toast.error(
          `Shipping fee cannot exceed ${formatAmountForDisplay(
            shippingConfig.max_shipping_fee
          )}.`
        );
        setShippingFee(shippingConfig.max_shipping_fee);
        return;
      }
    }

    setIsLoading(true);

    try {
      // Create payment intent
      const response = await fetch("/api/stripe/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claimId,
          shippingFee,
          tipAmount,
          shippingAddress: address,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment");
      }

      // Get client secret
      onClientSecret(data.clientSecret);
    } catch (error: any) {
      console.error("Payment setup error:", error);
      toast.error(
        error.message || "An unexpected error occurred while setting up payment"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className='w-full shadow-md'>
      <CardHeader>
        <CardTitle>Pay for Shipping</CardTitle>
        <CardDescription>
          Pay the shipping fee to have the item &quot;{itemTitle}&quot; sent to
          you.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {configError && (
          <Alert variant='warning' className='mb-4'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Configuration Issue</AlertTitle>
            <AlertDescription>{configError}</AlertDescription>
          </Alert>
        )}

        <div className='space-y-2'>
          <Label htmlFor='shippingAddress'>Shipping Address</Label>
          <Input
            id='line1'
            placeholder='Street Address'
            value={address.line1}
            onChange={(e) => handleAddressChange("line1", e.target.value)}
            required
            className='focus:border-primary'
          />
          <Input
            id='line2'
            placeholder='Apt, Suite, etc. (optional)'
            value={address.line2}
            onChange={(e) => handleAddressChange("line2", e.target.value)}
          />
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
            <Input
              id='city'
              placeholder='City'
              value={address.city}
              onChange={(e) => handleAddressChange("city", e.target.value)}
              required
            />
            <Input
              id='state'
              placeholder='State'
              value={address.state}
              onChange={(e) => handleAddressChange("state", e.target.value)}
              required
            />
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
            <Input
              id='postalCode'
              placeholder='Postal Code'
              value={address.postalCode}
              onChange={(e) =>
                handleAddressChange("postalCode", e.target.value)
              }
              required
            />
            <Input
              id='country'
              placeholder='Country'
              value={address.country}
              onChange={(e) => handleAddressChange("country", e.target.value)}
              required
            />
          </div>
        </div>

        <Separator />

        {isLoadingConfig ? (
          <div className='text-center py-2'>
            <div className='animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mx-auto'></div>
            <p className='text-sm text-muted-foreground mt-2'>
              Loading shipping options...
            </p>
          </div>
        ) : (
          <>
            <div className='space-y-2'>
              <Label htmlFor='shippingFee'>
                Shipping Fee ($)
                {!shippingConfig?.allow_claimer_custom && (
                  <span className='text-xs text-muted-foreground ml-2'>
                    (Fixed by the finder)
                  </span>
                )}
              </Label>
              <Input
                id='shippingFee'
                type='number'
                min={(shippingConfig?.min_shipping_fee || 100) / 100}
                max={(shippingConfig?.max_shipping_fee || 10000) / 100}
                step='0.01'
                value={(shippingFee / 100).toFixed(2)}
                onChange={handleShippingFeeChange}
                disabled={!shippingConfig?.allow_claimer_custom}
              />
              {shippingConfig?.allow_claimer_custom && (
                <p className='text-xs text-muted-foreground'>
                  Allowed range:{" "}
                  {formatAmountForDisplay(shippingConfig.min_shipping_fee)} -{" "}
                  {formatAmountForDisplay(shippingConfig.max_shipping_fee)}
                </p>
              )}
            </div>

            {shippingConfig?.shipping_notes && (
              <Alert>
                <AlertTitle>Shipping Notes from the Finder</AlertTitle>
                <AlertDescription>
                  {shippingConfig.shipping_notes}
                </AlertDescription>
              </Alert>
            )}

            {shippingConfig?.allow_tipping && (
              <div className='space-y-2'>
                <Label htmlFor='tipAmount'>Tip Amount (Optional)</Label>
                <Input
                  id='tipAmount'
                  type='number'
                  min='0'
                  step='0.01'
                  value={(tipAmount / 100).toFixed(2)}
                  onChange={handleTipAmountChange}
                  disabled={!shippingConfig.allow_tipping}
                />
                <p className='text-sm text-muted-foreground'>
                  Add a tip to thank the finder for returning your item.
                </p>
              </div>
            )}
          </>
        )}

        <div className='pt-2 bg-muted/30 p-4 rounded-md'>
          <div className='flex justify-between text-sm'>
            <span>Shipping Fee:</span>
            <span className='font-medium'>
              {formatAmountForDisplay(shippingFee)}
            </span>
          </div>
          {tipAmount > 0 && (
            <div className='flex justify-between text-sm'>
              <span>Tip:</span>
              <span className='font-medium'>
                {formatAmountForDisplay(tipAmount)}
              </span>
            </div>
          )}
          <div className='flex justify-between text-sm'>
            <span>Platform Fee (10%):</span>
            <span className='font-medium'>
              {formatAmountForDisplay(platformFee)}
            </span>
          </div>
          <Separator className='my-2' />
          <div className='flex justify-between font-medium'>
            <span>Total:</span>
            <span className='text-lg'>
              {formatAmountForDisplay(totalAmount)}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className='flex flex-col sm:flex-row gap-2 justify-between'>
        <Button
          variant='outline'
          onClick={onCancel}
          disabled={isLoading}
          className='w-full sm:w-auto'
        >
          Cancel
        </Button>
        <Button
          onClick={handleContinue}
          disabled={isLoading || isLoadingConfig}
          className='w-full sm:w-auto'
        >
          {isLoading ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Processing...
            </>
          ) : (
            "Continue to Payment"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

// Component to handle the actual payment using Stripe Elements
interface ShippingPaymentFormWithSecretProps extends ShippingPaymentFormProps {
  clientSecret: string;
}

function ShippingPaymentForm({
  clientSecret,
  itemTitle,
  claimId,
  onComplete,
  onCancel,
}: ShippingPaymentFormWithSecretProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setPaymentError(null);
    setPaymentStatus("processing");

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/messages`, // Redirect after payment
        },
        redirect: "if_required", // Only redirect for 3D Secure, etc.
      });

      if (error) {
        setPaymentStatus("error");
        setPaymentError(
          error.message || "An error occurred while processing your payment"
        );
        toast.error(error.message || "Payment failed. Please try again.");
      } else if (paymentIntent) {
        if (paymentIntent.status === "succeeded") {
          // Payment succeeded immediately!
          setPaymentStatus("success");
          toast.success("Payment completed successfully!");
          onComplete();
        } else if (paymentIntent.status === "processing") {
          // Payment still processing - show processing state
          setIsProcessing(true);
          toast.info(
            "Your payment is being processed. This may take a moment..."
          );

          // Poll for payment status in case webhook is delayed
          checkPaymentStatus(claimId);
        } else if (paymentIntent.status === "requires_payment_method") {
          setPaymentStatus("error");
          toast.error("Your payment was not successful, please try again.");
        }
      }
    } catch (error: any) {
      setPaymentStatus("error");
      setPaymentError(error.message || "An unexpected error occurred");
      toast.error(
        error.message || "An unexpected error occurred while processing payment"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Function to check payment status by polling
  const checkPaymentStatus = async (claimId: string) => {
    try {
      // Poll the claim status a few times with delays
      let attempts = 0;
      const maxAttempts = 5;
      const pollInterval = 2000; // 2 seconds

      const checkStatus = async () => {
        attempts++;
        const response = await fetch(
          `/api/stripe/check-payment?claimId=${encodeURIComponent(claimId)}`,
          {
            method: "GET",
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.status === "paid" || data.status === "succeeded") {
            setPaymentStatus("success");
            toast.success("Payment completed successfully!");
            onComplete();
            return true;
          }

          if (data.status === "failed") {
            setPaymentStatus("error");
            toast.error("Payment failed. Please try again.");
            return true;
          }
        }

        if (attempts >= maxAttempts) {
          toast.info(
            "Payment is still being processed. Please check your messages later."
          );
          onComplete(); // Exit payment form anyway to prevent user from being stuck
          return true;
        }

        return false;
      };

      const poll = async () => {
        const finished = await checkStatus();
        if (!finished) {
          setTimeout(poll, pollInterval);
        }
      };

      poll();
    } catch (error) {
      console.error("Error checking payment status:", error);
      // If polling fails, assume success for UX and let webhook handle actual state
      toast.info("Payment is being processed. You can continue chatting.");
      onComplete();
    }
  };

  // Get current status message to display
  const getStatusMessage = () => {
    switch (paymentStatus) {
      case "processing":
        return "Your payment is being processed...";
      case "success":
        return "Payment successful! Redirecting...";
      case "error":
        return paymentError || "An error occurred. Please try again.";
      default:
        return "";
    }
  };

  return (
    <Card className='w-full shadow-md'>
      <CardHeader>
        <CardTitle>Payment Details</CardTitle>
        <CardDescription>
          Complete your payment for "{itemTitle}"
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id='payment-form' onSubmit={handleSubmit}>
          <PaymentElement className='mb-6' />

          {paymentError && (
            <Alert variant='destructive' className='mb-4'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Payment Error</AlertTitle>
              <AlertDescription>{paymentError}</AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <Alert className='mb-4'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <AlertTitle>Payment is processing</AlertTitle>
              <AlertDescription>
                Your payment is being processed. This may take a moment.
              </AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
      <CardFooter className='flex flex-col sm:flex-row gap-2 justify-between'>
        <Button
          variant='outline'
          onClick={onCancel}
          disabled={isLoading || isProcessing || paymentStatus === "success"}
          type='button'
          className='w-full sm:w-auto'
        >
          Back
        </Button>
        <Button
          form='payment-form'
          type='submit'
          disabled={
            !stripe ||
            !elements ||
            isLoading ||
            isProcessing ||
            paymentStatus === "success"
          }
          className='w-full sm:w-auto'
        >
          {isLoading ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Processing...
            </>
          ) : (
            "Pay Now"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
