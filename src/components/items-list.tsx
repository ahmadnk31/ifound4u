"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ItemCard, ItemType, itemCategories } from "./item-card";
import { createClient } from "@/lib/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Search,
  SlidersHorizontal,
  MapPin,
  X,
  LocateFixed,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { LoadScript, GoogleMap, Circle, Marker } from "@react-google-maps/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// Google Maps API key
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
// Libraries for Google Maps
const GOOGLE_MAPS_LIBRARIES = ["places", "geometry"];

// Default map settings
const DEFAULT_CENTER = { lat: 34.0522, lng: -118.2437 }; // Los Angeles
const DEFAULT_ZOOM = 11;
const DEFAULT_RADIUS = 10; // kilometers

interface LocationFilter {
  center: google.maps.LatLngLiteral;
  radius: number; // in kilometers
  enabled: boolean;
}

interface AdvancedFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  selectedCategories: string[];
  useLocationFilter: boolean;
}

interface ItemsListProps {
  initialType?: "lost" | "found" | "all";
  initialCategory?: string;
  showFilters?: boolean;
  userId?: string | null;
  limit?: number;
  showPagination?: boolean;
  showAllItems?: boolean;
}

export function ItemsList({
  initialType = "all",
  initialCategory,
  showFilters = true,
  userId,
  limit = 12,
  showPagination = true,
  showAllItems = false,
}: ItemsListProps) {
  const [items, setItems] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"lost" | "found" | "all">(initialType);
  const [category, setCategory] = useState<string>(initialCategory || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapKey, setMapKey] = useState(Date.now());

  // Location filtering
  const [locationFilter, setLocationFilter] = useState<LocationFilter>({
    center: DEFAULT_CENTER,
    radius: DEFAULT_RADIUS,
    enabled: false,
  });

  // Advanced filters
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    dateRange: {
      start: null,
      end: null,
    },
    selectedCategories: [],
    useLocationFilter: false,
  });

  // References for map components
  const mapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const supabase = createClient();

  // Function to detect user's current location
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    toast.info("Detecting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocationFilter((prev) => ({
          ...prev,
          center: userLocation,
          enabled: true,
        }));

        if (mapRef.current) {
          mapRef.current.panTo(userLocation);
          mapRef.current.setZoom(12);
        }

        toast.success("Location detected successfully!");

        // Also enable location filtering in advanced filters
        setAdvancedFilters((prev) => ({
          ...prev,
          useLocationFilter: true,
        }));

        // Auto-fetch with the new location filter
        fetchItems(1, true);
      },
      (error) => {
        toast.error(`Unable to retrieve your location: ${error.message}`);
      }
    );
  };

  // Handle map load
  const handleMapLoad = (map: google.maps.Map) => {
    mapRef.current = map;
    setMapLoaded(true);

    // Add click listener to allow users to click on map to set location
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (event.latLng) {
        const newCenter = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng(),
        };

        setLocationFilter((prev) => ({
          ...prev,
          center: newCenter,
        }));

        // Enable location filter automatically when user clicks on map
        if (!locationFilter.enabled) {
          setLocationFilter((prev) => ({
            ...prev,
            enabled: true,
          }));
        }
      }
    });
  };

  // Handle marker drag
  const handleMarkerDrag = (event: google.maps.MapMouseEvent) => {
    if (event.latLng) {
      const newCenter = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
      };

      setLocationFilter((prev) => ({
        ...prev,
        center: newCenter,
      }));
    }
  };

  // Update radius when slider changes
  const handleRadiusChange = (value: number[]) => {
    setLocationFilter((prev) => ({
      ...prev,
      radius: value[0],
    }));
  };

  // Apply map filters
  const applyMapFilters = () => {
    setAdvancedFilters((prev) => ({
      ...prev,
      useLocationFilter: locationFilter.enabled,
    }));

    setMapOpen(false);
    fetchItems(1, true);
  };

  // Function to calculate if a point is within radius of center
  const isWithinRadius = (
    itemLat: number,
    itemLng: number,
    centerLat: number,
    centerLng: number,
    radiusKm: number
  ): boolean => {
    // Convert radius from km to m
    const radiusM = radiusKm * 1000;

    // Use the Haversine formula to calculate distance
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters

    const dLat = toRad(itemLat - centerLat);
    const dLng = toRad(itemLng - centerLng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(centerLat)) *
        Math.cos(toRad(itemLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= radiusM;
  };

  // Function to fetch items
  const fetchItems = useCallback(
    async (newPage = page, reset = false) => {
      try {
        setLoading(true);
        let query = supabase
          .from("items")
          .select(
            `
            *,
            contact_info (
              name, 
              email,
              phone
            )
          `,
            { count: "exact" }
          )
          .order("created_at", { ascending: false });

        // Apply filters
        if (type !== "all") {
          query = query.eq("type", type);
        }

        if (category && category !== "all") {
          query = query.eq("category", category);
        }

        // Only filter by user_id if specifically in "my items" view
        // and showAllItems is false
        if (
          userId &&
          window.location.pathname.includes("/my-items") &&
          !showAllItems
        ) {
          query = query.eq("user_id", userId);
        }

        if (searchQuery) {
          query = query.or(
            `title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,location_address.ilike.%${searchQuery}%`
          );
        }

        // Apply pagination
        const from = (newPage - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        // Transform the data to match ItemType
        const formattedItems = data.map((item: any) => ({
          ...item,
          contact_info: item.contact_info || null,
        }));

        // Apply location filtering on the client-side
        // This is needed because Supabase doesn't have built-in geospatial queries
        let filteredItems = formattedItems;

        if (locationFilter.enabled && advancedFilters.useLocationFilter) {
          filteredItems = formattedItems.filter(
            (item) =>
              item.location_latitude &&
              item.location_longitude &&
              isWithinRadius(
                item.location_latitude,
                item.location_longitude,
                locationFilter.center.lat,
                locationFilter.center.lng,
                locationFilter.radius
              )
          );
        }

        // If this is a new search/filter, replace the items
        // Otherwise, append to existing items
        if (reset || newPage === 1) {
          setItems(filteredItems);
        } else {
          setItems((prev) => [...prev, ...filteredItems]);
        }

        // Adjust total count and pagination based on filtered results
        if (count !== null) {
          if (locationFilter.enabled && advancedFilters.useLocationFilter) {
            // If location filtering is applied, we need to adjust the total count and pagination
            const totalFiltered = count;
            setTotalCount(
              filteredItems.length < limit
                ? filteredItems.length
                : totalFiltered
            );
            setHasMore(
              filteredItems.length >= limit &&
                from + filteredItems.length < totalFiltered
            );
          } else {
            // Regular pagination without location filtering
            setTotalCount(count);
            setHasMore(from + formattedItems.length < count);
          }
        }

        setPage(newPage);
      } catch (error) {
        console.error("Error fetching items:", error);
        toast.error("Failed to fetch items. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [
      page,
      supabase,
      type,
      category,
      userId,
      showAllItems,
      searchQuery,
      limit,
      locationFilter,
      advancedFilters,
    ]
  );

  // Initial fetch
  useEffect(() => {
    fetchItems(1, true);
  }, [type, category, userId, searchQuery, fetchItems]);

  // Handle search input
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems(1, true);
  };

  // Handle load more
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchItems(page + 1);
    }
  };

  // Handle refresh when an item's claim status changes
  const handleItemUpdate = () => {
    fetchItems(1, true);
  };

  // Toggle location filter
  const toggleLocationFilter = () => {
    setLocationFilter((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  };

  // Reset all filters
  const resetAllFilters = () => {
    setType("all");
    setCategory("all");
    setSearchQuery("");
    setLocationFilter({
      center: DEFAULT_CENTER,
      radius: DEFAULT_RADIUS,
      enabled: false,
    });
    setAdvancedFilters({
      dateRange: {
        start: null,
        end: null,
      },
      selectedCategories: [],
      useLocationFilter: false,
    });
    fetchItems(1, true);
  };

  const handleMapDialogChange = (open: boolean) => {
    setMapOpen(open);

    // Only force map re-render when opening the dialog
    if (open) {
      // Small delay to ensure the dialog is fully open before loading the map
      setTimeout(() => {
        setMapKey(Date.now());
        setMapLoaded(false);
      }, 100);
    }
  };

  return (
    <div className='space-y-8'>
      {/* Filters section */}
      {showFilters && (
        <div className='space-y-6 bg-accent/5 p-5 rounded-lg border border-border/40 shadow-sm'>
          {/* Type tabs */}
          <Tabs
            defaultValue={type}
            className='w-full'
            onValueChange={(value) =>
              setType(value as "lost" | "found" | "all")
            }
          >
            <TabsList className='grid w-full grid-cols-3 p-1'>
              <TabsTrigger
                value='all'
                className='data-[state=active]:shadow-sm transition-all'
              >
                All Items
              </TabsTrigger>
              <TabsTrigger
                value='lost'
                className='data-[state=active]:shadow-sm transition-all'
              >
                Lost Items
              </TabsTrigger>
              <TabsTrigger
                value='found'
                className='data-[state=active]:shadow-sm transition-all'
              >
                Found Items
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search and filters */}
          <div className='flex flex-col gap-4 sm:flex-row'>
            <form onSubmit={handleSearch} className='flex-1 flex gap-2'>
              <Input
                placeholder='Search items or locations...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='flex-1'
              />
              <Button
                type='submit'
                variant='secondary'
                className='shadow-sm hover:shadow'
              >
                <Search className='h-4 w-4' />
              </Button>
            </form>

            {/* Map Location Dialog */}
            <Dialog open={mapOpen} onOpenChange={handleMapDialogChange}>
              <DialogTrigger asChild>
                <Button
                  variant={locationFilter.enabled ? "default" : "outline"}
                  className='flex items-center gap-2'
                >
                  <MapPin className='h-4 w-4' />
                  <span className='hidden sm:inline'>Map Search</span>
                </Button>
              </DialogTrigger>
              <DialogContent
                className='w-full max-w-4xl max-h-[90vh] overflow-y-auto'
                style={{ height: "auto", maxHeight: "90vh" }}
              >
                <DialogHeader>
                  <DialogTitle>Find Items by Location</DialogTitle>
                  <DialogDescription>
                    Set a location and radius to search for items. Drag the
                    marker or click on the map to adjust the center point.
                  </DialogDescription>
                </DialogHeader>

                <div className='flex flex-col md:flex-row gap-4'>
                  {/* Map Area */}
                  <div className='flex-1 h-[350px] md:h-[500px] relative rounded-md overflow-hidden border border-muted'>
                    {!mapLoaded && (
                      <div className='absolute inset-0 flex items-center justify-center bg-muted/20 rounded-md'>
                        <div className='flex flex-col items-center gap-2'>
                          <Loader2 className='h-8 w-8 animate-spin text-primary' />
                          <p className='text-sm text-muted-foreground'>
                            Loading map...
                          </p>
                        </div>
                      </div>
                    )}

                    <GoogleMap
                      mapContainerStyle={{
                        width: "100%",
                        height: "100%",
                      }}
                      center={locationFilter.center}
                      zoom={DEFAULT_ZOOM}
                      onLoad={handleMapLoad}
                      options={{
                        fullscreenControl: false,
                        streetViewControl: false,
                        mapTypeControl: true,
                        zoomControl: true,
                        gestureHandling: "greedy", // Makes the map more responsive to user interaction
                      }}
                    >
                      <Marker
                        position={locationFilter.center}
                        draggable={true}
                        onDragEnd={handleMarkerDrag}
                      />
                      <Circle
                        center={locationFilter.center}
                        radius={locationFilter.radius * 1000} // Convert km to meters
                        options={{
                          fillColor: "rgba(66, 133, 244, 0.2)",
                          fillOpacity: 0.4,
                          strokeColor: "rgba(66, 133, 244, 0.8)",
                          strokeOpacity: 0.8,
                          strokeWeight: 2,
                        }}
                      />
                    </GoogleMap>
                  </div>

                  {/* Controls Area */}
                  <div className='w-full md:w-64 flex flex-col gap-6 p-4 border border-muted rounded-md bg-accent/5'>
                    <div className='space-y-4'>
                      <div className='flex items-center justify-between'>
                        <Label htmlFor='enable-location'>
                          Enable Location Filter
                        </Label>
                        <Switch
                          id='enable-location'
                          checked={locationFilter.enabled}
                          onCheckedChange={(checked) => {
                            setLocationFilter((prev) => ({
                              ...prev,
                              enabled: checked,
                            }));
                          }}
                        />
                      </div>

                      <Button
                        variant='outline'
                        size='sm'
                        className='w-full flex items-center gap-2'
                        onClick={getUserLocation}
                      >
                        <LocateFixed className='h-4 w-4' />
                        <span>Use My Location</span>
                      </Button>

                      <div className='space-y-2'>
                        <div className='flex items-center justify-between'>
                          <Label htmlFor='radius-slider'>Search Radius</Label>
                          <span className='text-sm font-medium'>
                            {locationFilter.radius} km
                          </span>
                        </div>
                        <Slider
                          id='radius-slider'
                          min={1}
                          max={50}
                          step={1}
                          value={[locationFilter.radius]}
                          onValueChange={handleRadiusChange}
                          className='my-4'
                        />
                      </div>

                      <div className='pt-2'>
                        <Label className='text-muted-foreground text-xs'>
                          Current Location:
                        </Label>
                        <div className='mt-1 p-2 bg-muted rounded text-xs font-mono'>
                          <div>Lat: {locationFilter.center.lat.toFixed(6)}</div>
                          <div>Lng: {locationFilter.center.lng.toFixed(6)}</div>
                        </div>
                      </div>

                      <div className='text-xs text-muted-foreground mt-2'>
                        <p>
                          Click on the map or drag the marker to set your search
                          location
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className='flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2 mt-4'>
                  <DialogClose asChild>
                    <Button variant='outline'>Cancel</Button>
                  </DialogClose>
                  <Button onClick={applyMapFilters} className='font-medium'>
                    Apply Location Filter
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Additional filters toggle */}
            <Collapsible
              open={showFiltersPanel}
              onOpenChange={setShowFiltersPanel}
              className='sm:w-1/3'
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant='outline'
                  className='w-full flex justify-between shadow-sm hover:shadow transition-all'
                >
                  <span>Filters</span>
                  <SlidersHorizontal className='h-4 w-4 ml-2' />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className='mt-3 bg-background p-3 rounded-md border border-border/40'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <div className='text-sm font-medium'>Category</div>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='All Categories' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>All Categories</SelectItem>
                        {itemCategories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='w-full text-xs'
                      onClick={resetAllFilters}
                    >
                      Reset All Filters
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Active filters display */}
          {(type !== "all" || category !== "all" || locationFilter.enabled) && (
            <div className='flex flex-wrap gap-2 pt-1'>
              {type !== "all" && (
                <Badge variant='secondary' className='flex items-center gap-1'>
                  {type === "lost" ? "Lost Items" : "Found Items"}
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => setType("all")}
                  />
                </Badge>
              )}

              {category !== "all" && (
                <Badge variant='secondary' className='flex items-center gap-1'>
                  {itemCategories.find((cat) => cat.value === category)
                    ?.label || category}
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => setCategory("all")}
                  />
                </Badge>
              )}

              {locationFilter.enabled && (
                <Badge variant='secondary' className='flex items-center gap-1'>
                  Location: {locationFilter.radius}km radius
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={toggleLocationFilter}
                  />
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results count */}
      <div className='text-sm text-muted-foreground flex items-center justify-between'>
        <div>
          Found {totalCount} {totalCount === 1 ? "item" : "items"}
        </div>
        {totalCount > 0 && (
          <div className='text-xs'>
            Showing {items.length} of {totalCount}
          </div>
        )}
      </div>

      {/* Items grid */}
      {loading && items.length === 0 ? (
        <div className='flex justify-center py-16 my-8'>
          <div className='flex flex-col items-center space-y-4'>
            <Loader2 className='h-10 w-10 animate-spin text-primary' />
            <p className='text-muted-foreground'>Loading items...</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16 my-8 bg-accent/5 rounded-lg border border-border/30 text-center'>
          <div className='bg-muted/50 rounded-full p-4 mb-4'>
            <Search className='h-8 w-8 text-muted-foreground' />
          </div>
          <p className='text-lg font-medium mb-1'>No items found</p>
          <p className='text-muted-foreground max-w-md'>
            Try adjusting your filters or search query to find what you're
            looking for
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8'>
          {items.map((item) => (
            <div
              key={item.id}
              className='transform transition-transform hover:-translate-y-1 duration-300'
            >
              <ItemCard
                key={item.id}
                item={item}
                showContactInfo={false}
                showClaimButton={true} // Always show claim button to everyone
                isOwnItem={!!userId && item.user_id === userId}
                onClaimStatusChange={handleItemUpdate}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {showPagination && hasMore && (
        <div className='flex justify-center mt-12'>
          <Button
            onClick={handleLoadMore}
            disabled={loading || !hasMore}
            variant='outline'
            size='lg'
            className='shadow-sm hover:shadow'
          >
            {loading ? (
              <>
                <Loader2 className='mr-2 h-5 w-5 animate-spin' />
                Loading more items...
              </>
            ) : (
              "Load More Items"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
