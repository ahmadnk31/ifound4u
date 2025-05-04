"use client";
import React, { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { CalendarIcon, Loader2 } from "lucide-react";
import { LocationInput } from "./location-input";
import { AIImageUpload } from "./ai-image-upload";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import { AddressAutocomplete } from "./address-autocomplete";

// Define the schema for the form
const itemReportSchema = z.object({
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
    name: z.string().optional(), // Made name optional
    email: z.string().email({ message: "Please enter a valid email" }),
    phone: z.string().optional(),
    isAuthenticated: z.boolean().default(false),
  }),
});

type ItemReportFormValues = z.infer<typeof itemReportSchema>;

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

export function ItemReportForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageModerated, setImageModerated] = useState(true);
  const supabase = createClient();

  const form = useForm<ItemReportFormValues>({
    resolver: zodResolver(itemReportSchema),
    defaultValues: {
      type: "lost",
      title: "",
      description: "",
      date: new Date(),
      contactInfo: {
        name: "",
        email: "",
        phone: "",
        isAuthenticated: false,
      },
    },
  });

  const reportType = form.watch("type");
  const isAuthenticated = form.watch("contactInfo.isAuthenticated");

  // Add handleBlur function to handle manual address entry
  const handleBlur = () => {
    const location = form.getValues("location");
    if (location.address && (!location.latitude || !location.longitude)) {
      // If address exists but coordinates don't, set default coordinates
      form.setValue("location", {
        ...location,
        latitude: location.latitude || 0,
        longitude: location.longitude || 0,
      });
    }
  };

  // Check if user is authenticated
  React.useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (data?.session?.user) {
        const { user } = data.session;
        form.setValue("contactInfo.isAuthenticated", true);
        form.setValue("contactInfo.email", user.email || "");

        // Try to get user metadata for name
        if (user.user_metadata?.displayName) {
          form.setValue("contactInfo.name", user.user_metadata.displayName);
        }

        // Try to get user metadata for phone
        if (user.user_metadata?.phoneNumber) {
          form.setValue("contactInfo.phone", user.user_metadata.phoneNumber);
        }
      }
    };

    checkAuth();
  }, [form, supabase.auth]);

  const onSubmit = async (values: ItemReportFormValues) => {
    try {
      console.log("Form submission triggered with values:", values);
      setIsSubmitting(true);

      // Don't proceed if the image was flagged by moderation
      if (!imageModerated && values.imageUrl) {
        toast.error(
          "Please upload a different image. The current one has been flagged by our content moderation system."
        );
        setIsSubmitting(false);
        return;
      }

      const { data: user } = await supabase.auth.getUser();

      // First insert the item to get its ID
      const { data: itemData, error: itemError } = await supabase
        .from("items")
        .insert([
          {
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
            user_id: user?.user?.id || null,
          },
        ])
        .select();

      if (itemError) {
        throw new Error(itemError.message);
      }

      if (!itemData || itemData.length === 0) {
        throw new Error("Failed to create item record");
      }

      const itemId = itemData[0].id;

      // Now insert the contact information and link it to the item
      const { error: contactError } = await supabase
        .from("contact_info")
        .insert([
          {
            item_id: itemId,
            name: values.contactInfo.name,
            email: values.contactInfo.email,
            phone: values.contactInfo.phone || null,
            email_verified: isAuthenticated, // Authenticated users have verified emails
            user_id: user?.user?.id || null,
          },
        ]);

      if (contactError) {
        throw new Error(contactError.message);
      }

      // If user is not authenticated, send verification email
      if (!isAuthenticated) {
        // Make a server action call to send verification email
        const response = await fetch("/api/send-verification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: values.contactInfo.email,
            itemId: itemId,
          }),
        });

        if (!response.ok) {
          console.warn("Failed to send verification email");
        }

        toast.success(
          "Please check your email for verification instructions to complete your submission."
        );
      } else {
        toast.success(
          `${
            values.type === "lost" ? "Lost" : "Found"
          } item report submitted successfully!`
        );
      }

      form.reset();
    } catch (error) {
      console.error("Error submitting item report:", error);
      toast.error("Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <div className='space-y-4'>
          <h2 className='text-2xl font-bold'>Report an Item</h2>
          <p className='text-muted-foreground'>
            Fill out this form to report a lost or found item.
          </p>
        </div>

        <FormField
          control={form.control}
          name='type'
          render={({ field }) => (
            <FormItem className='space-y-3'>
              <FormLabel>Report Type</FormLabel>
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
                      I lost an item
                    </FormLabel>
                  </FormItem>
                  <FormItem className='flex items-center space-x-3 space-y-0'>
                    <FormControl>
                      <RadioGroupItem value='found' />
                    </FormControl>
                    <FormLabel className='font-normal cursor-pointer'>
                      I found an item
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
              <FormLabel>Item Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
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
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input
                  placeholder={`${
                    reportType === "lost" ? "Lost" : "Found"
                  } [item name]`}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                A brief title for your {reportType} item report.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='date'
          render={({ field }) => (
            <FormItem className='flex flex-col'>
              <FormLabel>
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
              <FormLabel>Location</FormLabel>
              <FormControl>
                <AddressAutocomplete
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={() => form.trigger("location")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='imageUrl'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Image</FormLabel>
              <FormControl>
                <AIImageUpload
                  onImageSelect={(url) => field.onChange(url)}
                  onDescriptionGenerated={(desc) => {
                    // If we have no description yet or it's very short, use the AI-generated one
                    const currentDescription = form.getValues("description");
                    if (!currentDescription || currentDescription.length < 20) {
                      form.setValue("description", desc, {
                        shouldValidate: true,
                      });
                    }
                  }}
                  onModerationResult={(isApproved) => {
                    setImageModerated(isApproved);
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Please provide a detailed description'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Provide as much detail as possible to help identify the item.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Contact Information Section */}
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold'>Contact Information</h3>

          {isAuthenticated ? (
            <div className='p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md'>
              <p className='text-sm text-green-700 dark:text-green-400'>
                You&apos;re signed in! We&apos;ll use your account information
                for contact details.
              </p>
            </div>
          ) : (
            <div className='p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md'>
              <p className='text-sm text-yellow-700 dark:text-yellow-400'>
                You&apos;re not signed in. Please provide your contact details
                below.
                <br />
                We&apos;ll send a verification email to confirm your report.
              </p>
            </div>
          )}

          <FormField
            control={form.control}
            name='contactInfo.name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder='Your full name' {...field} />
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
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type='email'
                    placeholder='Your email address'
                    {...field}
                    disabled={isAuthenticated}
                  />
                </FormControl>
                <FormDescription>
                  We&apos;ll use this to contact you about your report.
                  {!isAuthenticated &&
                    " A verification email will be sent to this address."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='contactInfo.phone'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type='tel'
                    placeholder='Your phone number'
                    {...field}
                    disabled={isAuthenticated}
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

        <Button type='submit' className='w-full' disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Submitting...
            </>
          ) : (
            `Submit ${reportType === "lost" ? "Lost" : "Found"} Item Report`
          )}
        </Button>
      </form>
    </Form>
  );
}
