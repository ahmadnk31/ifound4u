"use client";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDropzone } from "react-dropzone";
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
import { useCallback, useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";

const profileCardSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  displayName: z.string().min(1).max(50),
  profilePicture: z.string().optional(),
  bio: z.string().max(160).optional(),
  phoneNumber: z.string().optional(),
});

export type ProfileCard = z.infer<typeof profileCardSchema>;

type ProfileCardProps = z.infer<typeof profileCardSchema> & {
  profile?: ProfileCard;
};

export const ProfileCard = ({ profile }: ProfileCardProps) => {
  const form = useForm<z.infer<typeof profileCardSchema>>({
    resolver: zodResolver(profileCardSchema),
    defaultValues: {
      id: profile?.id || "",
      email: profile?.email || "",
      displayName: profile?.displayName || "",
      profilePicture: profile?.profilePicture || "",
      bio: profile?.bio || "",
      phoneNumber: profile?.phoneNumber || "",
    },
  });

  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Setup react-dropzone with proper event handlers
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles?.[0]) {
        const selectedFile = acceptedFiles[0];
        setFile(selectedFile);

        // Create preview and revoke any previous preview URL
        if (preview) URL.revokeObjectURL(preview);
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreview(objectUrl);
      }
    },
    [preview]
  );

  // Cleanup preview URL when component unmounts
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".gif"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 1,
    noClick: false, // Enable click to open file dialog
    noKeyboard: false, // Enable keyboard navigation
  });

  const uploadFile = async () => {
    if (!file) return null;

    try {
      setUploading(true);

      // Create a unique file name
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()
        .toString(36)
        .substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `profile/${fileName}`;

      // Upload file to Supabase
      const { error: uploadError } = await supabase.storage
        .from("profile")
        .upload(filePath, file);

      if (uploadError) {
        toast.error("Error uploading image");
        console.error(uploadError);
        setUploading(false);
        return null;
      }

      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from("profile")
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        // Update form with URL
        form.setValue("profilePicture", publicUrlData.publicUrl, {
          shouldValidate: true,
          shouldDirty: true,
        });
        toast.success("Profile picture uploaded successfully");
        return publicUrlData.publicUrl;
      }

      return null;
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Error uploading file");
      return null;
    } finally {
      setUploading(false);
      // Clear file and preview after successful upload
      setFile(null);
    }
  };
  console.log(form.getValues("profilePicture"));
  const deleteProfilePicture = async () => {
    try {
      setDeleting(true);

      // Extract file path from the URL
      const currentPicture = form.getValues("profilePicture");
      if (!currentPicture) {
        setDeleting(false);
        return;
      }

      // Remove the profile picture from user metadata
      const { error } = await supabase.auth.updateUser({
        data: {
          ...profile,
          profilePicture: null,
        },
      });

      if (error) {
        toast.error("Error removing profile picture");
        console.error(error);
      } else {
        // Update the form field
        form.setValue("profilePicture", "", {
          shouldValidate: true,
          shouldDirty: true,
        });

        // Try to remove the file from storage
        try {
          // Example URL: https://gebhsjemjsrgnlonbhbv.supabase.co/storage/v1/object/public/profile/profile/8jgnxa6p9z7_1745751369694.jpg
          const url = new URL(currentPicture);

          // Extract path after the bucket name
          // We need to get the "profile/8jgnxa6p9z7_1745751369694.jpg" part
          const pathParts = url.pathname.split("/");

          // Find the index of "profile" (bucket name)
          const bucketIndex = pathParts.indexOf("profile");

          // Extract everything after the bucket name to form the full path
          const filePath = pathParts.slice(bucketIndex + 1).join("/");

          console.log("Attempting to delete file with path:", filePath);

          // Delete the file from storage
          const { error: deleteError, data } = await supabase.storage
            .from("profile")
            .remove([filePath]);

          if (deleteError) {
            console.warn("Error deleting file from storage:", deleteError);
          } else {
            console.log("File deleted successfully:", data);
          }
        } catch (storageError) {
          console.warn("Could not remove file from storage:", storageError);
        }

        toast.success("Profile picture removed successfully");
      }
    } catch (error) {
      console.error("Error deleting profile picture:", error);
      toast.error("Error removing profile picture");
    } finally {
      setDeleting(false);
      // Clear preview if any
      if (preview) {
        URL.revokeObjectURL(preview);
        setPreview(null);
      }
    }
  };

  const onSubmit = async (data: ProfileCard) => {
    // If there's a file to upload, do it first
    if (file) {
      const imageUrl = await uploadFile();
      if (!imageUrl) return; // Exit if upload failed
      data.profilePicture = imageUrl;
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        email: data.email,
        displayName: data.displayName,
        profilePicture: data.profilePicture,
        bio: data.bio,
        phoneNumber: data.phoneNumber,
      },
    });

    if (error) {
      console.log(error);
      toast.error("Error updating profile");
    } else {
      console.log("Profile updated successfully");
      toast.success("Profile updated successfully");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <FormField
          control={form.control}
          name='displayName'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Name</FormLabel>
              <FormControl>
                <Input placeholder='user' {...field} />
              </FormControl>
              <FormDescription>
                This is your public display name.
              </FormDescription>
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
                <Input disabled placeholder='user@example.com' {...field} />
              </FormControl>
              <FormDescription>
                You cannot change your email address here. Please contact
                support for assistance.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='bio'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Input placeholder='Tell us about yourself' {...field} />
              </FormControl>
              <FormDescription>This is your public bio.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='phoneNumber'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <Input placeholder='+1234567890' {...field} />
              </FormControl>
              <FormDescription>
                This is your public phone number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='profilePicture'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile Picture</FormLabel>
              <FormControl>
                <div className='space-y-4'>
                  {/* Improved drag & drop area */}
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 cursor-pointer flex flex-col items-center justify-center transition-colors ${
                      isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-gray-300 hover:border-primary/50"
                    }`}
                    onClick={(e) => {
                      // This ensures the click handler works properly
                      e.stopPropagation();
                      open();
                    }}
                  >
                    <input {...getInputProps()} />
                    <div className='text-center'>
                      <Upload
                        size={36}
                        className='mx-auto text-gray-400 mb-2'
                      />
                      {isDragActive ? (
                        <p className='text-primary font-medium'>
                          Drop the image here...
                        </p>
                      ) : (
                        <>
                          <p className='font-medium text-gray-700 dark:text-gray-300'>
                            Drag & drop an image here, or click to select one
                          </p>
                          <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                            PNG, JPG, GIF up to 10MB
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Preview area with delete button */}
                  {(preview || field.value) && (
                    <div className='mt-4'>
                      <div className='flex items-center justify-between mb-2'>
                        <p className='text-sm text-muted-foreground'>
                          {preview ? "Selected image:" : "Current image:"}
                        </p>
                        <Button
                          type='button'
                          variant='destructive'
                          size='sm'
                          onClick={deleteProfilePicture}
                          disabled={deleting || (!preview && !field.value)}
                        >
                          <Trash2 className='h-4 w-4 mr-2' />
                          {deleting ? "Removing..." : "Remove"}
                        </Button>
                      </div>
                      <div className='w-40 h-40 rounded-md overflow-hidden border'>
                        <img
                          src={
                            preview || field.value || "/placeholder-avatar.png"
                          }
                          alt='Profile'
                          className='w-full h-full object-cover'
                        />
                      </div>
                    </div>
                  )}
                  <Input type='hidden' {...field} />
                </div>
              </FormControl>
              <FormDescription>
                This is your public profile picture.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type='submit'
          disabled={uploading || deleting || form.formState.isSubmitting}
        >
          {uploading
            ? "Uploading..."
            : deleting
            ? "Deleting..."
            : form.formState.isSubmitting
            ? "Saving..."
            : "Submit"}
        </Button>
      </form>
    </Form>
  );
};
