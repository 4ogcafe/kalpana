import type { DeliverySettings } from '../lib/fulfillment.js';
import type { LoyaltySettings } from '../lib/loyalty.js';
import { prisma } from '../lib/prisma.js';
import type { PickupSettings } from '../lib/pickup.js';
import type { StampSettings } from '../lib/stamps.js';

export type StoredSettings = PickupSettings & DeliverySettings & LoyaltySettings & StampSettings & {
  pickupNoteJa?: string | null;
  taxRatePercent?: number | null;
  orderingPausedUntil?: Date | null;
};

export const loadSettings = async (): Promise<StoredSettings> => {
  const row = await prisma.settings.findFirst();
  return (row ?? {}) as unknown as StoredSettings;
};
