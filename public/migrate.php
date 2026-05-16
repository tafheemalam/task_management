<?php
// One-time migration script — visit http://localhost:8080/migrate.php
// Delete this file after running it.
require_once __DIR__ . '/../api/config/Database.php';

$db = Database::getInstance();
$results = [];

$tables = [
    'tags' => "CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
        UNIQUE KEY uq_tag (company_id, name),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )",
    'task_tags' => "CREATE TABLE IF NOT EXISTS task_tags (
        task_id INT NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (task_id, tag_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )",
    'activity_log' => "CREATE TABLE IF NOT EXISTS activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )",
    'notifications' => "CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        task_id INT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    )",
];

foreach ($tables as $name => $sql) {
    try {
        $db->exec($sql);
        $results[] = ['table' => $name, 'ok' => true, 'msg' => 'Created / already exists'];
    } catch (PDOException $e) {
        $results[] = ['table' => $name, 'ok' => false, 'msg' => $e->getMessage()];
    }
}

$allOk = array_reduce($results, fn($c, $r) => $c && $r['ok'], true);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>TaskFlow Migration</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; background: #f8fafc; }
    h1 { font-size: 1.4rem; font-weight: 700; color: #1e293b; margin-bottom: 24px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 10px; margin-bottom: 8px; background: white; border: 1px solid #e2e8f0; }
    .icon { font-size: 1.2rem; }
    .table-name { font-weight: 600; color: #334155; flex: 1; }
    .msg { font-size: 0.8rem; color: #64748b; }
    .ok { border-left: 4px solid #22c55e; }
    .err { border-left: 4px solid #ef4444; }
    .banner { padding: 16px 20px; border-radius: 12px; margin-top: 24px; font-weight: 600; font-size: 0.95rem; }
    .banner.success { background: #dcfce7; color: #166534; }
    .banner.fail { background: #fee2e2; color: #991b1b; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>🛠 TaskFlow — Database Migration</h1>

  <?php foreach ($results as $r): ?>
    <div class="row <?= $r['ok'] ? 'ok' : 'err' ?>">
      <span class="icon"><?= $r['ok'] ? '✅' : '❌' ?></span>
      <span class="table-name"><?= htmlspecialchars($r['table']) ?></span>
      <span class="msg"><?= htmlspecialchars($r['msg']) ?></span>
    </div>
  <?php endforeach; ?>

  <?php if ($allOk): ?>
    <div class="banner success">
      All tables created successfully! <a href="/">Go to app →</a><br>
      <small style="font-weight:400">You can now delete <code>public/migrate.php</code></small>
    </div>
  <?php else: ?>
    <div class="banner fail">Some tables failed — check errors above.</div>
  <?php endif; ?>
</body>
</html>
