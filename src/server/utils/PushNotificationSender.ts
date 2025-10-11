import * as webpush from 'web-push';
import {PlayerId} from '../../common/Types';
import {Database} from '../database/Database';
import {PushSubscriptionData} from '../player/PushSubscription';

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
}

export class PushNotificationSender {
  private static instance: PushNotificationSender | undefined;

  public static getInstance(): PushNotificationSender {
    if (!this.instance) {
      this.instance = new PushNotificationSender();
    }
    return this.instance;
  }

  private constructor() {
    this.initialize();
  }

  private initialize(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@terraforming-mars.com';

    if (!publicKey || !privateKey) {
      console.warn('VAPID keys not configured. Push notifications will not work.');
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  /**
   * Send push notification to a player
   */
  public async sendToPlayer(
    playerId: PlayerId,
    payload: PushNotificationPayload,
  ): Promise<void> {
    const db = Database.getInstance();
    const subscriptions = await db.getPushSubscriptions(playerId);

    if (subscriptions.length === 0) {
      return; // No subscriptions for this player
    }

    const promises = subscriptions.map((sub) => this.sendToSubscription(playerId, sub, payload));
    await Promise.allSettled(promises);
  }

  /**
   * Send push to a specific subscription
   */
  private async sendToSubscription(
    playerId: PlayerId,
    subscription: PushSubscriptionData,
    payload: PushNotificationPayload,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        subscription as any, // web-push expects PushSubscription type
        JSON.stringify(payload),
      );

      // Update last used timestamp
      const db = Database.getInstance();
      await db.updatePushSubscriptionLastUsed(playerId, subscription.endpoint);
    } catch (error: any) {
      console.error('Error sending push notification:', error);

      // If subscription is invalid/expired, remove it
      if (error.statusCode === 404 || error.statusCode === 410) {
        const db = Database.getInstance();
        await db.deletePushSubscription(playerId, subscription.endpoint);
      }
    }
  }
}
