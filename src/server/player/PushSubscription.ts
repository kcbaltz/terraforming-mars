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
