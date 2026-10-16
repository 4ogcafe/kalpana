-- Remove dining/tables feature: drop DiningTable, TableSession, and all related columns

DROP TABLE IF EXISTS `_CustomerToTableSession`;
DROP TABLE IF EXISTS `TableSession`;
DROP TABLE IF EXISTS `DiningTable`;

-- PickupOrder: drop dining-related columns and their index
ALTER TABLE `PickupOrder` DROP INDEX IF EXISTS `PickupOrder_sessionId_idx`;
ALTER TABLE `PickupOrder`
  DROP COLUMN IF EXISTS `tableId`,
  DROP COLUMN IF EXISTS `tableNumber`,
  DROP COLUMN IF EXISTS `sessionId`;

-- Settings: drop dining-related columns
ALTER TABLE `Settings`
  DROP COLUMN IF EXISTS `diningEnabled`,
  DROP COLUMN IF EXISTS `diningSelfOpen`,
  DROP COLUMN IF EXISTS `diningTargetMinutes`;

-- Category: drop dineIn column
ALTER TABLE `Category` DROP COLUMN IF EXISTS `dineIn`;

-- PushSubscription: drop sessionIds column
ALTER TABLE `PushSubscription` DROP COLUMN IF EXISTS `sessionIds`;
