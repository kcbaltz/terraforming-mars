import {paths} from '@/common/app/paths';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export class PushManager {
  private static INSTANCE = new PushManager();

  public static getInstance(): PushManager {
    return this.INSTANCE;
  }

  private constructor() {}

  /**
   * Check if push notifications are supported
   */
  public isSupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      window.isSecureContext
    );
  }

  /**
   * Get current permission state
   */
  public getPermission(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * Request notification permission from user
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      throw new Error('Push notifications not supported');
    }
    return await Notification.requestPermission();
  }

  /**
   * Subscribe to push notifications
   * @param vapidPublicKey - Server's public VAPID key
   * @param playerId - Current player ID
   */
  public async subscribe(vapidPublicKey: string, playerId: string): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Push notifications not supported');
    }

    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push service
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // Send subscription to server
    await this.sendSubscriptionToServer(subscription, playerId);
  }

  /**
   * Unsubscribe from push notifications
   * @param playerId - Current player ID
   */
  public async unsubscribe(playerId: string): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Unsubscribe from push service
      await subscription.unsubscribe();

      // Notify server
      await this.sendUnsubscribeToServer(playerId);
    }
  }

  /**
   * Send subscription details to server
   */
  private async sendSubscriptionToServer(
    subscription: PushSubscription,
    playerId: string,
  ): Promise<void> {
    const subscriptionData = this.serializeSubscription(subscription);

    const response = await fetch(paths.API_PUSH_SUBSCRIBE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playerId,
        subscription: subscriptionData,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send subscription to server');
    }
  }

  /**
   * Notify server of unsubscribe
   */
  private async sendUnsubscribeToServer(playerId: string): Promise<void> {
    const response = await fetch(paths.API_PUSH_UNSUBSCRIBE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({playerId}),
    });

    if (!response.ok) {
      console.warn('Failed to notify server of unsubscribe');
    }
  }

  /**
   * Serialize PushSubscription to JSON
   */
  private serializeSubscription(subscription: PushSubscription): PushSubscriptionData {
    const keys = subscription.toJSON().keys;
    if (!keys || !keys.p256dh || !keys.auth) {
      throw new Error('Invalid subscription keys');
    }

    return {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    };
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export function getPushManager(): PushManager {
  return PushManager.getInstance();
}
