<?php
/**
 * Kalpana Curry - Hostinger Production API Gateway
 * Bridges frontend requests directly to MySQL on Hostinger Shared Hosting
 */

// Global Exception Handler: ensure all uncaught exceptions return JSON, not HTML 500 error pages
set_exception_handler(function (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => [
            'code' => 'INTERNAL_SERVER_ERROR',
            'message' => $e->getMessage(),
        ],
    ]);
    exit;
});

// 1. CORS & Response Headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 2. Database Connection
// Credentials live outside the web root: <parent of public_html>/kalpana-config.php
// (see public_html/api/config.example.php), or in environment variables.
$configFile = dirname(__DIR__, 2) . '/kalpana-config.php';
$config = is_file($configFile) ? (require $configFile) : [];
if (!is_array($config)) $config = [];
$cfg = function (string $key, $default = null) use ($config) {
    if (isset($config[$key]) && $config[$key] !== '') return $config[$key];
    $env = getenv('KALPANA_' . strtoupper($key));
    return ($env !== false && $env !== '') ? $env : $default;
};

$dbHost = $cfg('db_host', '127.0.0.1');
$dbName = $cfg('db_name', 'u309882766_kalpanadb');
$dbUser = $cfg('db_user', 'u309882766_kalpana');
$dbPass = $cfg('db_pass', '64650@Mohan');
$jwtSecret = $cfg('jwt_secret', 'kalpana-dev-secret-change-in-production-32chars!!');

$pdoOptions = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_TIMEOUT => 3,
];

try {
    $pdo = new PDO("mysql:host={$dbHost};port=3306;dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, $pdoOptions);
} catch (PDOException $e) {
    if ($dbHost !== 'localhost') {
        try {
            $pdo = new PDO("mysql:host=localhost;dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, $pdoOptions);
        } catch (PDOException $e2) {
            http_response_code(500);
            echo json_encode(['error' => ['code' => 'DB_CONNECTION_FAILED', 'message' => 'Database connection failed: ' . $e2->getMessage()]]);
            exit;
        }
    } else {
        http_response_code(500);
        echo json_encode(['error' => ['code' => 'DB_CONNECTION_FAILED', 'message' => 'Database connection failed: ' . $e->getMessage()]]);
        exit;
    }
}

// Auto-seed baseline restaurant data if tables are empty
function ensureDefaultDatabaseData(PDO $pdo): array {
    $seeded = [];
    $now = date('Y-m-d H:i:s');

    // 1. User
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `User`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $adminHash = password_hash('admin123', PASSWORD_BCRYPT);
            $userIns = $pdo->prepare('INSERT INTO `User` (id, email, passwordHash, name, role, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)');
            $userIns->execute(['usr_admin_default', 'admin@example.com', $adminHash, 'Kalpana Admin', 'ADMIN', $now, $now]);
            $seeded['user'] = 1;
        }
    } catch (Exception $e) {}

    // 2. Menu
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `Menu`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $menuIns = $pdo->prepare('INSERT INTO `Menu` (id, type, nameEn, nameJa, isActive) VALUES (?, ?, ?, ?, 1)');
            $menuIns->execute(['menu_lunch', 'LUNCH', 'Lunch Menu', 'ランチメニュー']);
            $menuIns->execute(['menu_takeout', 'TAKEOUT', 'Takeout Menu', 'テイクアウトメニュー']);
            $menuIns->execute(['menu_grand', 'GRAND', 'Grand Menu', 'グランドメニュー']);
            $seeded['menu'] = 3;
        }
    } catch (Exception $e) {}

    // 3. Settings
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `Settings`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $hours = json_encode([
                'monday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
                'tuesday' => '定休日',
                'wednesday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
                'thursday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
                'friday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
                'saturday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
                'sunday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
            ], JSON_UNESCAPED_UNICODE);
            $holidays = json_encode(['regular' => '火曜日'], JSON_UNESCAPED_UNICODE);
            $featuredReviews = json_encode([
                [
                    'authorName' => '田中 健一',
                    'rating' => 5,
                    'dateLabel' => '1か月前',
                    'text' => '国道17号沿いにできた本格インド料理店。バターチキンカレーとチーズナンが最高！チーズが溢れるほど入っていてナンだけでも美味しくいただけます。ランチはおかわり無料でコスパも抜群。スタッフさんも笑顔でとても親切です。',
                ],
                [
                    'authorName' => '佐藤 美咲',
                    'rating' => 5,
                    'dateLabel' => '2か月前',
                    'text' => 'ダブルカレーランチ（チキンマサラと日替わり）をいただきました。炭火タンドールで焼かれたナンは熱々で香ばしく、モッチモチで大満足！辛さも選べるので辛口にしましたが、スパイスのコクがしっかり効いていて深みがあります。',
                ],
                [
                    'authorName' => '高橋 裕太',
                    'rating' => 5,
                    'dateLabel' => '3か月前',
                    'text' => '熊谷で一番美味しいインドカレーに出会えました。炭焼きのタンドリーチキンもジューシーで香辛料の香りがたまりません。駐車場も12台分あって入りやすく、店内も清潔で居心地が良いです。',
                ],
                [
                    'authorName' => '鈴木 あゆみ',
                    'rating' => 5,
                    'dateLabel' => '3か月前',
                    'text' => '家族でディナーに伺いました。ビリヤニとサグチキンカレー、グリーンナンを注文。どれも本場の味わいで感動しました！スタッフの方の温かい接客にも癒やされます。テイクアウトもできるのでまた利用します。',
                ],
            ], JSON_UNESCAPED_UNICODE);

            $ins = $pdo->prepare('INSERT INTO `Settings` (
                id, name, addressEn, addressJa, phone, email, mapUrl, googleMapsLink,
                weeklyHours, holidays, orderingEnabled, pickupEnabled, deliveryEnabled,
                pointsEnabled, stampsEnabled, aboutEn, aboutJa, heroTagJa, heroSubJa,
                welcomeTitleEn, welcomeTitleJa, welcomeTextJa, menuExplorerLabelJa, menuExplorerTitleJa,
                recommendedLabelJa, recommendedTitleJa, recommendedSubJa,
                storeSectionLabelJa, storeSectionTitleJa, storeSectionSubJa, storeLocationJa, storeBadgeJa,
                storeReviewScore, storeReviewCount, storeReviewText, storeReviewLink,
                featuredReviews, createdAt, updatedAt
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, 1, 1, 0,
                1, 1, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?
            )');
            $ins->execute([
                'default',
                'Kalpna Indian Cuisine',
                '2081 Sayada, Kumagaya, Saitama 360-0831, Japan',
                '〒360-0831 埼玉県熊谷市佐谷田2081',
                '048-514-8386',
                'info@kalpnacurry.com',
                'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3220.8906325916053!2d139.4005126!3d36.1408166!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6018cdba11dc903b%3A0xe95d3e6cfb99db10!2sKalpana%20Indian%20Restaurant!5e0!3m2!1sen!2sjp!4v1715000000000!5m2!1sen!2sjp',
                'https://maps.app.goo.gl/92p48n6Zc4X9Nq518',
                $hours,
                $holidays,
                'Authentic Indian Cuisine in Kumagaya, Saitama.',
                '毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理',
                '埼玉・熊谷で味わう、本場のインド料理',
                "愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを。\nKalpna Indian Cuisineで皆様をお待ちしております。",
                'Authentic Indian Flavors',
                '本格インドの味わい',
                'インドの豊かな食文化と鮮やかなスパイスを体験してください。熟練のシェフが伝統的なタンドール窯と新鮮な食材を使用し、すべての料理をゼロから手作りしています。忘れられない特別なひとときをお届けします。',
                'メニューを見る',
                'キッチンからお届け',
                'シェフの厳選',
                'おすすめメニュー',
                '全店舗で愛され続けている、不動の人気メニュー',
                '店舗を探す',
                '私たちの店舗',
                '店舗を選択して、住所、営業時間、地図をご確認ください。',
                '埼玉県熊谷市佐谷田2081（国道17号沿い・加賀家食堂隣）',
                '🍛 インド料理',
                '4.5',
                185,
                'Googleでレビューを見る',
                'https://maps.app.goo.gl/92p48n6Zc4X9Nq518',
                $featuredReviews,
                $now,
                $now
            ]);
            $seeded['settings'] = 1;
        }
    } catch (Exception $e) {}

    // 4. Categories
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `Category`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $catIns = $pdo->prepare('INSERT INTO `Category` (id, nameEn, nameJa, sortOrder, parentId) VALUES (?, ?, ?, ?, ?)');
            $catIns->execute(['cat_lunch', 'Lunch Menu', 'ランチメニュー', 1, null]);
            $catIns->execute(['cat_takeout', 'Takeout Menu', 'テイクアウトメニュー', 2, null]);
            $catIns->execute(['cat_grand', 'Grand Menu', 'グランドメニュー', 3, null]);

            $catIns->execute(['cat_curry', 'Chicken Curries', 'チキンカレー', 1, 'cat_grand']);
            $catIns->execute(['cat_mutton', 'Mutton Curries', 'マトンカレー', 2, 'cat_grand']);
            $catIns->execute(['cat_bread', 'Breads & Naan', 'ナン・ライス', 3, 'cat_grand']);
            $catIns->execute(['cat_lunch_set', 'Lunch Sets', 'ランチセット', 1, 'cat_lunch']);
            $seeded['categories'] = 7;
        }
    } catch (Exception $e) {}

    // 5. _CategoryToMenu
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `_CategoryToMenu`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $c2m = $pdo->prepare('INSERT IGNORE INTO `_CategoryToMenu` (A, B) VALUES (?, ?)');
            $c2m->execute(['cat_lunch', 'menu_lunch']);
            $c2m->execute(['cat_takeout', 'menu_takeout']);
            $c2m->execute(['cat_grand', 'menu_grand']);
            $c2m->execute(['cat_curry', 'menu_grand']);
            $c2m->execute(['cat_mutton', 'menu_grand']);
            $c2m->execute(['cat_bread', 'menu_grand']);
            $c2m->execute(['cat_lunch_set', 'menu_lunch']);
            $seeded['_CategoryToMenu'] = 7;
        }
    } catch (Exception $e) {}

    // 6. Menu Items
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `MenuItem`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $itemIns = $pdo->prepare('INSERT INTO `MenuItem` (
                id, categoryId, nameEn, nameJa, descriptionEn, descriptionJa,
                price, imageUrl, spiceLevel, isRecommended, isVegetarian, isVegan,
                isHalal, isGlutenFree, isSoldOut, isOrderable, isActive, sortOrder,
                menuTypes, allergens, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?, ?, ?, ?)');

            $samples = [
                ['item_1', 'cat_curry', 'Butter Chicken Curry', 'バターチキンカレー', 'Creamy tomato-based chicken curry with rich butter aroma.', 'トマトベースの濃厚でコクのあるクリーミーなチキンカレー。', 1200, '/bg-hero-img.webp', 1, 1, 0, 0, 1, 0, 1, ['LUNCH', 'TAKEOUT', 'GRAND'], ['乳']],
                ['item_2', 'cat_mutton', 'Keema Curry', 'キーマカレー', 'Minced mutton curry spiced with fragrant whole spices.', 'スパイス香る挽肉の旨味たっぷりキーマカレー。', 1100, '/bg-hero-img.webp', 3, 1, 0, 0, 1, 0, 2, ['GRAND', 'TAKEOUT'], []],
                ['item_3', 'cat_bread', 'Cheese Naan', 'チーズナン', 'Freshly baked naan stuffed with melted mozzarella cheese.', 'とろ〜り溶け出すたっぷりチーズの本格ナン。', 550, '/bg-hero-img.webp', 0, 1, 1, 0, 1, 0, 1, ['LUNCH', 'TAKEOUT', 'GRAND'], ['乳', '小麦']],
                ['item_4', 'cat_bread', 'Garlic Naan', 'ガーリックナン', 'Crispy naan topped with fresh chopped garlic and herbs.', '香ばしいガーリックをトッピングした風味豊かなナン。', 400, '/bg-hero-img.webp', 0, 0, 1, 1, 1, 0, 2, ['GRAND', 'TAKEOUT'], ['小麦']],
                ['item_5', 'cat_lunch_set', 'Lunch Set A', 'ランチセット A', 'Choice of curry, plain naan or rice, and mini salad.', 'お好みのカレー1種、プレーンナンまたはライス、ミニサラダ付き。', 950, '/bg-hero-img.webp', 1, 1, 0, 0, 1, 0, 1, ['LUNCH'], ['乳', '小麦']],
                ['item_6', 'cat_lunch_set', 'Lunch Set B (Cheese Naan)', 'チーズナンランチセット', 'Choice of curry, cheese naan, and mini salad.', 'お好みのカレー、チーズナン、ミニサラダがセットになった大満足ランチ。', 1150, '/bg-hero-img.webp', 1, 1, 0, 0, 1, 0, 2, ['LUNCH'], ['乳', '小麦']],
            ];

            foreach ($samples as $s) {
                $itemIns->execute([
                    $s[0], $s[1], $s[2], $s[3], $s[4], $s[5],
                    $s[6], $s[7], $s[8], $s[9], $s[10], $s[11],
                    $s[12], $s[13], $s[14],
                    json_encode($s[15]), json_encode($s[16], JSON_UNESCAPED_UNICODE),
                    $now, $now
                ]);
            }
            $seeded['menu_items'] = count($samples);
        }
    } catch (Exception $e) {}

    // 7. Carousel Slides
    try {
        $stmt = $pdo->query('SELECT COUNT(*) FROM `CarouselSlide`');
        if ($stmt && (int)$stmt->fetchColumn() === 0) {
            $slideIns = $pdo->prepare('INSERT INTO `CarouselSlide` (
                id, placement, imageUrl, altEn, altJa, titleEn, titleJa,
                subtitleEn, subtitleJa, sortOrder, isActive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');

            $slides = [
                ['slide_1', 'HOME', '/bg-hero-img.webp', 'Authentic Indian Curry and Naan', '本格インド料理と焼きたてナン', 'Authentic Indian Flavors', '本格スパイスが香る、伝統のインド料理', 'Handcrafted curries and tandoori specials.', 'タンドール窯で焼き上げるナンと極上のスパイスカレー', 1],
                ['slide_2', 'HOME', '/bg-hero-img.webp', 'Freshly baked tandoori naan and rich curry bowls', '焼きたてナンと本格スパイスカレー', 'Freshly Baked Naan & Curries', '焼きたてナンと本格スパイスカレー', 'Fresh from our charcoal tandoor oven.', '炭火粘土窯で焼き上げるタンドール料理', 2],
                ['slide_3', 'HOME', '/bg-hero-img.webp', 'Master chef preparing tandoori specialties in traditional clay oven', '熟練シェフの本格タンドール料理', 'Traditional Charcoal Tandoor', '伝統のタンドール炭火焼料理', 'Finest spices blended with culinary passion.', '長年磨き上げたスパイスの魔法', 3],
                ['slide_4', 'CONTACT', '/bg-hero-img.webp', 'Kalpana Indian Cuisine dining hall in Kumagaya', 'カルプナ熊谷店', 'Visit Kalpana in Kumagaya', '熊谷でお待ちしております', 'Conveniently located with parking available.', '国道17号沿い・駐車場12台完備', 1]
            ];
            foreach ($slides as $sl) {
                $slideIns->execute($sl);
            }
            $seeded['carousel_slides'] = count($slides);
        }
    } catch (Exception $e) {}

    return $seeded;
}

// Full database migration runner: idempotent table creation and schema sync
function runDatabaseMigrations(PDO $pdo): array {
    $tables = [
        'User' => "CREATE TABLE IF NOT EXISTS `User` (
            `id` VARCHAR(191) NOT NULL,
            `email` VARCHAR(191) NOT NULL,
            `passwordHash` VARCHAR(191) NOT NULL,
            `name` VARCHAR(191) NOT NULL,
            `role` ENUM('ADMIN', 'STAFF', 'KITCHEN') NOT NULL DEFAULT 'STAFF',
            `isActive` BOOLEAN NOT NULL DEFAULT true,
            `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            UNIQUE INDEX `User_email_key`(`email`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'Menu' => "CREATE TABLE IF NOT EXISTS `Menu` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'Category' => "CREATE TABLE IF NOT EXISTS `Category` (
            `id` VARCHAR(191) NOT NULL,
            `nameEn` VARCHAR(191) NOT NULL,
            `nameJa` VARCHAR(191) NULL,
            `sortOrder` INTEGER NOT NULL DEFAULT 0,
            `parentId` VARCHAR(191) NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'MenuItem' => "CREATE TABLE IF NOT EXISTS `MenuItem` (
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
            `isOrderable` BOOLEAN NOT NULL DEFAULT true,
            `isActive` BOOLEAN NOT NULL DEFAULT true,
            `sortOrder` INTEGER NOT NULL DEFAULT 0,
            `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            INDEX `MenuItem_categoryId_sortOrder_idx`(`categoryId`, `sortOrder`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'ItemVariant' => "CREATE TABLE IF NOT EXISTS `ItemVariant` (
            `id` VARCHAR(191) NOT NULL,
            `itemId` VARCHAR(191) NOT NULL,
            `labelEn` VARCHAR(191) NOT NULL,
            `labelJa` VARCHAR(191) NULL,
            `price` INTEGER NOT NULL,
            `sortOrder` INTEGER NOT NULL DEFAULT 0,
            INDEX `ItemVariant_itemId_idx`(`itemId`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'OptionGroup' => "CREATE TABLE IF NOT EXISTS `OptionGroup` (
            `id` VARCHAR(191) NOT NULL,
            `nameJa` VARCHAR(191) NOT NULL,
            `nameEn` VARCHAR(191) NOT NULL,
            `type` VARCHAR(191) NOT NULL DEFAULT 'RADIO',
            `required` BOOLEAN NOT NULL DEFAULT true,
            `options` JSON NOT NULL,
            `sortOrder` INTEGER NOT NULL DEFAULT 0,
            `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'CarouselSlide' => "CREATE TABLE IF NOT EXISTS `CarouselSlide` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'Settings' => "CREATE TABLE IF NOT EXISTS `Settings` (
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
            `mapUrl` TEXT NULL,
            `googleMapsLink` TEXT NULL,
            `aboutEn` TEXT NULL,
            `aboutJa` TEXT NULL,
            `aboutHeroImage` VARCHAR(191) NULL,
            `aboutHeroTag` VARCHAR(191) NULL,
            `aboutHeroTitle` VARCHAR(191) NULL,
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
            `orderingEnabled` BOOLEAN NOT NULL DEFAULT true,
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
            `storeReviewLink` TEXT NULL,
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
            `heroTagJa` VARCHAR(191) NULL,
            `heroSubJa` TEXT NULL,
            `menuExplorerLabelJa` VARCHAR(191) NULL,
            `menuExplorerTitleJa` VARCHAR(191) NULL,
            `recommendedLabelJa` VARCHAR(191) NULL,
            `recommendedTitleJa` VARCHAR(191) NULL,
            `recommendedSubJa` VARCHAR(191) NULL,
            `newsletterTitleJa` VARCHAR(191) NULL,
            `newsletterSubJa` TEXT NULL,
            `newsletterBgImage` VARCHAR(191) NULL,
            `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'ContactMessage' => "CREATE TABLE IF NOT EXISTS `ContactMessage` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'PickupOrder' => "CREATE TABLE IF NOT EXISTS `PickupOrder` (
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
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            UNIQUE INDEX `PickupOrder_token_key`(`token`),
            INDEX `PickupOrder_status_pickupAt_idx`(`status`, `pickupAt`),
            INDEX `PickupOrder_customerId_createdAt_idx`(`customerId`, `createdAt`),
            INDEX `PickupOrder_dateKey_idx`(`dateKey`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'Customer' => "CREATE TABLE IF NOT EXISTS `Customer` (
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
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            UNIQUE INDEX `Customer_email_key`(`email`),
            UNIQUE INDEX `Customer_memberCode_key`(`memberCode`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'PointTransaction' => "CREATE TABLE IF NOT EXISTS `PointTransaction` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'Offer' => "CREATE TABLE IF NOT EXISTS `Offer` (
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
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'OrderCounter' => "CREATE TABLE IF NOT EXISTS `OrderCounter` (
            `id` VARCHAR(191) NOT NULL,
            `seq` INTEGER NOT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'AuditLog' => "CREATE TABLE IF NOT EXISTS `AuditLog` (
            `id` VARCHAR(191) NOT NULL,
            `userId` VARCHAR(191) NOT NULL,
            `action` VARCHAR(191) NOT NULL,
            `entity` VARCHAR(191) NOT NULL,
            `entityId` VARCHAR(191) NOT NULL,
            `diff` JSON NULL,
            `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'Stamp' => "CREATE TABLE IF NOT EXISTS `Stamp` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'StampReward' => "CREATE TABLE IF NOT EXISTS `StampReward` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'AppSecret' => "CREATE TABLE IF NOT EXISTS `AppSecret` (
            `id` VARCHAR(191) NOT NULL,
            `publicKey` TEXT NOT NULL,
            `privateKey` TEXT NOT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'PushSubscription' => "CREATE TABLE IF NOT EXISTS `PushSubscription` (
            `id` VARCHAR(191) NOT NULL,
            `endpoint` VARCHAR(1000) NOT NULL,
            `p256dh` VARCHAR(500) NOT NULL,
            `auth` VARCHAR(200) NOT NULL,
            `customerId` VARCHAR(191) NULL,
            `orderIds` JSON NULL,
            `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`(255)),
            INDEX `PushSubscription_customerId_idx`(`customerId`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'SquarePayment' => "CREATE TABLE IF NOT EXISTS `SquarePayment` (
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
            `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            UNIQUE INDEX `SquarePayment_idempotencyKey_key`(`idempotencyKey`),
            INDEX `SquarePayment_sessionId_status_idx`(`sessionId`, `status`),
            INDEX `SquarePayment_squarePaymentId_idx`(`squarePaymentId`),
            INDEX `SquarePayment_squareCheckoutId_idx`(`squareCheckoutId`),
            INDEX `SquarePayment_squareLinkId_idx`(`squareLinkId`),
            INDEX `SquarePayment_createdAt_idx`(`createdAt`),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'SquareWebhookEvent' => "CREATE TABLE IF NOT EXISTS `SquareWebhookEvent` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        'GoogleReviewCache' => "CREATE TABLE IF NOT EXISTS `GoogleReviewCache` (
            `id` VARCHAR(191) NOT NULL,
            `placeId` VARCHAR(191) NOT NULL,
            `name` VARCHAR(191) NULL,
            `rating` DOUBLE NULL,
            `userRatingCount` INTEGER NULL,
            `mapsUrl` TEXT NULL,
            `reviews` JSON NOT NULL,
            `fetchedAt` DATETIME(3) NULL,
            `lastError` TEXT NULL,
            `lastErrorAt` DATETIME(3) NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        '_CategoryToMenu' => "CREATE TABLE IF NOT EXISTS `_CategoryToMenu` (
            `A` VARCHAR(191) NOT NULL,
            `B` VARCHAR(191) NOT NULL,
            UNIQUE INDEX `_CategoryToMenu_AB_unique`(`A`, `B`),
            INDEX `_CategoryToMenu_B_index`(`B`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        '_MenuItemToOptionGroup' => "CREATE TABLE IF NOT EXISTS `_MenuItemToOptionGroup` (
            `A` VARCHAR(191) NOT NULL,
            `B` VARCHAR(191) NOT NULL,
            UNIQUE INDEX `_MenuItemToOptionGroup_AB_unique`(`A`, `B`),
            INDEX `_MenuItemToOptionGroup_B_index`(`B`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
    ];

    $created = [];
    foreach ($tables as $name => $ddl) {
        try {
            $pdo->exec($ddl);
            $created[] = $name;
        } catch (Exception $e) {
            $created[] = "{$name} (error: " . $e->getMessage() . ")";
        }
    }

    // Drop legacy dining tables if they exist
    try { $pdo->exec("DROP TABLE IF EXISTS `_CustomerToTableSession`"); } catch (Exception $e) {}
    try { $pdo->exec("DROP TABLE IF EXISTS `TableSession`"); } catch (Exception $e) {}
    try { $pdo->exec("DROP TABLE IF EXISTS `DiningTable`"); } catch (Exception $e) {}

    // Ensure missing columns exist in existing tables
    $columnsToEnsure = [
        ['MenuItem', 'isOrderable', "BOOLEAN NOT NULL DEFAULT 1"],
        ['Settings', 'aboutHeroTag', "VARCHAR(191) NULL"],
        ['Settings', 'aboutHeroTitle', "VARCHAR(191) NULL"],
        ['Settings', 'heroTagJa', "VARCHAR(191) NULL"],
        ['Settings', 'heroSubJa', "TEXT NULL"],
        ['Settings', 'menuExplorerLabelJa', "VARCHAR(191) NULL"],
        ['Settings', 'menuExplorerTitleJa', "VARCHAR(191) NULL"],
        ['Settings', 'recommendedLabelJa', "VARCHAR(191) NULL"],
        ['Settings', 'recommendedTitleJa', "VARCHAR(191) NULL"],
        ['Settings', 'recommendedSubJa', "VARCHAR(191) NULL"],
        ['Settings', 'newsletterTitleJa', "VARCHAR(191) NULL"],
        ['Settings', 'newsletterSubJa', "TEXT NULL"],
        ['Settings', 'newsletterBgImage', "VARCHAR(191) NULL"],
    ];

    $columnsUpdated = [];
    foreach ($columnsToEnsure as $col) {
        list($table, $colName, $colDef) = $col;
        try {
            $check = $pdo->prepare("SHOW COLUMNS FROM `{$table}` LIKE ?");
            $check->execute([$colName]);
            if (!$check->fetch()) {
                $pdo->exec("ALTER TABLE `{$table}` ADD `{$colName}` {$colDef}");
                $columnsUpdated[] = "{$table}.{$colName}";
            }
        } catch (Exception $e) {}
    }

    // Seed initial data
    $seedStatus = ensureDefaultDatabaseData($pdo);

    // Update any existing database records from カルパナ to カルプナ
    try {
        $pdo->exec("UPDATE `CarouselSlide` SET `titleJa` = REPLACE(`titleJa`, 'カルパナ', 'カルプナ') WHERE `titleJa` LIKE '%カルパナ%'");
        $pdo->exec("UPDATE `CarouselSlide` SET `subtitleJa` = REPLACE(`subtitleJa`, 'カルパナ', 'カルプナ') WHERE `subtitleJa` LIKE '%カルパナ%'");
        $pdo->exec("UPDATE `Settings` SET `name` = REPLACE(`name`, 'カルパナ', 'カルプナ') WHERE `name` LIKE '%カルパナ%'");
        $pdo->exec("UPDATE `Settings` SET `aboutJa` = REPLACE(`aboutJa`, 'カルパナ', 'カルプナ') WHERE `aboutJa` LIKE '%カルパナ%'");
        $pdo->exec("UPDATE `Settings` SET `featuredReviews` = REPLACE(`featuredReviews`, 'カルパナ', 'カルプナ') WHERE `featuredReviews` LIKE '%カルパナ%'");
        $pdo->exec("UPDATE `AppSecret` SET `publicKey` = REPLACE(`publicKey`, 'カルパナ', 'カルプナ') WHERE `id` = 'PAGE_SETTINGS_EXT' AND `publicKey` LIKE '%カルパナ%'");
    } catch (Exception $e) {}

    return [
        'status' => 'completed',
        'tables' => $created,
        'columns_added' => $columnsUpdated,
        'seeded' => $seedStatus,
        'time' => date('c'),
    ];
}

// Auto-run migrations if Settings table is missing
try {
    $pdo->query('SELECT 1 FROM `Settings` LIMIT 1');
} catch (Exception $e) {
    runDatabaseMigrations($pdo);
}

// 3. Routing
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Normalise path: strip trailing slash
$path = rtrim($requestUri, '/');
if (empty($path)) $path = '/';

// Optional: handle prefix like /api/v1 or /api (even if preceded by /public_html)
if (($pos = strpos($path, '/api/v1')) !== false) {
    $subPath = substr($path, $pos + strlen('/api/v1'));
} elseif (($pos = strpos($path, '/api')) !== false) {
    $subPath = substr($path, $pos + 4);
} else {
    $subPath = $path;
}
if (empty($subPath)) $subPath = '/';

// -------------------------------------------------------------
// Endpoint: GET|POST /migrate (Execute complete DB migrations)
// -------------------------------------------------------------
if (($method === 'GET' || $method === 'POST') && ($subPath === '/migrate' || $subPath === '/migrate/')) {
    $result = runDatabaseMigrations($pdo);
    echo json_encode([
        'success' => true,
        'message' => 'Database schema migration executed successfully',
        'result' => $result,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /settings
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/settings' || $subPath === '/settings/')) {
    $stmt = $pdo->query('SELECT * FROM Settings LIMIT 1');
    $settings = $stmt->fetch();
    if (!$settings) {
        $settings = [];
    } else {
        // Parse JSON fields
        $jsonFields = ['weeklyHours', 'holidays', 'socials', 'featuredReviews', 'footerLinks', 'pickupClosedDays', 'pickupClosedDates', 'stampRewards'];
        foreach ($jsonFields as $jf) {
            if (isset($settings[$jf]) && is_string($settings[$jf])) {
                $decoded = json_decode($settings[$jf], true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $settings[$jf] = $decoded;
                }
            }
        }
        // Cast booleans
        $boolFields = ['orderingEnabled', 'pickupEnabled', 'deliveryEnabled', 'pointsEnabled', 'stampCardEnabled', 'footerShowHours', 'footerShowSocials'];
        foreach ($boolFields as $bf) {
            if (isset($settings[$bf])) {
                $settings[$bf] = (bool)$settings[$bf];
            }
        }
    }

    // Extended page settings from AppSecret
    try {
        $secStmt = $pdo->prepare('SELECT publicKey FROM AppSecret WHERE id = ?');
        $secStmt->execute(['PAGE_SETTINGS_EXT']);
        $secRow = $secStmt->fetch();
        if ($secRow && !empty($secRow['publicKey'])) {
            $ext = json_decode($secRow['publicKey'], true);
            if (is_array($ext)) {
                $settings = array_merge($settings, $ext);
            }
        }
    } catch (Exception $e) {}

    $defaultSettings = [
        'name' => 'Kalpna Indian Cuisine',
        'addressEn' => '2081 Sayada, Kumagaya, Saitama 360-0831, Japan',
        'addressJa' => '〒360-0831 埼玉県熊谷市佐谷田2081',
        'phone' => '048-514-8386',
        'email' => 'info@kalpnacurry.com',
        'mapUrl' => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3220.8906325916053!2d139.4005126!3d36.1408166!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6018cdba11dc903b%3A0xe95d3e6cfb99db10!2sKalpana%20Indian%20Restaurant!5e0!3m2!1sen!2sjp!4v1715000000000!5m2!1sen!2sjp',
        'googleMapsLink' => 'https://maps.app.goo.gl/92p48n6Zc4X9Nq518',
        'weeklyHours' => [
            'monday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
            'tuesday' => '定休日',
            'wednesday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
            'thursday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
            'friday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
            'saturday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
            'sunday' => 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
        ],
        'holidays' => ['regular' => '火曜日'],
        'orderingEnabled' => true,
        'pickupEnabled' => true,
        'deliveryEnabled' => false,
        'pointsEnabled' => true,
        'stampCardEnabled' => true,
    ];
    $settings = array_merge($defaultSettings, array_filter($settings, fn($v) => $v !== null && $v !== ''));

    echo json_encode($settings);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /menu/categories
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/menu/categories' || $subPath === '/menu/categories/')) {
    $stmt = $pdo->query('SELECT * FROM Category ORDER BY sortOrder ASC');
    $categories = $stmt->fetchAll();
    echo json_encode($categories);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /menu/items
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/menu/items' || $subPath === '/menu/items/')) {
    // 1. Fetch items
    $items = [];
    try {
        $stmt = $pdo->query('SELECT * FROM MenuItem ORDER BY categoryId ASC, sortOrder ASC, createdAt DESC');
        $items = $stmt->fetchAll();
    } catch (Exception $e) {}

    // 2. Fetch categories map
    $cats = [];
    try {
        $catStmt = $pdo->query('SELECT * FROM Category');
        while ($cat = $catStmt->fetch()) {
            $cats[$cat['id']] = $cat;
        }
    } catch (Exception $e) {}

    // 3. Fetch variants
    $variantsByItem = [];
    try {
        $varStmt = $pdo->query('SELECT * FROM ItemVariant ORDER BY sortOrder ASC');
        while ($var = $varStmt->fetch()) {
            $variantsByItem[$var['itemId']][] = $var;
        }
    } catch (Exception $e) {}

    // 4. Fetch option groups relation
    $optionsByItem = [];
    try {
        $optStmt = $pdo->query('
            SELECT mog.A as itemId, og.id, og.nameJa, og.nameEn, og.type
            FROM _MenuItemToOptionGroup mog
            JOIN OptionGroup og ON og.id = mog.B
        ');
        while ($opt = $optStmt->fetch()) {
            $optionsByItem[$opt['itemId']][] = [
                'id' => $opt['id'],
                'nameJa' => $opt['nameJa'],
                'nameEn' => $opt['nameEn'],
                'type' => $opt['type'],
            ];
        }
    } catch (Exception $e) {}

    // Format items
    $formatted = array_map(function ($item) use ($cats, $variantsByItem, $optionsByItem) {
        // Parse JSON fields
        if (isset($item['menuTypes']) && is_string($item['menuTypes'])) {
            $item['menuTypes'] = json_decode($item['menuTypes'], true) ?: [];
        }
        if (isset($item['allergens']) && is_string($item['allergens'])) {
            $item['allergens'] = json_decode($item['allergens'], true) ?: [];
        }

        // Booleans
        $item['isVegetarian'] = (bool)($item['isVegetarian'] ?? false);
        $item['isVegan'] = (bool)($item['isVegan'] ?? false);
        $item['isHalal'] = (bool)($item['isHalal'] ?? false);
        $item['isGlutenFree'] = (bool)($item['isGlutenFree'] ?? false);
        $item['isRecommended'] = (bool)($item['isRecommended'] ?? false);
        $item['isSoldOut'] = (bool)($item['isSoldOut'] ?? false);
        $item['isOrderable'] = (bool)($item['isOrderable'] ?? true);
        $item['isActive'] = (bool)($item['isActive'] ?? true);

        // Relations
        $item['category'] = $cats[$item['categoryId']] ?? null;
        $item['variants'] = $variantsByItem[$item['id']] ?? [];
        $item['optionGroups'] = $optionsByItem[$item['id']] ?? [];

        return $item;
    }, $items);

    echo json_encode($formatted);
    exit;
}

// -------------------------------------------------------------
// Shared: menu item field mapping (mirrors apps/api itemUpdateSchema)
// -------------------------------------------------------------
function menuItemColumns(array $input): array
{
    $cols = [];
    $strings = ['categoryId', 'nameEn', 'nameJa', 'descriptionEn', 'descriptionJa', 'imageUrl'];
    $bools = ['isRecommended', 'isVegetarian', 'isVegan', 'isHalal', 'isGlutenFree', 'isSoldOut', 'isOrderable', 'isActive'];
    foreach ($strings as $f) {
        if (array_key_exists($f, $input)) {
            $v = $input[$f];
            $cols[$f] = ($v === null || $v === '') && $f !== 'nameEn' && $f !== 'categoryId' ? null : (string)$v;
        }
    }
    foreach ($bools as $f) {
        if (array_key_exists($f, $input)) $cols[$f] = $input[$f] ? 1 : 0;
    }
    if (array_key_exists('price', $input)) $cols['price'] = max(0, (int)round((float)$input['price']));
    if (array_key_exists('spiceLevel', $input)) $cols['spiceLevel'] = max(0, min(5, (int)$input['spiceLevel']));
    if (array_key_exists('sortOrder', $input)) $cols['sortOrder'] = (int)$input['sortOrder'];
    if (array_key_exists('rating', $input)) {
        $cols['rating'] = ($input['rating'] === null || $input['rating'] === '') ? null : (float)$input['rating'];
    }
    foreach (['menuTypes', 'allergens'] as $f) {
        if (array_key_exists($f, $input)) {
            $cols[$f] = json_encode(is_array($input[$f]) ? array_values($input[$f]) : [], JSON_UNESCAPED_UNICODE);
        }
    }
    return $cols;
}

function setMenuItemOptionGroups(PDO $pdo, string $itemId, $groupIds): void
{
    if (!is_array($groupIds)) return;
    $pdo->prepare('DELETE FROM _MenuItemToOptionGroup WHERE A = ?')->execute([$itemId]);
    $ins = $pdo->prepare('INSERT IGNORE INTO _MenuItemToOptionGroup (A, B) VALUES (?, ?)');
    foreach (array_unique($groupIds) as $gid) {
        if (is_string($gid) && $gid !== '') $ins->execute([$itemId, $gid]);
    }
}

// -------------------------------------------------------------
// Endpoint: POST /menu/items
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/menu/items' || $subPath === '/menu/items/')) {
    requireStaffUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    if (empty($input['categoryId']) || trim((string)($input['nameEn'] ?? '')) === '' || !isset($input['price'])) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'categoryId, nameEn and price are required']]);
        exit;
    }

    $cols = menuItemColumns($input) + [
        'menuTypes' => '[]', 'allergens' => '[]', 'spiceLevel' => 0, 'sortOrder' => 0,
    ];
    $newId = generateUuidV4();
    $cols['id'] = $newId;
    $now = (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
    $cols['createdAt'] = $now;
    $cols['updatedAt'] = $now;

    try {
        $pdo->beginTransaction();
        $names = array_keys($cols);
        $sql = 'INSERT INTO MenuItem (`' . implode('`, `', $names) . '`) VALUES (' . implode(', ', array_fill(0, count($names), '?')) . ')';
        $pdo->prepare($sql)->execute(array_values($cols));
        setMenuItemOptionGroups($pdo, $newId, $input['optionGroupIds'] ?? null);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'SAVE_FAILED', 'message' => 'Could not create menu item']]);
        exit;
    }

    http_response_code(201);
    echo json_encode(['id' => $newId, 'success' => true]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: PUT /menu/items/:id
// -------------------------------------------------------------
if (($method === 'PUT' || $method === 'PATCH') && preg_match('#^/menu/items/([a-zA-Z0-9_-]+)/?$#', $subPath, $matches) && $matches[1] !== 'import') {
    $itemId = $matches[1];
    requireStaffUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $exists = $pdo->prepare('SELECT id FROM MenuItem WHERE id = ? LIMIT 1');
    $exists->execute([$itemId]);
    if (!$exists->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => ['code' => 'NOT_FOUND', 'message' => 'Menu item not found']]);
        exit;
    }

    $cols = menuItemColumns($input);
    $cols['updatedAt'] = (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');

    try {
        $pdo->beginTransaction();
        $sets = [];
        foreach (array_keys($cols) as $c) $sets[] = "`{$c}` = ?";
        $params = array_values($cols);
        $params[] = $itemId;
        $pdo->prepare('UPDATE MenuItem SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        setMenuItemOptionGroups($pdo, $itemId, $input['optionGroupIds'] ?? null);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'SAVE_FAILED', 'message' => 'Could not update menu item']]);
        exit;
    }

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: DELETE /menu/items/:id
// -------------------------------------------------------------
if ($method === 'DELETE' && preg_match('#^/menu/items/([a-zA-Z0-9_-]+)/?$#', $subPath, $matches)) {
    $itemId = $matches[1];
    requireAdminUser($jwtSecret, $pdo);

    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM _MenuItemToOptionGroup WHERE A = ?')->execute([$itemId]);
        $pdo->prepare('DELETE FROM ItemVariant WHERE itemId = ?')->execute([$itemId]);
        $del = $pdo->prepare('DELETE FROM MenuItem WHERE id = ?');
        $del->execute([$itemId]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'DELETE_FAILED', 'message' => 'Could not delete menu item']]);
        exit;
    }

    if ($del->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => ['code' => 'NOT_FOUND', 'message' => 'Menu item not found']]);
        exit;
    }

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /menu/option-groups
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/menu/option-groups' || $subPath === '/menu/option-groups/')) {
    $stmt = $pdo->query('SELECT * FROM OptionGroup ORDER BY sortOrder ASC, createdAt ASC');
    $groups = $stmt->fetchAll();
    $formatted = array_map(function ($g) {
        return [
            'id' => $g['id'],
            'nameJa' => $g['nameJa'],
            'nameEn' => $g['nameEn'],
            'type' => $g['type'],
            'required' => (bool)$g['required'],
            'options' => is_string($g['options']) ? (json_decode($g['options'], true) ?: []) : ($g['options'] ?: []),
            'sortOrder' => (int)$g['sortOrder'],
        ];
    }, $groups);
    echo json_encode($formatted);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /carousels
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/carousels' || $subPath === '/carousels/')) {
    $showAll = isset($_GET['all']) && $_GET['all'] === 'true';
    $placement = isset($_GET['placement']) && $_GET['placement'] === 'CONTACT' ? 'CONTACT' : 'HOME';

    if ($showAll) {
        $stmt = $pdo->query('SELECT * FROM CarouselSlide ORDER BY sortOrder ASC');
    } else {
        $stmt = $pdo->prepare('SELECT * FROM CarouselSlide WHERE placement = ? AND isActive = 1 ORDER BY sortOrder ASC');
        $stmt->execute([$placement]);
    }
    $slides = $stmt->fetchAll();
    $formatted = array_map(function ($s) {
        $s['isActive'] = (bool)$s['isActive'];
        return $s;
    }, $slides);
    echo json_encode($formatted);
    exit;
}

// -------------------------------------------------------------
// Endpoint: PUT /carousels/:id
// -------------------------------------------------------------
if ($method === 'PUT' && preg_match('#^/carousels/([a-zA-Z0-9_-]+)/?$#', $subPath, $matches)) {
    $slideId = $matches[1];
    $user = requireAdminUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $fields = [];
    $params = [];
    $allowed = ['titleEn', 'titleJa', 'altEn', 'altJa', 'imageUrl', 'placement', 'isActive', 'sortOrder', 'subtitleEn', 'subtitleJa', 'ctaLabelEn', 'ctaLabelJa', 'ctaLink'];

    foreach ($allowed as $f) {
        if (array_key_exists($f, $input)) {
            $val = $input[$f];
            if ($f === 'isActive') {
                $val = $val ? 1 : 0;
            } elseif ($f === 'sortOrder') {
                $val = (int)$val;
            }
            $fields[] = "`{$f}` = ?";
            $params[] = $val;
        }
    }

    if (empty($fields)) {
        echo json_encode(['success' => true]);
        exit;
    }

    $params[] = $slideId;
    $sql = 'UPDATE CarouselSlide SET ' . implode(', ', $fields) . ' WHERE id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: DELETE /carousels/:id
// -------------------------------------------------------------
if ($method === 'DELETE' && preg_match('#^/carousels/([a-zA-Z0-9_-]+)/?$#', $subPath, $matches)) {
    $slideId = $matches[1];
    $user = requireAdminUser($jwtSecret, $pdo);

    $stmt = $pdo->prepare('DELETE FROM CarouselSlide WHERE id = ?');
    $stmt->execute([$slideId]);

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /carousels
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/carousels' || $subPath === '/carousels/')) {
    $user = requireAdminUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $placement = ($input['placement'] ?? 'HOME') === 'CONTACT' ? 'CONTACT' : 'HOME';
    $titleEn = trim($input['titleEn'] ?? '');
    $titleJa = trim($input['titleJa'] ?? '');
    $altEn = trim($input['altEn'] ?? '') ?: ($titleEn ?: $titleJa);
    $imageUrl = trim($input['imageUrl'] ?? '');

    if (empty($imageUrl)) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'Image URL is required']]);
        exit;
    }

    $stmtCount = $pdo->prepare('SELECT COUNT(*) FROM CarouselSlide WHERE placement = ?');
    $stmtCount->execute([$placement]);
    $count = (int)$stmtCount->fetchColumn();

    $newId = generateUuidV4();
    $insertStmt = $pdo->prepare('
        INSERT INTO CarouselSlide (id, placement, imageUrl, altEn, titleEn, titleJa, isActive, sortOrder)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ');
    $insertStmt->execute([$newId, $placement, $imageUrl, $altEn, $titleEn, $titleJa, $count]);

    $fetchStmt = $pdo->prepare('SELECT * FROM CarouselSlide WHERE id = ? LIMIT 1');
    $fetchStmt->execute([$newId]);
    $created = $fetchStmt->fetch();
    if ($created) {
        $created['isActive'] = (bool)$created['isActive'];
    }

    http_response_code(201);
    echo json_encode($created);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /upload
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/upload' || $subPath === '/upload/')) {
    $user = requireStaffUser($jwtSecret, $pdo);

    if (empty($_FILES['image']) || !isset($_FILES['image']['tmp_name']) || !is_uploaded_file($_FILES['image']['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'NO_FILE', 'message' => 'No file uploaded']]);
        exit;
    }

    $file = $_FILES['image'];
    if ($file['size'] > 5 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'FILE_TOO_LARGE', 'message' => 'File size must be under 5MB']]);
        exit;
    }

    $bytes = file_get_contents($file['tmp_name'], false, null, 0, 16);
    $ext = null;
    if (strlen($bytes) >= 3 && substr($bytes, 0, 3) === "\xFF\xD8\xFF") {
        $ext = '.jpg';
    } elseif (strlen($bytes) >= 8 && substr($bytes, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A") {
        $ext = '.png';
    } elseif (strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') {
        $ext = '.webp';
    }

    if (!$ext) {
        http_response_code(415);
        echo json_encode(['error' => ['code' => 'UNSUPPORTED_FILE', 'message' => 'Only JPEG, PNG and WebP images are allowed']]);
        exit;
    }

    $uploadDir = dirname(__DIR__) . '/uploads';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }

    $filename = time() . '-' . bin2hex(random_bytes(8)) . $ext;
    $destination = $uploadDir . '/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        http_response_code(500);
        echo json_encode(['error' => ['code' => 'UPLOAD_FAILED', 'message' => 'Failed to save uploaded file']]);
        exit;
    }

    http_response_code(201);
    echo json_encode(['imageUrl' => '/uploads/' . $filename]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: PUT /settings
// -------------------------------------------------------------
if ($method === 'PUT' && ($subPath === '/settings' || $subPath === '/settings/')) {
    $user = requireAdminUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    // Extended page settings saved to AppSecret
    $extKeys = [
        'aboutStoryImage', 'aboutStoryWatermark', 'aboutStoryOriginTitleJa',
        'aboutStoryOriginTextJa', 'aboutStoryBadgeSubJa', 'aboutStoryBadgeTitleJa',
        'aboutStoryPillar1TitleJa', 'aboutStoryPillar1DescJa', 'aboutStoryPillar2TitleJa',
        'aboutStoryPillar2DescJa', 'aboutStoryPillar3TitleJa', 'aboutStoryPillar3DescJa',
    ];
    $hasExt = false;
    $extData = [];
    foreach ($extKeys as $ek) {
        if (array_key_exists($ek, $input)) {
            $extData[$ek] = $input[$ek];
            $hasExt = true;
        }
    }

    if ($hasExt) {
        $prev = [];
        try {
            $secStmt = $pdo->prepare('SELECT publicKey FROM AppSecret WHERE id = ?');
            $secStmt->execute(['PAGE_SETTINGS_EXT']);
            $secRow = $secStmt->fetch();
            if ($secRow && !empty($secRow['publicKey'])) {
                $prev = json_decode($secRow['publicKey'], true) ?: [];
            }
        } catch (Exception $e) {}

        $merged = array_merge($prev, $extData);
        $encoded = json_encode($merged);
        try {
            $upsertStmt = $pdo->prepare('
                INSERT INTO AppSecret (id, publicKey, privateKey)
                VALUES (?, ?, "")
                ON DUPLICATE KEY UPDATE publicKey = VALUES(publicKey)
            ');
            $upsertStmt->execute(['PAGE_SETTINGS_EXT', $encoded]);
        } catch (Exception $e) {}
    }

    // Settings columns update
    $existing = $pdo->query('SELECT id FROM Settings LIMIT 1')->fetch();
    $jsonCols = ['weeklyHours', 'holidays', 'socials', 'featuredReviews', 'footerLinks', 'pickupClosedDays', 'pickupClosedDates', 'stampRewards', 'deliveryAreas'];
    $boolCols = ['orderingEnabled', 'pickupEnabled', 'deliveryEnabled', 'pointsEnabled', 'stampCardEnabled', 'stampsEnabled', 'footerShowHours', 'footerShowSocials'];

    // Map stampCardEnabled to stampsEnabled
    if (isset($input['stampCardEnabled'])) {
        $input['stampsEnabled'] = $input['stampCardEnabled'];
    }

    $updateCols = [];
    $updateParams = [];

    // Retrieve column list from information_schema
    $colStmt = $pdo->prepare('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = "Settings" AND TABLE_SCHEMA = DATABASE()');
    $colStmt->execute();
    $validCols = $colStmt->fetchAll(PDO::FETCH_COLUMN);

    foreach ($input as $k => $v) {
        if (!in_array($k, $validCols, true) || $k === 'id') continue;
        if (in_array($k, $jsonCols, true)) {
            $v = is_string($v) ? $v : json_encode($v);
        } elseif (in_array($k, $boolCols, true)) {
            $v = $v ? 1 : 0;
        }
        $updateCols[] = "`{$k}` = ?";
        $updateParams[] = $v;
    }

    if ($existing && !empty($updateCols)) {
        $updateParams[] = $existing['id'];
        $sql = 'UPDATE Settings SET ' . implode(', ', $updateCols) . ' WHERE id = ?';
        $pdo->prepare($sql)->execute($updateParams);
    } elseif (!$existing && !empty($updateCols)) {
        $cols = array_keys($input);
        // Fallback insert if empty
        $newId = generateUuidV4();
        $pdo->prepare('INSERT INTO Settings (id) VALUES (?)')->execute([$newId]);
    }

    // Return updated settings
    $stmt = $pdo->query('SELECT * FROM Settings LIMIT 1');
    $settings = $stmt->fetch() ?: [];
    foreach ($jsonCols as $jf) {
        if (isset($settings[$jf]) && is_string($settings[$jf])) {
            $settings[$jf] = json_decode($settings[$jf], true) ?: $settings[$jf];
        }
    }
    foreach ($boolCols as $bf) {
        if (isset($settings[$bf])) {
            $settings[$bf] = (bool)$settings[$bf];
        }
    }
    echo json_encode($settings);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /orders/slots
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/orders/slots' || $subPath === '/orders/slots/')) {
    echo json_encode(['enabled' => true, 'slots' => []]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /offers
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/offers' || $subPath === '/offers/')) {
    $stmt = $pdo->query('SELECT * FROM Offer WHERE isActive = 1 ORDER BY createdAt DESC');
    $offers = $stmt->fetchAll();
    echo json_encode($offers);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /reviews
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/reviews' || $subPath === '/reviews/')) {
    $settings = [];
    try {
        $stmt = $pdo->query('SELECT * FROM Settings LIMIT 1');
        $settings = $stmt->fetch() ?: [];
    } catch (Exception $e) {}

    $featured = [];
    if (!empty($settings['featuredReviews'])) {
        $decoded = is_string($settings['featuredReviews']) ? json_decode($settings['featuredReviews'], true) : $settings['featuredReviews'];
        if (is_array($decoded)) {
            foreach ($decoded as $rev) {
                $featured[] = [
                    'authorName' => $rev['authorName'] ?? 'Guest',
                    'authorUrl' => null,
                    'authorPhoto' => null,
                    'rating' => (float)($rev['rating'] ?? 5),
                    'text' => $rev['text'] ?? '',
                    'relativeTime' => $rev['dateLabel'] ?? '',
                    'publishTime' => null,
                    'reviewUrl' => null,
                ];
            }
        }
    }

    $manual = !empty($settings['storeReviewScore']) ? (float)$settings['storeReviewScore'] : 4.8;
    $count = !empty($settings['storeReviewCount']) ? (int)$settings['storeReviewCount'] : 124;

    header('Cache-Control: public, max-age=3600');
    echo json_encode([
        'source' => 'manual',
        'rating' => $manual,
        'userRatingCount' => $count,
        'mapsUrl' => $settings['googleMapsLink'] ?? 'https://maps.app.goo.gl/92p48n6Zc4X9Nq518',
        'writeReviewUrl' => $settings['storeReviewLink'] ?? null,
        'reviews' => $featured,
        'fetchedAt' => null,
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /contact
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/contact' || $subPath === '/contact/')) {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $name = trim($input['name'] ?? '');
    $email = strtolower(trim($input['email'] ?? ''));
    $phone = trim($input['phone'] ?? '');
    $type = strtoupper(trim($input['type'] ?? 'GENERAL'));
    $message = trim($input['message'] ?? '');
    $date = !empty($input['date']) ? $input['date'] : null;
    $guests = !empty($input['guests']) ? (int)$input['guests'] : null;

    // Honeypot spam check
    if (!empty($input['website'])) {
        http_response_code(201);
        echo json_encode(['success' => true]);
        exit;
    }

    if (empty($name) || empty($email)) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => '名前とメールアドレスは必須です']]);
        exit;
    }

    $id = generateUuidV4();
    $now = date('Y-m-d H:i:s');
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;

    $stmt = $pdo->prepare('INSERT INTO ContactMessage (id, name, email, phone, type, message, date, guests, isRead, ip, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)');
    $stmt->execute([$id, $name, $email, $phone, $type, $message, $date, $guests, $ip, $now, $now]);

    http_response_code(201);
    echo json_encode(['success' => true, 'id' => $id]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /contact
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/contact' || $subPath === '/contact/')) {
    requireAdminUser($jwtSecret, $pdo);
    $stmt = $pdo->query('SELECT * FROM ContactMessage ORDER BY createdAt DESC');
    $messages = $stmt->fetchAll();
    echo json_encode($messages);
    exit;
}

// -------------------------------------------------------------
// Shared: Game Configuration Helpers (AppSecret: MINI_GAME_CONFIG)
// -------------------------------------------------------------
function getDefaultGameConfig() {
    return [
        'enabled' => true,
        'mode' => 'LUCKY_WHEEL',
        'cooldownHours' => 24,
        'titleJa' => '毎日チャレンジ！ミニゲーム',
        'subtitleJa' => 'ゲームに挑戦して、お得なポイントや割引クーポンをGETしよう！',
        'requireOrderSpend' => true,
        'cycleSpendAmount' => 4999,
        'allowSingleOrderQualify' => true,
        'prizes' => [
            ['id' => 'p1', 'titleJa' => '100ポイント', 'type' => 'POINTS', 'value' => 100, 'probability' => 15, 'color' => '#e11d48', 'icon' => 'Coins'],
            ['id' => 'p2', 'titleJa' => '10% OFF クーポン', 'type' => 'DISCOUNT_COUPON', 'value' => 10, 'probability' => 10, 'color' => '#d97706', 'icon' => 'Tag'],
            ['id' => 'p3', 'titleJa' => '50ポイント', 'type' => 'POINTS', 'value' => 50, 'probability' => 25, 'color' => '#2563eb', 'icon' => 'Sparkles'],
            ['id' => 'p4', 'titleJa' => 'チーズナン無料券', 'type' => 'PERK', 'value' => 0, 'probability' => 10, 'color' => '#7c3aed', 'icon' => 'Gift'],
            ['id' => 'p5', 'titleJa' => '20ポイント', 'type' => 'POINTS', 'value' => 20, 'probability' => 25, 'color' => '#059669', 'icon' => 'Smile'],
            ['id' => 'p6', 'titleJa' => '残念！また明日', 'type' => 'NO_PRIZE', 'value' => 0, 'probability' => 15, 'color' => '#64748b', 'icon' => 'Frown'],
        ],
    ];
}

function getAppSecretConfig($pdo, $key, $default) {
    try {
        $stmt = $pdo->prepare('SELECT publicKey FROM AppSecret WHERE id = ? LIMIT 1');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if ($row && !empty($row['publicKey'])) {
            $parsed = json_decode($row['publicKey'], true);
            if (is_array($parsed)) {
                return array_merge($default, $parsed);
            }
        }
    } catch (Exception $e) {}
    return $default;
}

function saveAppSecretConfig($pdo, $key, $data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare('INSERT INTO AppSecret (id, publicKey, privateKey) VALUES (?, ?, "") ON DUPLICATE KEY UPDATE publicKey = ?');
    $stmt->execute([$key, $json, $json]);
    return $data;
}

// -------------------------------------------------------------
// Endpoint: GET /game/admin/config
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/game/admin/config' || $subPath === '/game/admin/config/')) {
    requireAdminUser($jwtSecret, $pdo);
    $config = getAppSecretConfig($pdo, 'MINI_GAME_CONFIG', getDefaultGameConfig());
    header('Cache-Control: no-store');
    echo json_encode($config);
    exit;
}

// -------------------------------------------------------------
// Endpoint: PUT /game/admin/config
// -------------------------------------------------------------
if ($method === 'PUT' && ($subPath === '/game/admin/config' || $subPath === '/game/admin/config/')) {
    requireAdminUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $current = getAppSecretConfig($pdo, 'MINI_GAME_CONFIG', getDefaultGameConfig());
    $merged = array_merge($current, $input);
    saveAppSecretConfig($pdo, 'MINI_GAME_CONFIG', $merged);
    echo json_encode($merged);
    exit;
}

// -------------------------------------------------------------
// Endpoint: PATCH /game/admin/toggle
// -------------------------------------------------------------
if ($method === 'PATCH' && ($subPath === '/game/admin/toggle' || $subPath === '/game/admin/toggle/')) {
    requireAdminUser($jwtSecret, $pdo);
    $config = getAppSecretConfig($pdo, 'MINI_GAME_CONFIG', getDefaultGameConfig());
    $config['enabled'] = empty($config['enabled']);
    saveAppSecretConfig($pdo, 'MINI_GAME_CONFIG', $config);
    echo json_encode(['enabled' => $config['enabled']]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /game/admin/stats
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/game/admin/stats' || $subPath === '/game/admin/stats/')) {
    requireAdminUser($jwtSecret, $pdo);
    $config = getAppSecretConfig($pdo, 'MINI_GAME_CONFIG', getDefaultGameConfig());
    $cycleAmount = max(100, (int)($config['cycleSpendAmount'] ?? 4999));

    $customers = [];
    try {
        $customers = $pdo->query('SELECT id, name, email, phone, preferences, createdAt FROM Customer WHERE isActive = 1')->fetchAll();
    } catch (Exception $e) {}

    $spentByCustomer = [];
    $ordersByCustomer = [];
    try {
        $orders = $pdo->query("SELECT customerId, total, grandTotal FROM PickupOrder WHERE status = 'COMPLETED' AND customerId IS NOT NULL")->fetchAll();
        foreach ($orders as $o) {
            $cid = $o['customerId'];
            if (!$cid) continue;
            $amt = (int)($o['grandTotal'] ?: $o['total'] ?: 0);
            $spentByCustomer[$cid] = ($spentByCustomer[$cid] ?? 0) + $amt;
            $ordersByCustomer[$cid] = ($ordersByCustomer[$cid] ?? 0) + 1;
        }
    } catch (Exception $e) {}

    $customerStats = [];
    foreach ($customers as $c) {
        $cid = $c['id'];
        $totalSpent = $spentByCustomer[$cid] ?? 0;
        $orderCount = $ordersByCustomer[$cid] ?? 0;
        $prefs = !empty($c['preferences']) && is_string($c['preferences']) ? (json_decode($c['preferences'], true) ?: []) : [];

        $cyclePlays = (int)floor($totalSpent / $cycleAmount);
        $gamePlaysUsed = isset($prefs['gamePlaysUsed']) && is_numeric($prefs['gamePlaysUsed']) ? (int)$prefs['gamePlaysUsed'] : (!empty($prefs['lastGamePlayAt']) ? 1 : 0);
        $availablePlays = max(0, $cyclePlays - $gamePlaysUsed);
        $currentCycleSpent = $totalSpent % $cycleAmount;
        $remainingToNextPlay = $availablePlays > 0 ? 0 : max(0, $cycleAmount - $currentCycleSpent);

        $customerStats[] = [
            'id' => $c['id'],
            'name' => $c['name'],
            'email' => $c['email'],
            'phone' => $c['phone'],
            'totalSpent' => $totalSpent,
            'orderCount' => $orderCount,
            'cyclePlaysEarned' => $cyclePlays,
            'gamePlaysUsed' => $gamePlaysUsed,
            'availablePlays' => $availablePlays,
            'currentCycleSpent' => $currentCycleSpent,
            'remainingToNextPlay' => $remainingToNextPlay,
            'hasQualified' => ($totalSpent >= $cycleAmount),
            'lastGamePlayAt' => $prefs['lastGamePlayAt'] ?? null,
            'lastGamePrize' => $prefs['lastGamePrize'] ?? null,
        ];
    }

    header('Cache-Control: no-store');
    echo json_encode([
        'cycleSpendAmount' => $cycleAmount,
        'requireOrderSpend' => (bool)($config['requireOrderSpend'] ?? true),
        'customers' => $customerStats,
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /game/status
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/game/status' || $subPath === '/game/status/')) {
    $customer = requireCustomerUser($jwtSecret, $pdo);
    $config = getAppSecretConfig($pdo, 'MINI_GAME_CONFIG', getDefaultGameConfig());
    $cycleAmount = max(100, (int)($config['cycleSpendAmount'] ?? 4999));

    $prefs = !empty($customer['preferences']) && is_string($customer['preferences']) ? (json_decode($customer['preferences'], true) ?: []) : [];

    // Calculate customer spend
    $totalSpent = 0;
    $qualifyingOrderCount = 0;
    try {
        $stmt = $pdo->prepare("SELECT total, grandTotal FROM PickupOrder WHERE status = 'COMPLETED' AND customerId = ?");
        $stmt->execute([$customer['id']]);
        while ($row = $stmt->fetch()) {
            $totalSpent += (int)($row['grandTotal'] ?: $row['total'] ?: 0);
            $qualifyingOrderCount++;
        }
    } catch (Exception $e) {}

    $cyclePlays = (int)floor($totalSpent / $cycleAmount);
    $gamePlaysUsed = isset($prefs['gamePlaysUsed']) && is_numeric($prefs['gamePlaysUsed']) ? (int)$prefs['gamePlaysUsed'] : (!empty($prefs['lastGamePlayAt']) ? 1 : 0);
    $availablePlays = max(0, $cyclePlays - $gamePlaysUsed);
    $currentCycleSpent = $totalSpent % $cycleAmount;
    $remainingToNextPlay = $availablePlays > 0 ? 0 : max(0, $cycleAmount - $currentCycleSpent);
    $progressPercent = min(100, round(($currentCycleSpent / $cycleAmount) * 100));

    // Check cooldown
    $lastPlay = !empty($prefs['lastGamePlayAt']) ? strtotime($prefs['lastGamePlayAt']) : 0;
    $cooldownSec = ((int)($config['cooldownHours'] ?? 24)) * 3600;
    $canPlayCooldown = (time() - $lastPlay) >= $cooldownSec;

    $canPlay = !empty($config['enabled']) && $canPlayCooldown && (!$config['requireOrderSpend'] || $availablePlays > 0);

    // Filter out prize weights for security
    $safePrizes = array_map(function ($p) {
        return [
            'id' => $p['id'],
            'titleJa' => $p['titleJa'],
            'type' => $p['type'],
            'value' => (int)($p['value'] ?? 0),
            'color' => $p['color'] ?? '#2563eb',
            'icon' => $p['icon'] ?? null,
            'descriptionJa' => $p['descriptionJa'] ?? null,
        ];
    }, $config['prizes'] ?? []);

    echo json_encode([
        'enabled' => (bool)$config['enabled'],
        'mode' => $config['mode'] ?? 'LUCKY_WHEEL',
        'titleJa' => $config['titleJa'],
        'subtitleJa' => $config['subtitleJa'],
        'canPlay' => $canPlay,
        'availablePlays' => $availablePlays,
        'prizes' => $safePrizes,
        'spendStatus' => [
            'requireOrderSpend' => (bool)($config['requireOrderSpend'] ?? true),
            'cycleSpendAmount' => $cycleAmount,
            'totalSpent' => $totalSpent,
            'currentCycleSpent' => $currentCycleSpent,
            'remainingToNextPlay' => $remainingToNextPlay,
            'totalPlaysEarned' => $cyclePlays,
            'gamePlaysUsed' => $gamePlaysUsed,
            'availablePlays' => $availablePlays,
            'progressPercent' => $progressPercent,
            'qualifyingOrderCount' => $qualifyingOrderCount,
        ],
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /dashboard/stats
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/dashboard/stats' || $subPath === '/dashboard/stats/')) {
    requireStaffUser($jwtSecret, $pdo);

    $menuItemsCount = (int)$pdo->query('SELECT COUNT(*) FROM MenuItem')->fetchColumn();
    $soldOutItemsCount = (int)$pdo->query('SELECT COUNT(*) FROM MenuItem WHERE isSoldOut = 1')->fetchColumn();
    $categoriesCount = (int)$pdo->query('SELECT COUNT(*) FROM Category')->fetchColumn();
    $carouselsCount = (int)$pdo->query('SELECT COUNT(*) FROM CarouselSlide WHERE isActive = 1')->fetchColumn();

    $unreadMessagesCount = 0;
    try {
        $unreadMessagesCount = (int)$pdo->query('SELECT COUNT(*) FROM ContactMessage WHERE isRead = 0')->fetchColumn();
    } catch (Exception $e) {}

    $newOrdersCount = 0;
    $activeOrdersCount = 0;
    try {
        $newOrdersCount = (int)$pdo->query("SELECT COUNT(*) FROM PickupOrder WHERE status = 'NEW'")->fetchColumn();
        $activeOrdersCount = (int)$pdo->query("SELECT COUNT(*) FROM PickupOrder WHERE status IN ('NEW', 'CONFIRMED', 'READY')")->fetchColumn();
    } catch (Exception $e) {}

    $customersCount = 0;
    try {
        $customersCount = (int)$pdo->query('SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL')->fetchColumn();
    } catch (Exception $e) {}

    header('Cache-Control: no-store');
    echo json_encode([
        'menuItemsCount' => $menuItemsCount,
        'soldOutItemsCount' => $soldOutItemsCount,
        'categoriesCount' => $categoriesCount,
        'carouselsCount' => $carouselsCount,
        'unreadMessagesCount' => $unreadMessagesCount,
        'newOrdersCount' => $newOrdersCount,
        'activeOrdersCount' => $activeOrdersCount,
        'customersCount' => $customersCount,
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /dashboard/live
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/dashboard/live' || $subPath === '/dashboard/live/')) {
    $user = requireStaffUser($jwtSecret, $pdo);
    $isAdmin = ($user['role'] === 'ADMIN');

    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $nowIso = $now->format('c');
    $todayStart = $now->format('Y-m-d') . ' 00:00:00';

    // Orders today & open
    $openOrders = [];
    $todayOrders = [];
    $recentOrders = [];
    try {
        $stmtOpen = $pdo->prepare("SELECT status, pickupAt, number, customerName FROM PickupOrder WHERE status IN ('NEW', 'CONFIRMED', 'READY') ORDER BY pickupAt ASC");
        $stmtOpen->execute();
        $openOrders = $stmtOpen->fetchAll();

        $stmtToday = $pdo->prepare("SELECT status, grandTotal, total FROM PickupOrder WHERE createdAt >= ?");
        $stmtToday->execute([$todayStart]);
        $todayOrders = $stmtToday->fetchAll();

        $stmtRecent = $pdo->query("SELECT id, number, status, fulfillment, customerName, customerId, grandTotal, total, createdAt, pickupAt FROM PickupOrder ORDER BY createdAt DESC LIMIT 8");
        $recentOrders = $stmtRecent->fetchAll();
    } catch (Exception $e) {}

    // Unread messages & recent messages
    $unreadMessages = 0;
    $recentMessages = [];
    $reservations = [];
    try {
        $unreadMessages = (int)$pdo->query('SELECT COUNT(*) FROM ContactMessage WHERE isRead = 0')->fetchColumn();
        $recentMessages = $pdo->query('SELECT id, name, type, isRead, createdAt, date, guests FROM ContactMessage ORDER BY createdAt DESC LIMIT 5')->fetchAll();
        $reservationsStmt = $pdo->prepare("SELECT id, name, date, guests, isRead FROM ContactMessage WHERE type = 'RESERVATION' AND (date >= ? OR createdAt >= ?) ORDER BY date ASC LIMIT 6");
        $reservationsStmt->execute([$todayStart, $todayStart]);
        $reservations = $reservationsStmt->fetchAll();
    } catch (Exception $e) {}

    // Sold out items & menu count
    $menuCount = 0;
    $soldOutItems = [];
    try {
        $menuCount = (int)$pdo->query('SELECT COUNT(*) FROM MenuItem')->fetchColumn();
        $soldOutStmt = $pdo->query('SELECT nameEn, nameJa FROM MenuItem WHERE isSoldOut = 1 LIMIT 12');
        while ($row = $soldOutStmt->fetch()) {
            $soldOutItems[] = $row['nameJa'] ?: $row['nameEn'];
        }
    } catch (Exception $e) {}

    // Live offers count
    $liveOffers = 0;
    try {
        $liveOffers = (int)$pdo->query("SELECT COUNT(*) FROM Offer WHERE isActive = 1 AND (endsAt IS NULL OR endsAt >= NOW())")->fetchColumn();
    } catch (Exception $e) {}

    // Late & open counts
    $newCount = 0;
    $confirmedCount = 0;
    $readyCount = 0;
    $lateCount = 0;
    $nextDue = null;

    foreach ($openOrders as $o) {
        if ($o['status'] === 'NEW') $newCount++;
        elseif ($o['status'] === 'CONFIRMED') $confirmedCount++;
        elseif ($o['status'] === 'READY') $readyCount++;

        if ($o['status'] !== 'READY') {
            if ($nextDue === null) {
                $nextDue = [
                    'number' => (int)$o['number'],
                    'customerName' => $o['customerName'],
                    'pickupAt' => $o['pickupAt'],
                ];
            }
            if (!empty($o['pickupAt']) && strtotime($o['pickupAt']) < $now->getTimestamp()) {
                $lateCount++;
            }
        }
    }

    $placedToday = 0;
    $completedToday = 0;
    $cancelledToday = 0;
    $salesToday = 0;

    foreach ($todayOrders as $to) {
        if ($to['status'] !== 'CANCELLED') $placedToday++;
        if ($to['status'] === 'COMPLETED') {
            $completedToday++;
            $salesToday += (int)($to['grandTotal'] ?? $to['total'] ?? 0);
        } elseif ($to['status'] === 'CANCELLED') {
            $cancelledToday++;
        }
    }

    // Settings for ordering
    $settingsStmt = $pdo->query('SELECT orderingEnabled, pickupEnabled, deliveryEnabled, orderingPausedUntil, stampRewards, stampsEnabled FROM Settings LIMIT 1');
    $set = $settingsStmt->fetch() ?: [];

    $orderingState = [
        'pausedUntil' => $set['orderingPausedUntil'] ?? null,
        'pickup' => ['enabled' => (bool)($set['pickupEnabled'] ?? false)],
        'delivery' => ['enabled' => (bool)($set['deliveryEnabled'] ?? false)],
        'stampCard' => (bool)($set['stampsEnabled'] ?? false),
        'liveOffers' => $liveOffers,
    ];

    $formattedRecent = array_map(function ($ro) use ($isAdmin) {
        return [
            'id' => $ro['id'],
            'number' => (int)$ro['number'],
            'status' => $ro['status'],
            'fulfillment' => $ro['fulfillment'] ?? 'PICKUP',
            'customerName' => $ro['customerName'],
            'member' => !empty($ro['customerId']),
            'amount' => $isAdmin ? (int)($ro['grandTotal'] ?? $ro['total'] ?? 0) : null,
            'createdAt' => $ro['createdAt'],
            'pickupAt' => $ro['pickupAt'],
        ];
    }, $recentOrders);

    header('Cache-Control: no-store');
    echo json_encode([
        'serverTime' => $nowIso,
        'open' => [
            'NEW' => $newCount,
            'CONFIRMED' => $confirmedCount,
            'READY' => $readyCount,
            'late' => $lateCount,
            'nextDue' => $nextDue,
        ],
        'today' => [
            'placed' => $placedToday,
            'completed' => $completedToday,
            'cancelled' => $cancelledToday,
            'sales' => $isAdmin ? $salesToday : null,
        ],
        'ordering' => $orderingState,
        'recentOrders' => $formattedRecent,
        'messages' => [
            'unread' => $unreadMessages,
            'recent' => $recentMessages,
        ],
        'reservations' => $reservations,
        'menu' => [
            'total' => $menuCount,
            'soldOut' => $soldOutItems,
        ],
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /dashboard/analytics
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/dashboard/analytics' || $subPath === '/dashboard/analytics/')) {
    requireAdminUser($jwtSecret, $pdo);

    $range = $_GET['range'] ?? '7d';
    $daysCount = 7;
    if ($range === 'today') $daysCount = 1;
    elseif ($range === 'yesterday') $daysCount = 1;
    elseif ($range === '7d') $daysCount = 7;
    elseif ($range === '30d') $daysCount = 30;
    elseif ($range === '90d') $daysCount = 90;

    $tz = 'Asia/Tokyo';
    $now = new DateTime('now', new DateTimeZone($tz));
    $startDate = (clone $now)->modify("-{$daysCount} days");
    $startIso = $startDate->format('Y-m-d') . ' 00:00:00';
    $endIso = $now->format('Y-m-d') . ' 23:59:59';

    // Period days array
    $days = [];
    $iter = clone $startDate;
    while ($iter <= $now) {
        $days[] = $iter->format('Y-m-d');
        $iter->modify('+1 day');
    }

    // Orders in current period
    $orders = [];
    try {
        $stmt = $pdo->prepare("SELECT * FROM PickupOrder WHERE createdAt >= ? AND createdAt <= ?");
        $stmt->execute([$startIso, $endIso]);
        $orders = $stmt->fetchAll();
    } catch (Exception $e) {}

    $sales = 0;
    $ordersCount = 0;
    $completedCount = 0;
    $cancelledCount = 0;
    $itemsSold = 0;
    $discounts = 0;
    $deliveryFees = 0;
    $memberOrders = 0;
    $pickupOrders = 0;
    $pickupSales = 0;
    $deliveryOrders = 0;
    $deliverySales = 0;

    // Series map by day
    $seriesMap = [];
    foreach ($days as $d) {
        $seriesMap[$d] = ['key' => $d, 'sales' => 0, 'orders' => 0, 'cancelled' => 0];
    }

    // Top items aggregation
    $topItemsMap = [];

    foreach ($orders as $o) {
        $createdDay = substr($o['createdAt'], 0, 10);
        $isCancelled = ($o['status'] === 'CANCELLED');
        $isCompleted = ($o['status'] === 'COMPLETED');
        $amount = (int)($o['grandTotal'] ?? $o['total'] ?? 0);

        if (isset($seriesMap[$createdDay])) {
            if (!$isCancelled) {
                $seriesMap[$createdDay]['orders']++;
                $seriesMap[$createdDay]['sales'] += $amount;
            } else {
                $seriesMap[$createdDay]['cancelled']++;
            }
        }

        if ($isCancelled) {
            $cancelledCount++;
            continue;
        }

        $ordersCount++;
        $sales += $amount;
        $deliveryFees += (int)($o['deliveryFee'] ?? 0);
        $discounts += (int)($o['pointsDiscount'] ?? 0);
        if (!empty($o['customerId'])) $memberOrders++;

        $fulfillment = $o['fulfillment'] ?? 'PICKUP';
        if ($fulfillment === 'DELIVERY') {
            $deliveryOrders++;
            $deliverySales += $amount;
        } else {
            $pickupOrders++;
            $pickupSales += $amount;
        }

        // Items parse
        $items = is_string($o['items']) ? json_decode($o['items'], true) : $o['items'];
        if (is_array($items)) {
            foreach ($items as $it) {
                $qty = (int)($it['quantity'] ?? 1);
                $itemsSold += $qty;
                $nameEn = $it['nameEn'] ?? 'Item';
                $nameJa = $it['nameJa'] ?? null;
                $key = $nameEn;
                if (!isset($topItemsMap[$key])) {
                    $topItemsMap[$key] = ['nameEn' => $nameEn, 'nameJa' => $nameJa, 'quantity' => 0, 'sales' => 0, 'orders' => 0];
                }
                $topItemsMap[$key]['quantity'] += $qty;
                $topItemsMap[$key]['sales'] += (int)($it['lineTotal'] ?? ($qty * ($it['unitPrice'] ?? 0)));
                $topItemsMap[$key]['orders']++;
            }
        }
    }

    usort($topItemsMap, function ($a, $b) {
        return $b['quantity'] <=> $a['quantity'];
    });
    $topItemsList = array_slice(array_values($topItemsMap), 0, 10);

    // Busy hours (7 days x 24 hours grid)
    $busyHours = array_fill(0, 7, array_fill(0, 24, 0));
    foreach ($orders as $o) {
        if ($o['status'] === 'CANCELLED') continue;
        $dt = new DateTime($o['createdAt'], new DateTimeZone($tz));
        $dow = (int)$dt->format('w'); // 0 = Sun
        $hour = (int)$dt->format('G');
        $busyHours[$dow][$hour]++;
    }

    // Members count
    $totalMembers = 0;
    $newMembers = 0;
    $newsletterMembers = 0;
    try {
        $totalMembers = (int)$pdo->query('SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL')->fetchColumn();
        $newMembersStmt = $pdo->prepare('SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL AND createdAt >= ? AND createdAt <= ?');
        $newMembersStmt->execute([$startIso, $endIso]);
        $newMembers = (int)$newMembersStmt->fetchColumn();
        $newsletterMembers = (int)$pdo->query('SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL AND newsletterOptIn = 1')->fetchColumn();
    } catch (Exception $e) {}

    // Contact messages
    $messages = [];
    try {
        $msgStmt = $pdo->prepare('SELECT type, COUNT(*) as cnt FROM ContactMessage WHERE createdAt >= ? AND createdAt <= ? GROUP BY type');
        $msgStmt->execute([$startIso, $endIso]);
        while ($row = $msgStmt->fetch()) {
            $messages[$row['type'] ?: 'GENERAL'] = (int)$row['cnt'];
        }
    } catch (Exception $e) {}

    $avgOrder = $ordersCount > 0 ? (int)round($sales / $ordersCount) : null;
    $cancelRate = ($ordersCount + $cancelledCount) > 0 ? round($cancelledCount / ($ordersCount + $cancelledCount), 2) : 0;
    $memberShare = $ordersCount > 0 ? round($memberOrders / $ordersCount, 2) : 0;

    $headline = [
        'sales' => $sales,
        'orders' => $ordersCount,
        'averageOrder' => $avgOrder,
        'itemsSold' => $itemsSold,
        'cancelled' => $cancelledCount,
        'cancelRate' => $cancelRate,
        'averagePrepMinutes' => 20,
        'onTimeRate' => 0.95,
        'discounts' => $discounts,
        'deliveryFees' => $deliveryFees,
        'memberOrders' => $memberOrders,
        'memberShare' => $memberShare,
    ];

    // Previous headline placeholder
    $previousHeadline = [
        'sales' => (int)round($sales * 0.9),
        'orders' => (int)round($ordersCount * 0.9),
        'averageOrder' => $avgOrder,
        'itemsSold' => (int)round($itemsSold * 0.9),
        'cancelled' => 0,
        'cancelRate' => 0,
        'averagePrepMinutes' => 20,
        'onTimeRate' => 1,
        'discounts' => 0,
        'deliveryFees' => 0,
        'memberOrders' => (int)round($memberOrders * 0.9),
        'memberShare' => $memberShare,
    ];

    header('Cache-Control: no-store');
    echo json_encode([
        'period' => [
            'range' => $range,
            'start' => $startIso,
            'end' => $endIso,
            'bucket' => 'day',
            'days' => $days,
        ],
        'headline' => $headline,
        'previous' => $previousHeadline,
        'change' => [
            'sales' => 0.1,
            'orders' => 0.1,
            'averageOrder' => 0,
            'newMembers' => 0,
        ],
        'series' => array_values($seriesMap),
        'busyHours' => $busyHours,
        'topItems' => $topItemsList,
        'fulfillment' => [
            'PICKUP' => ['orders' => $pickupOrders, 'sales' => $pickupSales],
            'DELIVERY' => ['orders' => $deliveryOrders, 'sales' => $deliverySales],
        ],
        'promotions' => [],
        'members' => [
            'total' => $totalMembers,
            'new' => $newMembers,
            'previousNew' => 0,
            'newsletter' => $newsletterMembers,
            'buyers' => $memberOrders,
            'returning' => 0,
        ],
        'loyalty' => [
            'pointsEarned' => 0,
            'pointsRedeemed' => 0,
            'pointsOutstanding' => 0,
            'stampsGiven' => 0,
            'rewardsEarned' => 0,
            'rewardsUsed' => 0,
        ],
        'messages' => $messages,
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /dashboard/notifications
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/dashboard/notifications' || $subPath === '/dashboard/notifications/')) {
    $user = requireStaffUser($jwtSecret, $pdo);

    $notes = [];
    try {
        $soldOutStmt = $pdo->query('SELECT nameEn, nameJa FROM MenuItem WHERE isSoldOut = 1 LIMIT 4');
        $soldOutNames = [];
        while ($row = $soldOutStmt->fetch()) {
            $soldOutNames[] = $row['nameJa'] ?: $row['nameEn'];
        }
        if (!empty($soldOutNames)) {
            $notes[] = [
                'id' => 'sold-out',
                'tone' => 'info',
                'title' => count($soldOutNames) . ' item(s) sold out',
                'detail' => implode('、', $soldOutNames),
                'tab' => 'Menu Management',
            ];
        }
    } catch (Exception $e) {}

    header('Cache-Control: no-store');
    echo json_encode([
        'count' => count($notes),
        'items' => $notes,
    ]);
    exit;
}

// Helper: JWT verification & creation (HS256)

function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function createJwt($payload, $secret, $ttlSeconds = 28800) {
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $now = time();
    $payload['iat'] = $now;
    $payload['exp'] = $now + $ttlSeconds;
    $segments = [
        base64UrlEncode(json_encode($header)),
        base64UrlEncode(json_encode($payload))
    ];
    $signingInput = implode('.', $segments);
    $signature = hash_hmac('sha256', $signingInput, $secret, true);
    $segments[] = base64UrlEncode($signature);
    return implode('.', $segments);
}

function verifyJwt($jwt, $secret) {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return null;
    list($headb64, $bodyb64, $sigb64) = $parts;
    $sig = base64UrlDecode($sigb64);
    $expectedSig = hash_hmac('sha256', "$headb64.$bodyb64", $secret, true);
    if (!hash_equals($sig, $expectedSig)) return null;
    $payload = json_decode(base64UrlDecode($bodyb64), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) return null;
    return $payload;
}

function getBearerOrCookie($cookieName) {
    if (!empty($_COOKIE[$cookieName])) {
        return $_COOKIE[$cookieName];
    }
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function generateUuidV4() {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // set version to 0100
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // set bits 6-7 to 10
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function requireStaffUser($secret, $pdo) {
    $token = getBearerOrCookie('kalpana_session');
    if (!$token) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Staff login required']]);
        exit;
    }
    $payload = verifyJwt($token, $secret);
    if (!$payload || empty($payload['sub']) || isset($payload['aud'])) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Invalid or expired session']]);
        exit;
    }
    $stmt = $pdo->prepare('SELECT id, name, email, role, isActive FROM User WHERE id = ? LIMIT 1');
    $stmt->execute([$payload['sub']]);
    $user = $stmt->fetch();
    if (!$user || !$user['isActive']) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'User account is inactive or not found']]);
        exit;
    }
    return $user;
}

function requireAdminUser($secret, $pdo) {
    $user = requireStaffUser($secret, $pdo);
    if ($user['role'] !== 'ADMIN') {
        http_response_code(403);
        echo json_encode(['error' => ['code' => 'FORBIDDEN', 'message' => 'Admin permissions required']]);
        exit;
    }
    return $user;
}

function requireCustomerUser($secret, $pdo) {
    $token = getBearerOrCookie('kalpana_customer');
    if (!$token) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Customer login required']]);
        exit;
    }
    $payload = verifyJwt($token, $secret);
    if (!$payload || empty($payload['sub']) || ($payload['aud'] ?? '') !== 'customer') {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Invalid or expired customer session']]);
        exit;
    }
    $stmt = $pdo->prepare('SELECT * FROM Customer WHERE id = ? LIMIT 1');
    $stmt->execute([$payload['sub']]);
    $customer = $stmt->fetch();
    if (!$customer || (isset($customer['isActive']) && !$customer['isActive'])) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Customer account is inactive or not found']]);
        exit;
    }
    return $customer;
}

// -------------------------------------------------------------
// Endpoint: POST /auth/login
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/auth/login' || $subPath === '/auth/login/')) {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'Email and password required']]);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id, name, email, role, passwordHash, isActive FROM User WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    $verified = $user && !empty($user['passwordHash']) && password_verify($password, $user['passwordHash']);
    if (!$user || !$verified || !$user['isActive']) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'INVALID_CREDENTIALS', 'message' => 'Invalid email or password']]);
        exit;
    }

    $sessionUser = [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
    ];

    $ttl = ($user['role'] === 'KITCHEN') ? 57600 : 28800; // 16h for kitchen, 8h for staff
    $token = createJwt(['sub' => $user['id'], 'role' => $user['role']], $jwtSecret, $ttl);

    setcookie('kalpana_session', $token, [
        'expires' => time() + $ttl,
        'path' => '/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);

    echo json_encode(['user' => $sessionUser, 'token' => $token]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /auth/logout
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/auth/logout' || $subPath === '/auth/logout/')) {
    setcookie('kalpana_session', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    http_response_code(204);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /auth/me
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/auth/me' || $subPath === '/auth/me/')) {
    $token = getBearerOrCookie('kalpana_session');
    if (!$token) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Not authenticated']]);
        exit;
    }

    $payload = verifyJwt($token, $jwtSecret);
    if (!$payload || empty($payload['sub']) || isset($payload['aud'])) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Invalid or expired session']]);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id, name, email, role, isActive FROM User WHERE id = ? LIMIT 1');
    $stmt->execute([$payload['sub']]);
    $user = $stmt->fetch();

    if (!$user || !$user['isActive']) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Account inactive or deleted']]);
        exit;
    }

    echo json_encode([
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
        ]
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /customers/login
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/customers/login' || $subPath === '/customers/login/')) {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    $stmt = $pdo->prepare('SELECT * FROM Customer WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $customer = $stmt->fetch();

    $verified = $customer && !empty($customer['passwordHash']) && password_verify($password, $customer['passwordHash']);
    if (!$customer || !$verified || (isset($customer['isActive']) && !$customer['isActive'])) {
        http_response_code(401);
        echo json_encode(['error' => ['code' => 'INVALID_CREDENTIALS', 'message' => 'メールアドレスまたはパスワードが正しくありません。']]);
        exit;
    }

    $ttl = 30 * 86400; // 30 days
    $token = createJwt(['sub' => $customer['id'], 'aud' => 'customer'], $jwtSecret, $ttl);

    setcookie('kalpana_customer', $token, [
        'expires' => time() + $ttl,
        'path' => '/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);

    unset($customer['passwordHash']);
    echo json_encode(['customer' => $customer, 'token' => $token]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /customers/me
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/customers/me' || $subPath === '/customers/me/')) {
    $token = getBearerOrCookie('kalpana_customer');
    if (!$token) {
        echo json_encode(['customer' => null, 'loyalty' => null]);
        exit;
    }

    $payload = verifyJwt($token, $jwtSecret);
    if (!$payload || empty($payload['sub']) || ($payload['aud'] ?? '') !== 'customer') {
        echo json_encode(['customer' => null, 'loyalty' => null]);
        exit;
    }

    $stmt = $pdo->prepare('SELECT * FROM Customer WHERE id = ? LIMIT 1');
    $stmt->execute([$payload['sub']]);
    $customer = $stmt->fetch();

    if (!$customer || (isset($customer['isActive']) && !$customer['isActive'])) {
        echo json_encode(['customer' => null, 'loyalty' => null]);
        exit;
    }

    unset($customer['passwordHash']);
    echo json_encode(['customer' => $customer, 'loyalty' => ['enabled' => true, 'pointsPer100Yen' => 1, 'pointValueYen' => 1]]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /customers/logout
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/customers/logout' || $subPath === '/customers/logout/')) {
    setcookie('kalpana_customer', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    http_response_code(204);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /users
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/users' || $subPath === '/users/')) {
    requireAdminUser($jwtSecret, $pdo);
    $stmt = $pdo->query('SELECT id, name, email, role, isActive, createdAt FROM User ORDER BY createdAt DESC');
    $users = $stmt->fetchAll();
    foreach ($users as &$u) {
        $u['isActive'] = (bool)$u['isActive'];
    }
    unset($u);
    header('Cache-Control: no-store');
    echo json_encode($users);
    exit;
}

// -------------------------------------------------------------
// Endpoint: POST /users
// -------------------------------------------------------------
if ($method === 'POST' && ($subPath === '/users' || $subPath === '/users/')) {
    requireAdminUser($jwtSecret, $pdo);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $name = trim($input['name'] ?? '');
    $email = strtolower(trim($input['email'] ?? ''));
    $role = strtoupper(trim($input['role'] ?? 'STAFF'));
    $password = $input['password'] ?? '';

    if (empty($name) || empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'Valid name and email are required']]);
        exit;
    }
    if (!in_array($role, ['ADMIN', 'STAFF', 'KITCHEN'], true)) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'Invalid role']]);
        exit;
    }
    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'Password must be at least 8 characters']]);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id FROM User WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => ['code' => 'EMAIL_TAKEN', 'message' => 'A user with this email already exists']]);
        exit;
    }

    $id = generateUuidV4();
    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $now = date('Y-m-d H:i:s');

    $stmt = $pdo->prepare('INSERT INTO User (id, name, email, role, isActive, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?, ?)');
    $stmt->execute([$id, $name, $email, $role, $hash, $now, $now]);

    http_response_code(201);
    echo json_encode([
        'id' => $id,
        'name' => $name,
        'email' => $email,
        'role' => $role,
        'isActive' => true,
        'createdAt' => $now,
    ]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: PUT /users/:id
// -------------------------------------------------------------
if ($method === 'PUT' && preg_match('#^/users/([a-zA-Z0-9_-]+)/?$#', $subPath, $matches)) {
    $admin = requireAdminUser($jwtSecret, $pdo);
    $targetId = $matches[1];
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $stmt = $pdo->prepare('SELECT * FROM User WHERE id = ? LIMIT 1');
    $stmt->execute([$targetId]);
    $user = $stmt->fetch();
    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => ['code' => 'NOT_FOUND', 'message' => 'User not found']]);
        exit;
    }

    $newRole = isset($input['role']) ? strtoupper(trim($input['role'])) : $user['role'];
    $newActive = isset($input['isActive']) ? (bool)$input['isActive'] : (bool)$user['isActive'];

    // Prevent self-lockout
    if ($targetId === $admin['id'] && ($newRole !== 'ADMIN' || !$newActive)) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'SELF_LOCKOUT', 'message' => 'You cannot remove your own admin access']]);
        exit;
    }

    $updates = ['role = ?', 'isActive = ?', 'updatedAt = NOW()'];
    $params = [$newRole, $newActive ? 1 : 0];

    if (!empty($input['password'])) {
        if (strlen($input['password']) < 8) {
            http_response_code(400);
            echo json_encode(['error' => ['code' => 'VALIDATION_FAILED', 'message' => 'Password must be at least 8 characters']]);
            exit;
        }
        $updates[] = 'passwordHash = ?';
        $params[] = password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]);
    }

    $params[] = $targetId;
    $sql = 'UPDATE User SET ' . implode(', ', $updates) . ' WHERE id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// Endpoint: DELETE /users/:id
// -------------------------------------------------------------
if ($method === 'DELETE' && preg_match('#^/users/([a-zA-Z0-9_-]+)/?$#', $subPath, $matches)) {
    $admin = requireAdminUser($jwtSecret, $pdo);
    $targetId = $matches[1];
    if ($targetId === $admin['id']) {
        http_response_code(400);
        echo json_encode(['error' => ['code' => 'SELF_LOCKOUT', 'message' => 'You cannot delete yourself']]);
        exit;
    }
    $stmt = $pdo->prepare('DELETE FROM User WHERE id = ?');
    $stmt->execute([$targetId]);
    http_response_code(204);
    exit;
}

// Default 404 for unmatched API routes
http_response_code(404);
echo json_encode(['error' => ['code' => 'NOT_FOUND', 'message' => 'API endpoint not found: ' . $subPath]]);
exit;
