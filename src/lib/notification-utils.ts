/**
 * Utility functions for handling browser notifications in a cross-browser compatible way
 */

/**
 * Check if the browser supports notifications
 */
export const isBrowserNotificationSupported = (): boolean => {
  return "Notification" in window;
};

/**
 * Check if the browser is Safari
 */
export const isSafari = (): boolean => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

/**
 * Get current notification permission status
 */
export const getNotificationPermission = (): NotificationPermission | null => {
  if (!isBrowserNotificationSupported()) return null;
  return Notification.permission;
};

/**
 * Request notification permission in a way that works for all browsers including Safari
 * Must be called in response to a user action (click, tap, etc.)
 * @returns Promise that resolves to the permission state
 */
export const requestNotificationPermission =
  async (): Promise<NotificationPermission> => {
    // If notifications are not supported, just return "denied"
    if (!isBrowserNotificationSupported()) {
      return "denied";
    }

    // If we already have permission, no need to ask again
    if (Notification.permission === "granted") {
      return "granted";
    }

    // If permission was previously denied, don't ask again
    if (Notification.permission === "denied") {
      return "denied";
    }

    try {
      // Request permission, using a try-catch for Safari compatibility
      const permission = await Notification.requestPermission();
      return permission;
    } catch (error) {
      // For older browsers that don't support the Promise-based API
      console.log("Using legacy notification permission request");
      return new Promise((resolve) => {
        Notification.requestPermission((permission) => {
          resolve(permission);
        });
      });
    }
  };

/**
 * Show a notification if permission is granted
 * @param title Notification title
 * @param options Notification options
 * @returns boolean indicating if notification was shown
 */
export const showNotification = (
  title: string,
  options: NotificationOptions = {}
): boolean => {
  if (
    !isBrowserNotificationSupported() ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  try {
    new Notification(title, options);
    return true;
  } catch (error) {
    console.error("Error showing notification:", error);
    return false;
  }
};
