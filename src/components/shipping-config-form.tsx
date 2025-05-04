"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/client";
import { toast } from "sonner";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Define form schema for validation
const shippingFormSchema = z.object({
  defaultShippingFee: z.coerce
    .number()
    .min(1, "Shipping fee must be at least $1")
    .max(1000, "Shipping fee cannot exceed $1000"),
  allowClaimerCustom: z.boolean().default(true),
  minShippingFee: z.coerce
    .number()
    .min(0, "Minimum shipping fee cannot be negative"),
  maxShippingFee: z.coerce
    .number()
    .min(0, "Maximum shipping fee cannot be negative"),
  allowTipping: z.boolean().default(true),
  shippingNotes: z
    .string()
    .max(500, "Notes cannot exceed 500 characters")
    .optional(),
});

type ShippingFormValues = z.infer<typeof shippingFormSchema>;

interface ShippingConfigFormProps {
  claimId?: string; // Optional: to configure for a specific claim
  itemId?: string; // Optional: to configure for a specific item
  onComplete?: () => void;
}

export function ShippingConfigForm({
  claimId,
  itemId,
  onComplete,
}: ShippingConfigFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  // Initialize form with default values
  const form = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingFormSchema),
    defaultValues: {
      defaultShippingFee: 5, // Default $5.00
      allowClaimerCustom: true,
      minShippingFee: 3, // Default $3.00 minimum
      maxShippingFee: 20, // Default $20.00 maximum
      allowTipping: true,
      shippingNotes: "",
    },
  });

  // Load existing shipping configuration if available
  useEffect(() => {
    const loadShippingConfig = async () => {
      setIsLoading(true);

      try {
        let query = supabase.from("shipping_configs").select("*");

        if (claimId) {
          query = query.eq("claim_id", claimId);
        } else if (itemId) {
          query = query.eq("item_id", itemId);
        } else {
          // Get the current user's ID
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;

          // Get the user's default config
          query = query
            .eq("user_id", user.id)
            .is("item_id", null)
            .is("claim_id", null);
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
          console.error("Error loading shipping configuration:", error);
          return;
        }

        if (data) {
          // Convert cents to dollars for display
          form.reset({
            defaultShippingFee: data.default_shipping_fee / 100,
            allowClaimerCustom: data.allow_claimer_custom,
            minShippingFee: data.min_shipping_fee / 100,
            maxShippingFee: data.max_shipping_fee / 100,
            allowTipping: data.allow_tipping,
            shippingNotes: data.shipping_notes || "",
          });
        }
      } catch (error) {
        console.error("Error loading shipping config:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadShippingConfig();
  }, [claimId, itemId, supabase, form]);

  // Handle form submission
  const onSubmit = async (values: ShippingFormValues) => {
    setIsLoading(true);

    try {
      // Convert dollar amounts to cents for storage
      const dataToSave = {
        default_shipping_fee: Math.round(values.defaultShippingFee * 100),
        allow_claimer_custom: values.allowClaimerCustom,
        min_shipping_fee: Math.round(values.minShippingFee * 100),
        max_shipping_fee: Math.round(values.maxShippingFee * 100),
        allow_tipping: values.allowTipping,
        shipping_notes: values.shippingNotes || "",
      };

      // Get the current user's ID
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to save shipping configuration");
        return;
      }

      // Determine if this is for a specific claim, item, or the user's default
      const configData = {
        ...dataToSave,
        user_id: user.id,
        claim_id: claimId || null,
        item_id: itemId || null,
      };

      // Upsert the shipping configuration
      let query;

      if (claimId || itemId) {
        // Use direct upsert for claim or item specific configs
        query = supabase.from("shipping_configs").upsert({
          ...configData,
          updated_at: new Date().toISOString(),
        });
      } else {
        // For user default, check if one already exists
        const { data: existingConfig } = await supabase
          .from("shipping_configs")
          .select("id")
          .eq("user_id", user.id)
          .is("item_id", null)
          .is("claim_id", null)
          .maybeSingle();

        if (existingConfig) {
          query = supabase
            .from("shipping_configs")
            .update({ ...dataToSave, updated_at: new Date().toISOString() })
            .eq("id", existingConfig.id);
        } else {
          query = supabase
            .from("shipping_configs")
            .insert({
              ...configData,
              created_at: new Date().toISOString(),
            });
        }
      }

      const { error } = await query;

      toast.success("Shipping configuration saved successfully");

      // Notify parent component if needed
      if (onComplete) {
        onComplete();
      }
    } catch (error: any) {
      console.error("Error saving shipping configuration:", error);
      toast.error(error.message || "Failed to save shipping configuration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle>Configure Shipping Options</CardTitle>
        <CardDescription>
          Set your preferred shipping options for item returns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='basic'>
          <TabsList className='mb-4'>
            <TabsTrigger value='basic'>Basic Settings</TabsTrigger>
            <TabsTrigger value='advanced'>Advanced</TabsTrigger>
          </TabsList>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              <TabsContent value='basic' className='space-y-4'>
                <FormField
                  control={form.control}
                  name='defaultShippingFee'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Shipping Fee ($)</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          step='0.01'
                          placeholder='5.00'
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormDescription>
                        The standard shipping fee you&apos;ll charge for returning
                        items
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='allowTipping'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>Allow Tipping</FormLabel>
                        <FormDescription>
                          Let claimers add a tip when paying for shipping
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='shippingNotes'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shipping Notes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='Any special instructions for shipping'
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional notes about your shipping process (visible to
                        claimers)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value='advanced' className='space-y-4'>
                <FormField
                  control={form.control}
                  name='allowClaimerCustom'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>Allow Custom Shipping Fee</FormLabel>
                        <FormDescription>
                          Let claimers adjust the shipping fee within your
                          min/max range
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <div className='grid grid-cols-2 gap-4'>
                  <FormField
                    control={form.control}
                    name='minShippingFee'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Shipping Fee ($)</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            step='0.01'
                            placeholder='3.00'
                            {...field}
                            disabled={
                              isLoading || !form.watch("allowClaimerCustom")
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='maxShippingFee'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maximum Shipping Fee ($)</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            step='0.01'
                            placeholder='20.00'
                            {...field}
                            disabled={
                              isLoading || !form.watch("allowClaimerCustom")
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <CardFooter className='px-0'>
                <Button type='submit' className='w-full' disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Shipping Configuration"}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
