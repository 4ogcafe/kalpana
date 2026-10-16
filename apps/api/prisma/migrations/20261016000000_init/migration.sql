-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'STAFF', 'KITCHEN') NOT NULL DEFAULT 'STAFF',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Menu` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('LUNCH', 'TAKEOUT', 'GRAND') NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `nameJa` VARCHAR(191) NULL,
    `descriptionEn` TEXT NULL,
    `descriptionJa` TEXT NULL,
    `servingHours` JSON NULL,
    `notesEn` TEXT NULL,
    `notesJa` TEXT NULL,
    `pdfUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Menu_type_key`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `dineIn` BOOLEAN NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `nameJa` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `parentId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MenuItem` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `menuTypes` JSON NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `nameJa` VARCHAR(191) NULL,
    `descriptionEn` TEXT NULL,
    `descriptionJa` TEXT NULL,
    `price` INTEGER NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `rating` DOUBLE NULL,
    `spiceLevel` INTEGER NOT NULL DEFAULT 0,
    `isVegetarian` BOOLEAN NOT NULL DEFAULT false,
    `isVegan` BOOLEAN NOT NULL DEFAULT false,
    `isHalal` BOOLEAN NOT NULL DEFAULT false,
    `isGlutenFree` BOOLEAN NOT NULL DEFAULT false,
    `allergens` JSON NOT NULL,
    `isRecommended` BOOLEAN NOT NULL DEFAULT false,
    `isSoldOut` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MenuItem_categoryId_sortOrder_idx`(`categoryId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemVariant` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NOT NULL,
    `labelJa` VARCHAR(191) NULL,
    `price` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OptionGroup` (
    `id` VARCHAR(191) NOT NULL,
    `nameJa` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'RADIO',
    `required` BOOLEAN NOT NULL DEFAULT true,
    `options` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarouselSlide` (
    `id` VARCHAR(191) NOT NULL,
    `placement` ENUM('HOME', 'CONTACT') NOT NULL,
    `imageUrl` VARCHAR(191) NOT NULL,
    `altEn` VARCHAR(191) NOT NULL,
    `altJa` VARCHAR(191) NULL,
    `titleEn` VARCHAR(191) NULL,
    `titleJa` VARCHAR(191) NULL,
    `subtitleEn` VARCHAR(191) NULL,
    `subtitleJa` VARCHAR(191) NULL,
    `ctaLabelEn` VARCHAR(191) NULL,
    `ctaLabelJa` VARCHAR(191) NULL,
    `ctaLink` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Settings` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `addressEn` VARCHAR(191) NULL,
    `addressJa` VARCHAR(191) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Tokyo',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'JPY',
    `weeklyHours` JSON NULL,
    `holidays` JSON NULL,
    `socials` JSON NULL,
    `googlePlaceId` VARCHAR(191) NULL,
    `mapUrl` VARCHAR(191) NULL,
    `googleMapsLink` VARCHAR(191) NULL,
    `aboutEn` TEXT NULL,
    `aboutJa` TEXT NULL,
    `aboutHeroImage` VARCHAR(191) NULL,
    `aboutStoryJa` TEXT NULL,
    `aboutStoryLabelJa` VARCHAR(191) NULL,
    `aboutStoryTitleJa` VARCHAR(191) NULL,
    `aboutSpiceLabelJa` VARCHAR(191) NULL,
    `aboutSpiceTitleJa` VARCHAR(191) NULL,
    `aboutSpiceDescJa` TEXT NULL,
    `aboutSpiceImage` VARCHAR(191) NULL,
    `aboutChefLabelJa` VARCHAR(191) NULL,
    `aboutChefTitleJa` VARCHAR(191) NULL,
    `aboutChefDescJa` TEXT NULL,
    `aboutChefImage` VARCHAR(191) NULL,
    `contactHeroImage` VARCHAR(191) NULL,
    `menuLunchHeroImage` VARCHAR(191) NULL,
    `menuTakeoutHeroImage` VARCHAR(191) NULL,
    `menuGrandHeroImage` VARCHAR(191) NULL,
    `pickupEnabled` BOOLEAN NOT NULL DEFAULT false,
    `pickupHours` VARCHAR(191) NULL,
    `pickupClosedDays` JSON NULL,
    `pickupClosedDates` JSON NULL,
    `pickupLeadMinutes` INTEGER NULL,
    `pickupNoteJa` VARCHAR(191) NULL,
    `publicSiteUrl` VARCHAR(191) NULL,
    `footerLogo` VARCHAR(191) NULL,
    `footerBrand` VARCHAR(191) NULL,
    `footerTaglineJa` VARCHAR(191) NULL,
    `footerCopyright` VARCHAR(191) NULL,
    `footerLinks` JSON NULL,
    `footerShowHours` BOOLEAN NULL,
    `footerShowSocials` BOOLEAN NULL,
    `googleReviewsMinRating` INTEGER NULL,
    `storeReviewCount` INTEGER NULL,
    `featuredReviews` JSON NULL,
    `storeReviewScore` VARCHAR(191) NULL,
    `storeReviewText` VARCHAR(191) NULL,
    `storeReviewLink` VARCHAR(191) NULL,
    `diningEnabled` BOOLEAN NULL,
    `diningSelfOpen` BOOLEAN NULL,
    `diningTargetMinutes` INTEGER NULL,
    `orderingPausedUntil` DATETIME(3) NULL,
    `pointsEnabled` BOOLEAN NULL,
    `pointsPer100Yen` INTEGER NULL,
    `pointValueYen` INTEGER NULL,
    `signupBonusPoints` INTEGER NULL,
    `taxRatePercent` INTEGER NULL,
    `deliveryEnabled` BOOLEAN NULL,
    `deliveryFee` INTEGER NULL,
    `deliveryMinOrder` INTEGER NULL,
    `deliveryAreas` JSON NULL,
    `deliveryLeadMinutes` INTEGER NULL,
    `stampsEnabled` BOOLEAN NULL,
    `stampsPerCard` INTEGER NULL,
    `stampMinAmount` INTEGER NULL,
    `stampCooldownHours` INTEGER NULL,
    `stampRewardValidDays` INTEGER NULL,
    `stampRewards` JSON NULL,
    `welcomeTitleEn` VARCHAR(191) NULL,
    `welcomeTitleJa` VARCHAR(191) NULL,
    `welcomeTextJa` TEXT NULL,
    `storeSectionLabelJa` VARCHAR(191) NULL,
    `storeSectionTitleJa` VARCHAR(191) NULL,
    `storeSectionSubJa` TEXT NULL,
    `storeLocationJa` VARCHAR(191) NULL,
    `storeBadgeJa` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactMessage` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `type` ENUM('GENERAL', 'RESERVATION', 'CATERING', 'FEEDBACK') NOT NULL DEFAULT 'GENERAL',
    `date` DATETIME(3) NULL,
    `guests` INTEGER NULL,
    `message` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PickupOrder` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `dateKey` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `status` ENUM('NEW', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `customerName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `pickupAt` DATETIME(3) NOT NULL,
    `items` JSON NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `subtotal` INTEGER NULL,
    `offer` JSON NULL,
    `pointsUsed` INTEGER NOT NULL DEFAULT 0,
    `pointsDiscount` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL,
    `taxRate` INTEGER NULL,
    `tax` INTEGER NULL,
    `grandTotal` INTEGER NULL,
    `pointsEarned` INTEGER NOT NULL DEFAULT 0,
    `tableId` VARCHAR(191) NULL,
    `tableNumber` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `readyAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `ip` VARCHAR(191) NULL,
    `fulfillment` VARCHAR(191) NOT NULL DEFAULT 'PICKUP',
    `deliveryFee` INTEGER NULL,
    `deliveryAddress` JSON NULL,
    `reward` JSON NULL,
    `stampAwarded` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PickupOrder_token_key`(`token`),
    INDEX `PickupOrder_status_pickupAt_idx`(`status`, `pickupAt`),
    INDEX `PickupOrder_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `PickupOrder_sessionId_idx`(`sessionId`),
    INDEX `PickupOrder_dateKey_idx`(`dateKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameKana` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `birthDate` VARCHAR(191) NULL,
    `address` JSON NULL,
    `preferences` JSON NULL,
    `newsletterOptIn` BOOLEAN NOT NULL DEFAULT false,
    `newsletterOptInAt` DATETIME(3) NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `memberCode` VARCHAR(191) NULL,
    `stampCount` INTEGER NOT NULL DEFAULT 0,
    `stampTotal` INTEGER NOT NULL DEFAULT 0,
    `stampCardsCompleted` INTEGER NOT NULL DEFAULT 0,
    `lastStampAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_email_key`(`email`),
    UNIQUE INDEX `Customer_memberCode_key`(`memberCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PointTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `type` ENUM('EARN', 'REDEEM', 'REFUND', 'BONUS', 'ADJUST') NOT NULL,
    `points` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `orderNumber` INTEGER NULL,
    `note` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PointTransaction_customerId_createdAt_idx`(`customerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` VARCHAR(191) NOT NULL,
    `titleJa` VARCHAR(191) NOT NULL,
    `descriptionJa` TEXT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `discountType` ENUM('PERCENT', 'AMOUNT') NOT NULL,
    `discountValue` INTEGER NOT NULL,
    `minSubtotal` INTEGER NOT NULL DEFAULT 0,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `oncePerCustomer` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderCounter` (
    `id` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `diff` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiningTable` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `seats` INTEGER NOT NULL DEFAULT 4,
    `area` VARCHAR(191) NULL,
    `qrToken` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiningTable_number_key`(`number`),
    UNIQUE INDEX `DiningTable_qrToken_key`(`qrToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TableSession` (
    `id` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `tableNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'BILL_REQUESTED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `guests` INTEGER NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `openedBy` VARCHAR(191) NOT NULL,
    `calls` JSON NULL,
    `lastOrderAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `subtotal` INTEGER NULL,
    `tax` INTEGER NULL,
    `total` INTEGER NULL,

    INDEX `TableSession_tableId_status_idx`(`tableId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stamp` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `card` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `amount` INTEGER NULL,
    `orderId` VARCHAR(191) NULL,
    `orderNumber` INTEGER NULL,
    `userId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Stamp_orderId_key`(`orderId`),
    INDEX `Stamp_customerId_createdAt_idx`(`customerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StampReward` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `titleJa` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `amount` INTEGER NULL,
    `at` INTEGER NULL,
    `card` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'AVAILABLE',
    `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `orderId` VARCHAR(191) NULL,
    `orderNumber` INTEGER NULL,
    `usedBy` VARCHAR(191) NULL,

    INDEX `StampReward_customerId_status_earnedAt_idx`(`customerId`, `status`, `earnedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSecret` (
    `id` VARCHAR(191) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `privateKey` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(1000) NOT NULL,
    `p256dh` VARCHAR(500) NOT NULL,
    `auth` VARCHAR(200) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `orderIds` JSON NULL,
    `sessionIds` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    INDEX `PushSubscription_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SquarePayment` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `tableNumber` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'JPY',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `squarePaymentId` VARCHAR(191) NULL,
    `squareCheckoutId` VARCHAR(191) NULL,
    `squareLinkId` VARCHAR(191) NULL,
    `squareOrderId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `failureCode` VARCHAR(191) NULL,
    `refundedAmount` INTEGER NOT NULL DEFAULT 0,
    `closedByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SquarePayment_idempotencyKey_key`(`idempotencyKey`),
    INDEX `SquarePayment_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `SquarePayment_squarePaymentId_idx`(`squarePaymentId`),
    INDEX `SquarePayment_squareCheckoutId_idx`(`squareCheckoutId`),
    INDEX `SquarePayment_squareLinkId_idx`(`squareLinkId`),
    INDEX `SquarePayment_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SquareWebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `squareEventId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `processingStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payload` JSON NOT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `SquareWebhookEvent_squareEventId_key`(`squareEventId`),
    INDEX `SquareWebhookEvent_processingStatus_idx`(`processingStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoogleReviewCache` (
    `id` VARCHAR(191) NOT NULL,
    `placeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `rating` DOUBLE NULL,
    `userRatingCount` INTEGER NULL,
    `mapsUrl` VARCHAR(191) NULL,
    `reviews` JSON NOT NULL,
    `fetchedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `lastErrorAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_CategoryToMenu` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_CategoryToMenu_AB_unique`(`A`, `B`),
    INDEX `_CategoryToMenu_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_MenuItemToOptionGroup` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_MenuItemToOptionGroup_AB_unique`(`A`, `B`),
    INDEX `_MenuItemToOptionGroup_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_CustomerToTableSession` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_CustomerToTableSession_AB_unique`(`A`, `B`),
    INDEX `_CustomerToTableSession_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Category`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `MenuItem` ADD CONSTRAINT `MenuItem_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemVariant` ADD CONSTRAINT `ItemVariant_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TableSession` ADD CONSTRAINT `TableSession_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DiningTable`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CategoryToMenu` ADD CONSTRAINT `_CategoryToMenu_A_fkey` FOREIGN KEY (`A`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CategoryToMenu` ADD CONSTRAINT `_CategoryToMenu_B_fkey` FOREIGN KEY (`B`) REFERENCES `Menu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MenuItemToOptionGroup` ADD CONSTRAINT `_MenuItemToOptionGroup_A_fkey` FOREIGN KEY (`A`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MenuItemToOptionGroup` ADD CONSTRAINT `_MenuItemToOptionGroup_B_fkey` FOREIGN KEY (`B`) REFERENCES `OptionGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CustomerToTableSession` ADD CONSTRAINT `_CustomerToTableSession_A_fkey` FOREIGN KEY (`A`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CustomerToTableSession` ADD CONSTRAINT `_CustomerToTableSession_B_fkey` FOREIGN KEY (`B`) REFERENCES `TableSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

