<?php
// Production configuration template.
// Copy this file to `kalpana-config.php` in the directory ABOVE public_html (or in the repository root),
// fill in your values, and never commit `kalpana-config.php` to version control.
return [
    'db_host'               => '127.0.0.1',
    'db_name'               => 'u309882766_kalpanadb',
    'db_user'               => 'u309882766_kalpana',
    'db_pass'               => '', // Set your database password here
    'jwt_secret'            => '', // 32+ random characters, e.g. `openssl rand -hex 32`
    'google_places_api_key' => '', // Google Places API key (optional)
    'cors_origins'          => 'https://kalpnacurry.com,https://www.kalpnacurry.com,http://localhost:5173,http://127.0.0.1:5173',
];
