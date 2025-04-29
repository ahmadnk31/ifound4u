"use client";

import React, { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ItemType } from "./item-card";

// Define the schema for the claim form
const claimFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Please enter a valid email address" }),
  phone: z.string().optional(),
  description: z
    .string()
    .min(10, { message: "Description must be at least 10 characters" })
    .max(500, { message: "Description can't be more than 500 characters" }),
});

type ClaimFormValues = z.infer<typeof claimFormSchema>;

interface ClaimItemDialogProps {
  item: ItemType;
  onClose: () => void;
  onChatStarted: (chatRoomId: string) => void;
}

export function ClaimItemDialog({
  item,
  onClose,
  onChatStarted,
}: ClaimItemDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createClient();

  const form = useForm<ClaimFormValues>({
    resolver: zodResolver(claimFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      description: `Hi, I believe I lost this ${item.category} that you found. I can provide more details to verify it's mine.`,
    },
  });

  // Check if user is authenticated and prefill form
  React.useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (data?.session?.user) {
        const { user } = data.session;
        form.setValue("email", user.email || "");

        // Try to get user metadata for name and phone
        if (user.user_metadata?.displayName) {
          form.setValue("name", user.user_metadata.displayName);
        }
        if (user.user_metadata?.phoneNumber) {
          form.setValue("phone", user.user_metadata.phoneNumber);
        }
      }
    };

    checkAuth();
  }, [form, supabase.auth]);

  const onSubmit = async (values: ClaimFormValues) => {
    try {
      setIsSubmitting(true);

      // Get authenticated user if available
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id; // Will be null for unregistered users

      // Create a unique chat room ID based on the item ID and claim timestamp
      const timestamp = new Date().toISOString();
      const chatRoomId = `item_${item.id}_${timestamp}`;

      // Instead of direct database access, use a server-side API route
      // that handles the claim submission with proper authorization
      const response = await fetch("/api/submit-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          claimer_name: values.name,
          claimer_email: values.email,
          claimer_phone: values.phone || null,
          claim_description: values.description,
          user_id: userId || null,
          chat_room_id: chatRoomId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to submit claim");
      }

      // Send notification email to item owner about the claim
      try {
        await fetch("/api/send-claim-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            itemTitle: item.title,
            claimerName: values.name,
            claimerEmail: values.email,
            claimDescription: values.description,
            chatRoomId,
          }),
        });
      } catch (emailError) {
        console.error("Failed to send claim notification email:", emailError);
        // Don't fail the whole process if just the email fails
      }

      toast.success("Claim submitted successfully");

      // For unregistered users, show a message about checking email
      if (!userId) {
        toast.info("Check your email for updates about your claim");
        onClose(); // Close the dialog
      } else {
        // For logged-in users, redirect to chat as before
        onChatStarted(chatRoomId);
      }
    } catch (error) {
      console.error("Error submitting claim:", error);
      toast.error("Failed to submit claim. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Claim This Item</DialogTitle>
          <DialogDescription>
            Provide information to verify this is your item. This will start a
            conversation with the finder.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Name</FormLabel>
                  <FormControl>
                    <Input placeholder='Full name' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='Your email address'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    We'll use this to notify you about your claim
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='phone'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder='Your phone number' {...field} />
                  </FormControl>
                  <FormDescription>
                    Alternative way to contact you if needed
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verification Details</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Describe why you believe this is your item and provide any details that can help verify your claim'
                      className='min-h-[100px]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Include specific details about the item that only the owner
                    would know
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button variant='outline' type='button' onClick={onClose}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Submitting...
                  </>
                ) : (
                  "Submit Claim"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
