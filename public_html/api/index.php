<?php
/**
 * Kalpana Curry - Hostinger Production API Gateway
 * Bridges frontend requests directly to MySQL on Hostinger Shared Hosting
 */

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
$dbHost = 'localhost';
$dbName = 'u309882766_kalpanadb';
$dbUser = 'u309882766_kalpana';
$dbPass = '64650@Mohan';

try {
    $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => ['code' => 'DB_CONNECTION_FAILED', 'message' => 'Database connection failed']]);
    exit;
}

// 3. Routing
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Normalise path: strip trailing slash
$path = rtrim($requestUri, '/');
if (empty($path)) $path = '/';

// Optional: handle prefix like /api/v1 or /api
$prefix = '/api/v1';
if (str_starts_with($path, $prefix)) {
    $subPath = substr($path, strlen($prefix));
} elseif (str_starts_with($path, '/api')) {
    $subPath = substr($path, 4);
} else {
    $subPath = $path;
}
if (empty($subPath)) $subPath = '/';

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
    $stmt = $pdo->query('SELECT * FROM MenuItem ORDER BY categoryId ASC, sortOrder ASC, createdAt DESC');
    $items = $stmt->fetchAll();

    // 2. Fetch categories map
    $catStmt = $pdo->query('SELECT * FROM Category');
    $cats = [];
    while ($cat = $catStmt->fetch()) {
        $cats[$cat['id']] = $cat;
    }

    // 3. Fetch variants
    $varStmt = $pdo->query('SELECT * FROM ItemVariant ORDER BY sortOrder ASC');
    $variantsByItem = [];
    while ($var = $varStmt->fetch()) {
        $variantsByItem[$var['itemId']][] = $var;
    }

    // 4. Fetch option groups relation
    $optStmt = $pdo->query('
        SELECT mog.A as itemId, og.id, og.nameJa, og.nameEn, og.type
        FROM _MenuItemToOptionGroup mog
        JOIN OptionGroup og ON og.id = mog.B
    ');
    $optionsByItem = [];
    while ($opt = $optStmt->fetch()) {
        $optionsByItem[$opt['itemId']][] = [
            'id' => $opt['id'],
            'nameJa' => $opt['nameJa'],
            'nameEn' => $opt['nameEn'],
            'type' => $opt['type'],
        ];
    }

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
    $stmt = $pdo->query('SELECT * FROM Offer WHERE isActive = 1 ORDER BY sortOrder ASC');
    $offers = $stmt->fetchAll();
    echo json_encode($offers);
    exit;
}

// -------------------------------------------------------------
// Endpoint: GET /auth/me
// -------------------------------------------------------------
if ($method === 'GET' && ($subPath === '/auth/me' || $subPath === '/auth/me/')) {
    http_response_code(401);
    echo json_encode(['error' => ['code' => 'UNAUTHORIZED', 'message' => 'Not authenticated']]);
    exit;
}

// Default 404 for unmatched API routes
http_response_code(404);
echo json_encode(['error' => ['code' => 'NOT_FOUND', 'message' => 'API endpoint not found: ' . $subPath]]);
exit;
