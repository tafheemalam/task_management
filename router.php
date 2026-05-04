<?php
// PHP built-in server router for TaskFlow

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Route API requests to the API handler
if (str_starts_with($uri, '/api/')) {
    // Keep full URI including /api/ prefix so api/index.php can parse it
    require __DIR__ . '/api/index.php';
    return true;
}

// Serve static files (JS, CSS, images, etc.) directly
$publicFile = __DIR__ . '/public' . $uri;
if ($uri !== '/' && file_exists($publicFile) && !is_dir($publicFile)) {
    return false; // Let PHP built-in server handle static files
}

// Serve the SPA for all other routes
header('Content-Type: text/html');
readfile(__DIR__ . '/public/index.html');
