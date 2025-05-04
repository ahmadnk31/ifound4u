"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LoadScript, LoadScriptProps } from '@react-google-maps/api';

// Google Maps API key
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Define libraries array outside component to prevent unnecessary reloads
export const GOOGLE_MAPS_LIBRARIES = ["places"];

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined
});

export const useGoogleMaps = () => useContext(GoogleMapsContext);

interface GoogleMapsProviderProps {
  children: ReactNode;
}

export function GoogleMapsProvider({ children }: GoogleMapsProviderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | undefined>(undefined);

  const handleLoad = () => {
    console.log("Google Maps script loaded successfully");
    setIsLoaded(true);
  };

  const handleError = (error: Error) => {
    console.error("Error loading Google Maps script:", error);
    setLoadError(error);
  };

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      <LoadScript
        googleMapsApiKey={GOOGLE_MAPS_API_KEY}
        libraries={GOOGLE_MAPS_LIBRARIES}
        onLoad={handleLoad}
        onError={handleError}
        loadingElement={<></>}
      >
        {children}
      </LoadScript>
    </GoogleMapsContext.Provider>
  );
}

// A hook to check if Google Maps API is ready
export function useGoogleMapsReady() {
  const { isLoaded, loadError } = useGoogleMaps();
  return { isLoaded, loadError };
}