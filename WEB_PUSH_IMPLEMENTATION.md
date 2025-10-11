# Web Push Notification Implementation Guide

## Overview

This document describes how to implement true browser push notifications for Terraforming Mars, allowing players to receive notifications when it's their turn even when the browser tab is closed or inactive.

## Current State

The game already has a basic client-side notification system in `src/client/components/WaitingFor.vue:206-234`:
- Shows browser notification when it becomes a player's turn
- Requires the browser tab to remain open
- Relies on active polling via `/api/waitingfor` endpoint
- Has a placeholder service worker at `src/client/sw.ts`

## Architecture Overview

### Web Push Flow
1. **User enables push notifications** in preferences
2. **Client requests permission** from browser
3. **Client subscribes** to push service (browser's push server)
4. **Subscription sent to server** and stored in database
5. **Game logic triggers notification** when player becomes active
6. **Server sends push message** to browser's push service via web-push library
7. **Browser receives push** even if tab is closed/inactive
8. **Service worker displays notification** to user

### Technology Stack
- **Client**: Service Worker API, Push API, Notification API
- **Server**: `web-push` npm package, VAPID authentication
- **Protocol**: Web Push Protocol (RFC 8030)

## Implementation Steps

### Step 1: Install Dependencies

```bash
npm install web-push --save
npm install @types/web-push --save-dev
```

### Step 2: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys identify your server to push services.

```bash
npx web-push generate-vapid-keys
```

Add to `.env`:
```bash
VAPID_PUBLIC_KEY=<your_public_key>
VAPID_PRIVATE_KEY=<your_private_key>
VAPID_SUBJECT=mailto:admin@your-server.com
```

Update `.env.sample`:
```bash
## Web Push Notification Configuration
## Generate VAPID keys with: npx web-push generate-vapid-keys
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
# VAPID_SUBJECT=mailto:admin@example.com
```

### Step 3: Client-Side Implementation

#### 3.1 Update Service Worker (`src/client/sw.ts`)

Replace the empty service worker with:

```typescript
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Handle push events from the server
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const title = data.title || 'Terraforming Mars';
  const options: NotificationOptions = {
    body: data.body || "It's your turn!",
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'tm-turn-notification',
    requireInteraction: false,
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true})
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

export {};
```

#### 3.2 Create Push Manager (`src/client/utils/PushManager.ts`)

```typescript
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
    playerId: string
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
```

#### 3.3 Add Preference (`src/client/utils/PreferencesManager.ts`)

Update the `Preferences` type:
```typescript
export type Preferences = {
  // ... existing preferences
  enable_push_notifications: boolean,
  // ...
}
```

Update defaults:
```typescript
const defaults: Preferences = {
  // ... existing defaults
  enable_push_notifications: false,
  // ...
};
```

#### 3.4 Update Preferences Dialog (`src/client/components/PreferencesDialog.vue`)

Add checkbox after the "Enable sounds" preference (around line 44):

```vue
<div class="preferences_panel_item">
  <label class="form-switch">
    <input type="checkbox" v-on:change="handlePushToggle" v-model="prefs.enable_push_notifications" data-test="enable_push_notifications">
    <i class="form-icon"></i> <span v-i18n>Enable push notifications</span>
    <span class="tooltip tooltip-left" :data-tooltip="$t('Receive notifications when it\'s your turn, even with browser closed')">&#9432;</span>
  </label>
</div>
```

Update the script section to add the handler method:

```typescript
methods: {
  // ... existing methods
  handlePushToggle() {
    const prefs = PreferencesManager.INSTANCE.values();
    const pushManager = getPushManager();

    if (prefs.enable_push_notifications) {
      // Subscribe to push notifications
      const playerView = vueRoot(this).playerView;
      if (playerView && isPlayerId(playerView.id)) {
        const vapidKey = this.settings.vapidPublicKey; // Need to add this to settings
        pushManager.subscribe(vapidKey, playerView.id).catch((err) => {
          console.error('Failed to subscribe to push notifications:', err);
          // Revert the preference
          PreferencesManager.INSTANCE.set('enable_push_notifications', false);
          this.prefs.enable_push_notifications = false;
        });
      }
    } else {
      // Unsubscribe from push notifications
      const playerView = vueRoot(this).playerView;
      if (playerView && isPlayerId(playerView.id)) {
        pushManager.unsubscribe(playerView.id).catch((err) => {
          console.error('Failed to unsubscribe from push notifications:', err);
        });
      }
    }

    this.updatePreferences();
  },
}
```

#### 3.5 Add API Paths (`src/common/app/paths.ts`)

Add new constants:
```typescript
export const paths = {
  // ... existing paths
  API_PUSH_SUBSCRIBE: '/api/push/subscribe',
  API_PUSH_UNSUBSCRIBE: '/api/push/unsubscribe',
  // ...
} as const;
```

#### 3.6 Pass VAPID Key to Client

Update `src/genfiles/settings.json` generation (in `src/tools/make_static_json.ts` or similar) to include:
```typescript
{
  // ... existing settings
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
}
```

### Step 4: Server-Side Implementation

#### 4.1 Create Push Subscription Model (`src/server/player/PushSubscription.ts`)

```typescript
export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface StoredPushSubscription {
  id: number;
  playerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  lastUsed: Date;
}

export function serializePushSubscription(sub: StoredPushSubscription): PushSubscriptionData {
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };
}
```

#### 4.2 Create Push Notification Sender (`src/server/utils/PushNotificationSender.ts`)

```typescript
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
    payload: PushNotificationPayload
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
    payload: PushNotificationPayload
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        subscription as any, // web-push expects PushSubscription type
        JSON.stringify(payload)
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
```

#### 4.3 Update Database Interface (`src/server/database/IDatabase.ts`)

Add methods to the `IDatabase` interface:

```typescript
import {PushSubscriptionData, StoredPushSubscription} from '../player/PushSubscription';

export interface IDatabase {
  // ... existing methods

  /**
   * Store a push subscription for a player
   */
  savePushSubscription(playerId: PlayerId, subscription: PushSubscriptionData): Promise<void>;

  /**
   * Get all push subscriptions for a player
   */
  getPushSubscriptions(playerId: PlayerId): Promise<PushSubscriptionData[]>;

  /**
   * Delete a specific push subscription
   */
  deletePushSubscription(playerId: PlayerId, endpoint: string): Promise<void>;

  /**
   * Delete all push subscriptions for a player
   */
  deleteAllPushSubscriptions(playerId: PlayerId): Promise<void>;

  /**
   * Update the last used timestamp for a subscription
   */
  updatePushSubscriptionLastUsed(playerId: PlayerId, endpoint: string): Promise<void>;
}
```

#### 4.4 Implement Database Methods

**For PostgreSQL (`src/server/database/PostgreSQL.ts`):**

Add table creation in `initialize()`:
```typescript
async initialize(): Promise<void> {
  // ... existing initialization

  await this.client.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      player_id VARCHAR(64) NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_player_id (player_id)
    )
  `);
}
```

Implement methods:
```typescript
async savePushSubscription(playerId: PlayerId, subscription: PushSubscriptionData): Promise<void> {
  await this.client.query(
    `INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
     SET p256dh = $3, auth = $4, last_used = CURRENT_TIMESTAMP`,
    [playerId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
}

async getPushSubscriptions(playerId: PlayerId): Promise<PushSubscriptionData[]> {
  const result = await this.client.query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE player_id = $1',
    [playerId]
  );

  return result.rows.map((row) => ({
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  }));
}

async deletePushSubscription(playerId: PlayerId, endpoint: string): Promise<void> {
  await this.client.query(
    'DELETE FROM push_subscriptions WHERE player_id = $1 AND endpoint = $2',
    [playerId, endpoint]
  );
}

async deleteAllPushSubscriptions(playerId: PlayerId): Promise<void> {
  await this.client.query(
    'DELETE FROM push_subscriptions WHERE player_id = $1',
    [playerId]
  );
}

async updatePushSubscriptionLastUsed(playerId: PlayerId, endpoint: string): Promise<void> {
  await this.client.query(
    'UPDATE push_subscriptions SET last_used = CURRENT_TIMESTAMP WHERE player_id = $1 AND endpoint = $2',
    [playerId, endpoint]
  );
}
```

**For SQLite (`src/server/database/SQLite.ts`):**

Similar implementation with SQLite syntax:
```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**For LocalFilesystem (`src/server/database/LocalFilesystem.ts`):**

Store subscriptions in a JSON file per player:
```typescript
// Store in <LOCAL_FS_DB>/push_subscriptions/<playerId>.json
```

#### 4.5 Create API Routes

**Subscribe Route (`src/server/routes/ApiPushSubscribe.ts`):**

```typescript
import * as responses from '../server/responses';
import {Handler} from './Handler';
import {Context} from './IHandler';
import {Database} from '../database/Database';
import {isPlayerId} from '../../common/Types';
import {Request} from '../Request';
import {Response} from '../Response';
import {PushSubscriptionData} from '../player/PushSubscription';

export class ApiPushSubscribe extends Handler {
  public static readonly INSTANCE = new ApiPushSubscribe();
  private constructor() {
    super();
  }

  public override async post(req: Request, res: Response, ctx: Context): Promise<void> {
    try {
      const body = await this.getBody(req);
      const playerId = body.playerId;
      const subscription: PushSubscriptionData = body.subscription;

      if (!isPlayerId(playerId)) {
        responses.badRequest(req, res, 'Invalid player ID');
        return;
      }

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        responses.badRequest(req, res, 'Invalid subscription data');
        return;
      }

      const db = Database.getInstance();
      await db.savePushSubscription(playerId, subscription);

      responses.writeJson(res, ctx, {success: true});
    } catch (error) {
      responses.internalServerError(req, res, error);
    }
  }
}
```

**Unsubscribe Route (`src/server/routes/ApiPushUnsubscribe.ts`):**

```typescript
import * as responses from '../server/responses';
import {Handler} from './Handler';
import {Context} from './IHandler';
import {Database} from '../database/Database';
import {isPlayerId} from '../../common/Types';
import {Request} from '../Request';
import {Response} from '../Response';

export class ApiPushUnsubscribe extends Handler {
  public static readonly INSTANCE = new ApiPushUnsubscribe();
  private constructor() {
    super();
  }

  public override async post(req: Request, res: Response, ctx: Context): Promise<void> {
    try {
      const body = await this.getBody(req);
      const playerId = body.playerId;

      if (!isPlayerId(playerId)) {
        responses.badRequest(req, res, 'Invalid player ID');
        return;
      }

      const db = Database.getInstance();
      await db.deleteAllPushSubscriptions(playerId);

      responses.writeJson(res, ctx, {success: true});
    } catch (error) {
      responses.internalServerError(req, res, error);
    }
  }
}
```

#### 4.6 Register Routes (`src/server/server/requestProcessor.ts`)

Add route handlers:
```typescript
import {ApiPushSubscribe} from '../routes/ApiPushSubscribe';
import {ApiPushUnsubscribe} from '../routes/ApiPushUnsubscribe';

// In the route mapping section:
servables.set('/api/push/subscribe', ApiPushSubscribe.INSTANCE);
servables.set('/api/push/unsubscribe', ApiPushUnsubscribe.INSTANCE);
```

#### 4.7 Trigger Push Notifications (`src/server/Game.ts`)

Find where a player becomes active (likely in the deferred actions queue processing or turn management). Add push notification sending:

```typescript
import {PushNotificationSender} from './utils/PushNotificationSender';

// When player becomes active (example location, adjust as needed):
private notifyPlayerActive(player: IPlayer): void {
  // Send push notification
  const pushSender = PushNotificationSender.getInstance();
  pushSender.sendToPlayer(player.id, {
    title: 'Terraforming Mars',
    body: "It's your turn!",
    url: `/player?id=${player.id}`,
  }).catch((err) => {
    console.error('Failed to send push notification:', err);
  });
}
```

The exact integration point depends on the game flow, but likely candidates are:
- `Game.ts` when processing deferred actions and a player gets input
- When `player.setWaitingFor()` is called with a new input
- In the polling logic that returns 'GO' status in `ApiWaitingFor.ts`

### Step 5: Add Translations

Add to all locale files in `src/locales/*/preferences.json`:

**English (use as reference):**
```json
{
  "Enable push notifications": "Enable push notifications",
  "Receive notifications when it's your turn, even with browser closed": "Receive notifications when it's your turn, even with browser closed"
}
```

Then translate for:
- `bg/preferences.json` (Bulgarian)
- `br/preferences.json` (Brazilian Portuguese)
- `cn/preferences.json` (Chinese)
- `de/preferences.json` (German)
- `es/UI.json` (Spanish)
- `fr/preferences.json` (French)
- `hu/preferences.json` (Hungarian)
- `it/ui.json` (Italian)
- `jp/preferences.json` (Japanese)
- `ko/preferences.json` (Korean)
- `nb/preferences.json` (Norwegian)
- `nl/preferences.json` (Dutch)
- `pl/preferences.json` (Polish)
- `ru/preferences.json` (Russian)
- `ua/preferences.json` (Ukrainian)

### Step 6: Testing

#### Local Testing
1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add keys to `.env`
3. Build and start server: `npm run build && npm start`
4. Open game in browser (must be HTTPS or localhost)
5. Enable push notifications in preferences
6. Close browser tab
7. Have another player take a turn to make it your turn
8. Verify push notification appears

#### Production Testing
1. Ensure VAPID keys are set in production environment
2. Test with multiple browsers (Chrome, Firefox, Edge, Safari)
3. Test notification permissions flow
4. Test with browser closed
5. Test with multiple tabs open
6. Test subscription persistence across page reloads

### Step 7: Documentation

Update `CLAUDE.md` with:
```markdown
### Push Notifications

The game supports Web Push notifications to alert players when it's their turn:

**Setup:**
1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add to `.env`:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (mailto: or https: URL)
3. Restart server

**User Flow:**
- Players enable "Push notifications" in preferences
- Browser requests permission
- Notifications work even when browser is closed
- Players can disable anytime in preferences

**Database:**
Push subscriptions are stored in `push_subscriptions` table/collection.
```

## Security Considerations

1. **VAPID Keys**: Keep private key secret, never commit to git
2. **Subscription Validation**: Validate subscription data before storing
3. **Rate Limiting**: Consider rate limiting push subscription endpoints
4. **Endpoint Expiration**: Clean up old/expired subscriptions periodically
5. **User Privacy**: Only send notifications for the subscribed player's turns

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Requires iOS 16.4+ / macOS 13+
- Opera: Full support

## Troubleshooting

**Notifications not appearing:**
- Check browser console for errors
- Verify VAPID keys are correct
- Ensure HTTPS is enabled (or using localhost)
- Check browser notification permissions
- Verify service worker is registered

**Subscription fails:**
- Check VAPID public key is accessible to client
- Verify service worker is properly registered
- Check for CORS issues
- Ensure push service is reachable

**Database errors:**
- Verify push_subscriptions table exists
- Check database migrations ran successfully
- Validate subscription data format

## Future Enhancements

1. **Notification batching**: Group multiple turn notifications
2. **Notification preferences**: Customize notification types
3. **Sound/vibration**: Add notification sounds in service worker
4. **Badge counts**: Show number of waiting games
5. **Notification actions**: Quick actions like "View Game" or "Pass Turn"
6. **Multi-device**: Manage subscriptions across devices
7. **Notification history**: Track sent notifications
8. **Analytics**: Monitor notification delivery rates
