"use client";

import React, { useState } from "react";
import { LoadScript } from "@react-google-maps/api";
import Autocomplete from "react-google-autocomplete";
import { Label } from "@/components/ui/label";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { MapPin } from "lucide-react";

// Make sure to get an API key for Google Maps from your Google Cloud Console
// and add it to your .env.local file
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Define libraries array outside component to prevent unnecessary reloads
const GOOGLE_MAPS_LIBRARIES = ["places"];

interface LocationData {
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

interface LocationInputProps {
  label?: string;
  description?: string;
  onChange: (location: LocationData | null) => void;
  value?: LocationData | null;
  required?: boolean;
  placeholder?: string;
}

export function AddressAutocomplete({
  label = "Location",
  description,
  onChange,
  value,
  required = false,
  placeholder = "Search for a location...",
}: LocationInputProps) {
  const [address, setAddress] = useState(value?.address || "");

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place.geometry?.location) return;

    const location = {
      address: place.formatted_address || "",
      latitude: place.geometry.location.lat(),
      longitude: place.geometry.location.lng(),
      placeId: place.place_id,
    };

    setAddress(location.address);
    onChange(location);
  };

  return (
    <div className='space-y-2'>
      {label && (
        <Label htmlFor='location'>
          {label}
          {required && " *"}
        </Label>
      )}

      <div className='relative'>
        <div className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-500'>
          <MapPin size={18} />
        </div>

        
          <Autocomplete
            apiKey={GOOGLE_MAPS_API_KEY}
            style={{
              width: "100%",
              paddingLeft: "2.5rem",
            }}
            onPlaceSelected={handlePlaceSelect}
            options={{
              types: ["geocode", "establishment"],
             
            }}
            defaultValue={address}
            placeholder={placeholder}
            className='border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none pl-10'
          />
        
      </div>

      {description && (
        <p className='text-sm text-muted-foreground'>{description}</p>
      )}
    </div>
  );
}
