import type { DiningSettings } from '../lib/dining.js';
import type { DeliverySettings } from '../lib/fulfillment.js';
import type { LoyaltySettings } from '../lib/loyalty.js';
import { db } from '../lib/mongo.js';
import type { PickupSettings } from '../lib/pickup.js';
import type { StampSettings } from '../lib/stamps.js';

export type StoredSettings = PickupSettings & DeliverySettings & DiningSettings & LoyaltySettings & StampSettings & {
  pickupNoteJa?: string | null;
  taxRatePercent?: number | null;
  orderingPausedUntil?: Date | null;
};

export const loadSettings = async (): Promise<StoredSettings> =>
  ((await db().collection('Settings').findOne({})) ?? {}) as StoredSettings;
