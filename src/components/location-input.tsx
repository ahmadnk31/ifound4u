"use client";

import React, { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { MapPin } from "lucide-react";
import { useGoogleMapsReady } from "@/lib/google-maps-context";

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

export function LocationInput({
  label = "Location",
  description,
  onChange,
  value,
  required = false,
  placeholder = "Search for a location...",
}: LocationInputProps) {
  const [address, setAddress] = useState(value?.address || "");
  const { isLoaded } = useGoogleMapsReady();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Update the input value when the value prop changes
    if (value?.address !== undefined) {
      setAddress(value.address);
    }
  }, [value?.address]);

  useEffect(() => {
    // Initialize Google Maps autocomplete when the map is loaded and input is available
    if (isLoaded && inputRef.current && !isInitialized) {
      // Create the autocomplete instance
      const options = {
        types: ["geocode", "establishment"],
        fields: ["formatted_address", "geometry", "place_id", "name"],
      };

      autocompleteRef.current = new google.maps.places.Autocomplete(
        inputRef.current,
        options
      );

      // Add event listener for place selection
      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace();
        if (place && place.geometry?.location) {
          const location = {
            address: place.formatted_address || place.name || "",
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng(),
            placeId: place.place_id,
          };

          setAddress(location.address);
          onChange(location);
        }
      });

      setIsInitialized(true);
    }

    // Clean up
    return () => {
      if (autocompleteRef.current && isLoaded) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [isLoaded, onChange, isInitialized]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);

    // Clear location if the user cleared the input field
    if (e.target.value === "" && value) {
      onChange(null);
    }
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
        <div className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10'>
          <MapPin size={18} />
        </div>

        {isLoaded ? (
          <input
            ref={inputRef}
            id='location-input'
            type='text'
            value={address}
            onChange={handleInputChange}
            placeholder={placeholder}
            className='border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none focus:ring-2 focus:ring-ring focus:border-input pl-10'
          />
        ) : (
          <input
            type='text'
            placeholder='Loading maps...'
            disabled
            className='border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none pl-10 opacity-70'
          />
        )}
      </div>

      {description && (
        <p className='text-sm text-muted-foreground'>{description}</p>
      )}
    </div>
  );
}

// Version that works with react-hook-form
export interface FormLocationInputProps
  extends Omit<LocationInputProps, "onChange"> {
  description?: string;
  label?: string;
  required?: boolean;
  onChange?: (location: LocationData | null) => void;
  value?: LocationData | null;
}

export function FormLocationInput(props: FormLocationInputProps) {
  return (
    <FormItem>
      <FormLabel>
        {props.label}
        {props.required && " *"}
      </FormLabel>
      <FormControl>
        <LocationInput
          {...props}
          onChange={
            props.onChange ||
            (() => {
              console.log("onChange not implemented");
            })
          }
        />
      </FormControl>
      {props.description && (
        <FormDescription>{props.description}</FormDescription>
      )}
      <FormMessage />
    </FormItem>
  );
}
