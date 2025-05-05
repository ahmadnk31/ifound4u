"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Initialize with undefined to prevent hydration mismatch
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Only run this code on the client side
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Set the initial value
    handleResize();

    // Add event listener for window resize
    window.addEventListener("resize", handleResize);

    // Clean up
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Return false during SSR to prevent hydration mismatch
  return typeof isMobile === "undefined" ? false : isMobile;
}

/**
 * Custom hook to check if a media query matches the current viewport
 * @param query The media query to check (e.g., "(max-width: 640px)")
 * @returns Boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if window.matchMedia is supported
    if (!window.matchMedia) {
      console.warn("window.matchMedia is not supported");
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Set initial state
    setMatches(mediaQuery.matches);

    // Create event listener function
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener for changes to media query
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      // For older browsers that don't support addEventListener
      mediaQuery.addListener(handleChange);
    }

    // Clean up
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        // For older browsers
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
}
