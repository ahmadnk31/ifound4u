"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { createClient } from "@/lib/client";
import Image from "next/image";

interface AIImageUploadProps {
  onImageSelect: (url: string) => void;
  onDescriptionGenerated: (description: string) => void;
  onModerationResult: (isApproved: boolean) => void;
  initialDescription?: string;
  initialImageUrl?: string;
  label?: string;
  description?: string;
}

// File with preview URL for display
interface FileWithPreview extends File {
  preview: string;
}

export function AIImageUpload({
  onImageSelect,
  onDescriptionGenerated,
  onModerationResult,
  initialDescription = "",
  initialImageUrl = "",
  label = "Upload Image",
  description = "Upload an image of the item",
}: AIImageUploadProps) {
  const [generatedDescription, setGeneratedDescription] =
    useState<string>(initialDescription);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [moderationStatus, setModerationStatus] = useState<
    "pending" | "approved" | "rejected" | "none"
  >("none");
  const [imageUrl, setImageUrl] = useState<string>(initialImageUrl);
  const [files, setFiles] = useState<FileWithPreview[]>([]);

  const supabase = createClient();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(
      acceptedFiles.map((file) =>
        Object.assign(file, {
          preview: URL.createObjectURL(file),
        })
      ) as FileWithPreview[]
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024, // 5MB
    accept: {
      "image/*": [],
    },
  });

  // Clean up the object URL to avoid memory leaks
  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  const analyzeImage = async (imageUrl: string) => {
    setIsAnalyzing(true);
    setModerationStatus("pending");

    try {
      // Use the new API route for image analysis
      const response = await fetch("/api/image-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Set the generated description
      setGeneratedDescription(data.description);
      onDescriptionGenerated(data.description);

      // Handle moderation result
      const isApproved = data.moderation.approved;
      setModerationStatus(isApproved ? "approved" : "rejected");
      onModerationResult(isApproved);
    } catch (error) {
      console.error("Error analyzing image:", error);
      setModerationStatus("rejected");
      onModerationResult(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate a unique filename for Supabase
  const generateUniqueFileName = (originalName: string): string => {
    const fileExt = originalName.split(".").pop() || "";
    const baseName = originalName
      .split(".")
      .slice(0, -1)
      .join(".")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .substring(0, 20); // Limit base name length

    return `${baseName}_${Date.now()}.${fileExt}`;
  };

  const handleUploadAndAnalyze = async () => {
    if (files.length === 0) return;

    try {
      setIsUploading(true);
      const file = files[0];
      console.log("Uploading file:", file);
      // Create a unique filename to prevent conflicts in storage
      const uniqueFilename = generateUniqueFileName(file.name);
      const filePath = `items/${uniqueFilename}`;

      // Upload the image to Supabase storage
      const { data, error } = await supabase.storage
        .from("items")
        .upload(filePath, file);

      if (error) {
        throw error;
      }
      console.log("File uploaded successfully:", data);

      // Get the public URL of the uploaded image
      const { data: publicUrlData } = supabase.storage
        .from("items")
        .getPublicUrl(filePath); // Use the same filePath for consistency

      if (publicUrlData?.publicUrl) {
        setImageUrl(publicUrlData.publicUrl);
        onImageSelect(publicUrlData.publicUrl);

        // Now analyze the uploaded image
        await analyzeImage(publicUrlData.publicUrl);
      }
    } catch (error) {
      console.error("Error uploading or analyzing image:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    // Clean up previews
    files.forEach((file) => {
      if (file.preview) URL.revokeObjectURL(file.preview);
    });

    setFiles([]);
    setImageUrl("");
    setGeneratedDescription("");
    setModerationStatus("none");
    onImageSelect("");
    onDescriptionGenerated("");
  };

  return (
    <div className='space-y-4 w-full'>
      {label && <h3 className='text-lg font-medium'>{label}</h3>}
      {description && (
        <p className='text-sm text-muted-foreground'>{description}</p>
      )}

      {!imageUrl && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-md p-6 cursor-pointer flex flex-col items-center justify-center transition-colors ${
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-primary/50"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className='h-10 w-10 text-muted-foreground mb-2' />
          {isDragActive ? (
            <p className='text-sm text-primary font-medium'>
              Drop the image here...
            </p>
          ) : (
            <div className='text-center'>
              <p className='text-sm font-medium text-muted-foreground'>
                Drag & drop an image here, or click to select
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                PNG, JPG up to 5MB
              </p>
            </div>
          )}
        </div>
      )}

      {files.length > 0 && !imageUrl && (
        <div className='mt-4 flex items-center justify-between'>
          <div className='flex items-center'>
            <div className='h-16 w-16 rounded-md overflow-hidden bg-gray-100 mr-3 relative'>
              <Image
                src={files[0].preview}
                alt='Preview'
                fill
                className='object-cover'
              />
            </div>
            <div>
              <p className='text-sm font-medium'>{files[0].name}</p>
              <p className='text-xs text-muted-foreground'>
                {(files[0].size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>

          <div className='flex gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={handleRemoveImage}
            >
              <X className='h-4 w-4 mr-1' /> Remove
            </Button>
            <Button
              type='button'
              size='sm'
              onClick={handleUploadAndAnalyze}
              disabled={isAnalyzing || isUploading}
            >
              {isAnalyzing || isUploading ? (
                <Loader2 className='h-4 w-4 mr-1 animate-spin' />
              ) : (
                <Upload className='h-4 w-4 mr-1' />
              )}
              {isAnalyzing
                ? "Analyzing..."
                : isUploading
                ? "Uploading..."
                : "Upload & Analyze"}
            </Button>
          </div>
        </div>
      )}

      {imageUrl && (
        <div className='mt-4 space-y-4'>
          <div className='relative rounded-md overflow-hidden'>
            <div className='w-full h-[300px] relative bg-gray-100'>
              <Image
                src={imageUrl}
                alt='Uploaded'
                fill
                className='object-contain'
              />
            </div>
            <Button
              type='button'
              size='icon'
              variant='destructive'
              className='absolute top-2 right-2 h-8 w-8'
              onClick={handleRemoveImage}
            >
              <X className='h-4 w-4' />
            </Button>

            {moderationStatus !== "none" && (
              <div
                className={`absolute bottom-0 left-0 right-0 p-2 text-white text-sm font-medium ${
                  moderationStatus === "approved"
                    ? "bg-green-600/80"
                    : moderationStatus === "rejected"
                    ? "bg-red-600/80"
                    : "bg-yellow-500/80"
                }`}
              >
                {moderationStatus === "approved" && (
                  <div className='flex items-center'>
                    <CheckCircle2 className='h-4 w-4 mr-1' />
                    <span>Image approved</span>
                  </div>
                )}
                {moderationStatus === "rejected" && (
                  <div className='flex items-center'>
                    <AlertTriangle className='h-4 w-4 mr-1' />
                    <span>Image flagged - please upload a different image</span>
                  </div>
                )}
                {moderationStatus === "pending" && (
                  <div className='flex items-center'>
                    <Loader2 className='h-4 w-4 mr-1 animate-spin' />
                    <span>Analyzing image...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <h4 className='text-sm font-medium'>AI-Generated Description</h4>
            <Textarea
              value={generatedDescription}
              onChange={(e) => {
                setGeneratedDescription(e.target.value);
                onDescriptionGenerated(e.target.value);
              }}
              placeholder={
                isAnalyzing
                  ? "Generating description..."
                  : "Description will appear here after analysis..."
              }
              rows={5}
              disabled={isAnalyzing}
              className='min-h-[120px]'
            />
            {isAnalyzing && (
              <p className='text-xs text-muted-foreground flex items-center'>
                <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                Analyzing image and generating description...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Form-compatible version
export interface FormAIImageUploadProps extends AIImageUploadProps {
  description?: string;
  label?: string;
}

export function FormAIImageUpload(props: FormAIImageUploadProps) {
  return (
    <FormItem className='space-y-3'>
      <FormLabel>{props.label}</FormLabel>
      <FormControl>
        <AIImageUpload {...props} />
      </FormControl>
      {props.description && (
        <FormDescription>{props.description}</FormDescription>
      )}
      <FormMessage />
    </FormItem>
  );
}
