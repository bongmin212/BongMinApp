// Desktop notification utility
export class DesktopNotification {
  private static permission: NotificationPermission = 'default';
  private static isSupported = typeof window !== 'undefined' && 'Notification' in window;

  static async requestPermission(): Promise<boolean> {
    if (!this.isSupported) return false;

    if (this.permission === 'granted') return true;
    if (this.permission === 'denied') return false;

    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (error) {
      // Failed to request notification permission - ignore
      return false;
    }
  }

  static async show(
    title: string, 
    options: NotificationOptions & { 
      priority?: 'low' | 'medium' | 'high';
      actionUrl?: string;
    } = {}
  ): Promise<void> {
    if (!this.isSupported || this.permission !== 'granted') return;

    const { priority = 'medium', actionUrl, ...notificationOptions } = options;

    try {
      const notification = new Notification(title, {
        icon: '/logo.png',
        badge: '/logo.png',
        requireInteraction: priority === 'high',
        ...notificationOptions
      });

      // Handle click to focus and navigate
      notification.onclick = () => {
        window.focus();
        notification.close();
        
        if (actionUrl) {
          // Navigate to the action URL
          const url = new URL(actionUrl, window.location.origin);
          window.location.href = url.pathname + url.search;
        }
      };

      // Auto-close after delay (except for high priority)
      if (priority !== 'high') {
        setTimeout(() => notification.close(), 5000);
      }
    } catch (error) {
      // Failed to show desktop notification - ignore
    }
  }

  static isPermissionGranted(): boolean {
    return this.permission === 'granted';
  }

  static isAvailable(): boolean {
    return this.isSupported;
  }
}
