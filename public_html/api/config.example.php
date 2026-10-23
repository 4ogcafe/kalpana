<?php
// Copy to kalpana-config.php in the directory ABOVE public_html (outside the web root),
// fill in real values, and never commit that file.
return [
    'db_host'    => 'localhost',
    'db_name'    => '',
    'db_user'    => '',
    'db_pass'    => '',
    'jwt_secret' => '', // 32+ random characters, e.g. `openssl rand -hex 32`
];
