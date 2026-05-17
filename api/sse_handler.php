<?php
// Called before JSON headers are set in index.php
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/middleware/Auth.php';

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');
header('Access-Control-Allow-Origin: *');

// Limit to 5 minutes per connection — client will reconnect automatically
set_time_limit(300);
ignore_user_abort(false);
if (ob_get_level()) ob_end_clean();

// On PHP built-in server, SSE blocks all other requests.
// Disable SSE when running via php -S to keep the app functional.
if (php_sapi_name() === 'cli-server') {
    echo "data: " . json_encode(['type' => 'disabled', 'message' => 'SSE disabled on built-in server']) . "\n\n";
    flush(); exit;
}

$token = $_GET['token'] ?? '';
$user  = $token ? Auth::verifyToken($token) : null;
if (!$user) {
    echo "data: " . json_encode(['type' => 'error', 'message' => 'Unauthorized']) . "\n\n";
    flush(); exit;
}

$uid = (int)$user['id'];
$db  = Database::getInstance();

// Get current max notification id as starting point
$stmt = $db->prepare('SELECT COALESCE(MAX(id),0) FROM notifications WHERE user_id=?');
$stmt->execute([$uid]);
$lastId = (int)$stmt->fetchColumn();

echo "data: " . json_encode(['type' => 'connected']) . "\n\n";
flush();

$tick = 0;
while (!connection_aborted()) {
    $stmt = $db->prepare(
        'SELECT n.*, t.title as task_title
         FROM notifications n LEFT JOIN tasks t ON n.task_id=t.id
         WHERE n.user_id=? AND n.id > ?
         ORDER BY n.id ASC LIMIT 10'
    );
    $stmt->execute([$uid, $lastId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        echo "data: " . json_encode(['type' => 'notification', 'data' => $row]) . "\n\n";
        flush();
        $lastId = max($lastId, (int)$row['id']);
    }

    if ($tick % 6 === 0) { echo ": heartbeat\n\n"; flush(); }
    $tick++;
    sleep(5);
}
