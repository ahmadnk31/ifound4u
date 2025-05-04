"use client";

import React, { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Loader2, AlertTriangle } from "lucide-react";
import { LocationInput } from "./location-input";
import { AIImageUpload } from "./ai-image-upload";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const itemEditSchema = z.object({
  type: z.enum(["lost", "found"]),
  category: z.string().min(1, { message: "Please select a category" }),
  title: z
    .string()
    .min(3, { message: "Title must be at least 3 characters" })
    .max(100),
  description: z
    .string()
    .min(10, { message: "Description must be at least 10 characters" }),
  date: z.date({ required_error: "Please select a date" }),
  location: z.object({
    address: z.string().min(1, { message: "Please enter a location" }),
    latitude: z.number(),
    longitude: z.number(),
    placeId: z.string().optional(),
  }),
  imageUrl: z.string().optional(),
  contactInfo: z.object({
    name: z.string().min(2, { message: "Name is required" }),
    email: z.string().email({ message: "Please enter a valid email" }),
    phone: z.string().optional(),
  }),
});

type ItemEditFormValues = z.infer<typeof itemEditSchema>;

const itemCategories = [
  { value: "electronics", label: "Electronics" },
  { value: "jewelry", label: "Jewelry" },
  { value: "clothing", label: "Clothing" },
  { value: "accessories", label: "Accessories" },
  { value: "pets", label: "Pets" },
  { value: "documents", label: "Documents" },
  { value: "keys", label: "Keys" },
  { value: "bags", label: "Bags and Luggage" },
  { value: "toys", label: "Toys" },
  { value: "books", label: "Books" },
  { value: "money", label: "Money/Wallet" },
  { value: "other", label: "Other" },
];

interface ItemEditFormProps {
  item: {
    id: string;
    type: string;
    category: string;
    title: string;
    description: string;
    date: string;
    location_address: string;
    location_latitude: number;
    location_longitude: number;
    location_place_id?: string;
    image_url?: string;
    contact_info?: {
      name: string;
      email: string;
      phone?: string;
    };
    user_id: string;
  };
}

export function ItemEditForm({ item }: ItemEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageModerated, setImageModerated] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const form = useForm<ItemEditFormValues>({
    resolver: zodResolver(itemEditSchema),
    defaultValues: {
      type: item.type as "lost" | "found",
      category: item.category || "",
      title: item.title || "",
      description: item.description || "",
      date: item.date ? new Date(item.date) : new Date(),
      location: {
        address: item.location_address || "",
        latitude: item.location_latitude || 0,
        longitude: item.location_longitude || 0,
        placeId: item.location_place_id || undefined,
      },
      imageUrl: item.image_url || "",
      contactInfo: {
        name: item.contact_info?.name || "",
        email: item.contact_info?.email || "",
        phone: item.contact_info?.phone || "",
      },
    },
  });

  const reportType = form.watch("type");

  const onSubmit = async (values: ItemEditFormValues) => {
    try {
      setIsSubmitting(true);
      setFormError(null);

      if (
        !imageModerated &&
        values.imageUrl &&
        values.imageUrl !== item.image_url
      ) {
        toast.error(
          "Please upload a different image. The current one has been flagged by our content moderation system."
        );
        setIsSubmitting(false);
        return;
      }

      const { error: itemError } = await supabase
        .from("items")
        .update({
          type: values.type,
          category: values.category,
          title: values.title,
          description: values.description,
          date: values.date.toISOString(),
          location_address: values.location.address,
          location_latitude: values.location.latitude,
          location_longitude: values.location.longitude,
          location_place_id: values.location.placeId || null,
          image_url: values.imageUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (itemError) {
        throw new Error(`Error updating item: ${itemError.message}`);
      }

      const { error: contactError } = await supabase
        .from("contact_info")
        .update({
          name: values.contactInfo.name,
          email: values.contactInfo.email,
          phone: values.contactInfo.phone || null,
        })
        .eq("item_id", item.id);

      if (contactError) {
        throw new Error(`Error updating contact info: ${contactError.message}`);
      }

      toast.success("Item updated successfully!");

      router.push(`/item/${item.id}`);
      router.refresh();
    } catch (error) {
      console.error("Error updating item:", error);
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to update item. Please try again."
      );
      toast.error("Failed to update item. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    try {
      setIsDeleting(true);
      setFormError(null);

      const { data: claims, error: claimsError } = await supabase
        .from("item_claims")
        .select("id")
        .eq("item_id", item.id);

      if (claimsError)
        throw new Error(`Error checking claims: ${claimsError.message}`);

      if (claims && claims.length > 0) {
        const { error: deleteClaimsError } = await supabase
          .from("item_claims")
          .delete()
          .eq("item_id", item.id);

        if (deleteClaimsError)
          throw new Error(
            `Error deleting claims: ${deleteClaimsError.message}`
          );
      }

      const { data: messages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("item_id", item.id);

      if (messagesError)
        throw new Error(`Error checking messages: ${messagesError.message}`);

      if (messages && messages.length > 0) {
        const { error: deleteMessagesError } = await supabase
          .from("chat_messages")
          .delete()
          .eq("item_id", item.id);

        if (deleteMessagesError)
          throw new Error(
            `Error deleting messages: ${deleteMessagesError.message}`
          );
      }

      const { error: contactError } = await supabase
        .from("contact_info")
        .delete()
        .eq("item_id", item.id);

      if (contactError)
        throw new Error(`Error deleting contact info: ${contactError.message}`);

      const { error: itemError } = await supabase
        .from("items")
        .delete()
        .eq("id", item.id);

      if (itemError)
        throw new Error(`Error deleting item: ${itemError.message}`);

      toast.success("Item deleted successfully");
      router.push("/items/my-items");
      router.refresh();
    } catch (error) {
      console.error("Error deleting item:", error);
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to delete item. Please try again."
      );
      toast.error("Failed to delete item. Please try again.");
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8 pb-8'>
        {formError && (
          <div className='p-4 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-red-600 dark:text-red-400' />
            <p className='text-sm text-red-600 dark:text-red-400'>
              {formError}
            </p>
          </div>
        )}

        <div className='p-6 bg-accent/10 rounded-lg border border-border/30 mb-8'>
          <h3 className='text-lg font-semibold mb-4'>Item Details</h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem className='space-y-3 md:col-span-2'>
                  <FormLabel className='text-base'>Item Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className='flex flex-col space-y-1 sm:flex-row sm:space-x-4 sm:space-y-0'
                    >
                      <FormItem className='flex items-center space-x-3 space-y-0'>
                        <FormControl>
                          <RadioGroupItem value='lost' />
                        </FormControl>
                        <FormLabel className='font-normal cursor-pointer'>
                          Lost item
                        </FormLabel>
                      </FormItem>
                      <FormItem className='flex items-center space-x-3 space-y-0'>
                        <FormControl>
                          <RadioGroupItem value='found' />
                        </FormControl>
                        <FormLabel className='font-normal cursor-pointer'>
                          Found item
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='category'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-base'>Item Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Select a category' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {itemCategories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-base'>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={`${
                        reportType === "lost" ? "Lost" : "Found"
                      } [item name]`}
                      className='w-full'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A brief title for your {reportType} item.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className='p-6 bg-accent/10 rounded-lg border border-border/30 mb-8'>
          <h3 className='text-lg font-semibold mb-4'>Date & Location</h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <FormField
              control={form.control}
              name='date'
              render={({ field }) => (
                <FormItem className='flex flex-col'>
                  <FormLabel className='text-base'>
                    {reportType === "lost"
                      ? "When did you lose it?"
                      : "When did you find it?"}
                  </FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={`w-full pl-3 text-left font-normal ${
                            !field.value ? "text-muted-foreground" : ""
                          }`}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className='w-auto p-0' align='start'>
                      <Calendar
                        mode='single'
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Select the date when you{" "}
                    {reportType === "lost" ? "lost" : "found"} the item.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='location'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-base'>
                    {reportType === "lost"
                      ? "Where did you lose it?"
                      : "Where did you find it?"}
                  </FormLabel>
                  <FormControl>
                    <LocationInput
                      onChange={(location) => {
                        if (location) {
                          field.onChange(location);
                        }
                      }}
                      value={field.value}
                      required
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the location where you{" "}
                    {reportType === "lost" ? "lost" : "found"} the item.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className='p-6 bg-accent/10 rounded-lg border border-border/30 mb-8'>
          <h3 className='text-lg font-semibold mb-4'>Description & Image</h3>

          <FormField
            control={form.control}
            name='imageUrl'
            render={({ field }) => (
              <FormItem className='mb-6'>
                <FormLabel className='text-base'>Item Image</FormLabel>
                <FormControl>
                  <AIImageUpload
                    onImageSelect={(url) => field.onChange(url)}
                    onDescriptionGenerated={(desc) => {
                      const currentDescription = form.getValues("description");
                      if (
                        !currentDescription ||
                        currentDescription.length < 20
                      ) {
                        form.setValue("description", desc, {
                          shouldValidate: true,
                        });
                      }
                    }}
                    onModerationResult={(isApproved) => {
                      setImageModerated(isApproved);
                      if (!isApproved) {
                        toast.warning(
                          "The uploaded image has been flagged by our content moderation system. Please upload a different image."
                        );
                      }
                    }}
                    initialImageUrl={field.value}
                    label=''
                    description=''
                  />
                </FormControl>
                <FormDescription>
                  Upload an image of the item. Our AI will help generate a
                  detailed description.
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
                <FormLabel className='text-base'>Item Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder='Describe the item in detail...'
                    className='min-h-[150px] resize-y'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Provide a detailed description of the item to help with
                  identification.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='p-6 bg-accent/10 rounded-lg border border-border/30 mb-8'>
          <h3 className='text-lg font-semibold mb-4'>Contact Information</h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <FormField
              control={form.control}
              name='contactInfo.name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-base'>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Your full name'
                      className='w-full'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='contactInfo.email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-base'>Email</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='Your email address'
                      className='w-full'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    We&apos;ll use this to contact you about your item.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='contactInfo.phone'
              render={({ field }) => (
                <FormItem className='md:col-span-2'>
                  <FormLabel className='text-base'>Phone (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type='tel'
                      placeholder='Your phone number'
                      className='w-full md:w-1/2'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional alternative way to contact you.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className='flex flex-col sm:flex-row gap-4 pt-4 mt-8'>
          <AlertDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <AlertDialogTrigger asChild>
              <Button type='button' variant='destructive' className='sm:w-1/3'>
                Delete Item
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Are you sure you want to delete this item?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  item and all associated data including claims and messages.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteItem();
                  }}
                  disabled={isDeleting}
                  className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Deleting...
                    </>
                  ) : (
                    "Delete Item"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            type='submit'
            disabled={isSubmitting}
            className='w-full sm:w-2/3 shadow-sm hover:shadow'
          >
            {isSubmitting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Updating...
              </>
            ) : (
              "Update Item"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
