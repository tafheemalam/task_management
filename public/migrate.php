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
    'task_dependencies' => "CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id INT NOT NULL,
        depends_on_id INT NOT NULL,
        PRIMARY KEY (task_id, depends_on_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
    )",
    'packages_max_projects' => "ALTER TABLE packages ADD COLUMN IF NOT EXISTS max_projects INT NOT NULL DEFAULT 10",
    'time_logs' => "CREATE TABLE IF NOT EXISTS time_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        description VARCHAR(255),
        minutes INT NOT NULL DEFAULT 0,
        logged_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )",
    'tasks_estimated_minutes' => "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INT NULL DEFAULT NULL",
    'webhooks' => "CREATE TABLE IF NOT EXISTS webhooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        url VARCHAR(500) NOT NULL,
        secret VARCHAR(100) NOT NULL,
        events JSON NOT NULL DEFAULT ('[]'),
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_triggered_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )",

    // ── Step 3: Enterprise features ───────────────────────────────────────────

    // Feature 1: 2FA (TOTP)
    'users_totp_secret'  => "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64) NULL",
    'users_totp_enabled' => "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled TINYINT(1) NOT NULL DEFAULT 0",

    // Feature 2: White-Label Branding
    'company_settings' => "CREATE TABLE IF NOT EXISTS company_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL UNIQUE,
        logo_url VARCHAR(500) NULL,
        primary_color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
        secondary_color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
        company_display_name VARCHAR(100) NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )",

    // Feature 3: Public REST API Keys
    'api_keys' => "CREATE TABLE IF NOT EXISTS api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        key_hash VARCHAR(64) NOT NULL,
        key_prefix VARCHAR(12) NOT NULL,
        permissions JSON NULL,
        last_used_at TIMESTAMP NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )",

    // Feature 4: Custom Fields
    'custom_fields' => "CREATE TABLE IF NOT EXISTS custom_fields (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workflow_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        field_type ENUM('text','number','date','select','checkbox') NOT NULL DEFAULT 'text',
        options JSON NULL,
        is_required TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    )",
    'task_custom_values' => "CREATE TABLE IF NOT EXISTS task_custom_values (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        field_id INT NOT NULL,
        value TEXT NULL,
        UNIQUE KEY uq_task_field (task_id, field_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
    )",

    // ── Step 4: Productivity features ────────────────────────────────────────────

    // Feature 1: Sub-tasks / Checklists
    'checklist_subtasks' => "CREATE TABLE IF NOT EXISTS subtasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        is_done TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )",

    // Feature 3: Recurring Tasks
    'tasks_recurrence_rule' => "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_rule ENUM('none','daily','weekly','monthly') NOT NULL DEFAULT 'none'",
    'tasks_recurrence_end_date' => "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_date DATE NULL",

    // Feature 4: Task Templates
    'task_templates' => "CREATE TABLE IF NOT EXISTS task_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        workflow_id INT NULL,
        name VARCHAR(100) NOT NULL,
        title_template VARCHAR(255) NOT NULL,
        description TEXT NULL,
        priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
        estimated_minutes INT NULL,
        checklist JSON NULL,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )",

    // Feature 5: Project Templates
    'project_templates' => "CREATE TABLE IF NOT EXISTS project_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT NULL,
        stages JSON NOT NULL DEFAULT ('[]'),
        custom_fields JSON NOT NULL DEFAULT ('[]'),
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )",

    // ── Step 5: Performance indexes ───────────────────────────────────────────

    'idx_tasks_company'              => "CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id)",
    'idx_tasks_assignee'             => "CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)",
    'idx_tasks_workflow'             => "CREATE INDEX IF NOT EXISTS idx_tasks_workflow ON tasks(workflow_id)",
    'idx_tasks_stage'                => "CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage_id)",
    'idx_tasks_parent'               => "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)",
    'idx_notifications_user'         => "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)",
    'idx_activity_log_task'          => "CREATE INDEX IF NOT EXISTS idx_activity_log_task ON activity_log(task_id)",
    'idx_time_logs_task'             => "CREATE INDEX IF NOT EXISTS idx_time_logs_task ON time_logs(task_id)",
    'idx_task_tags_task'             => "CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id)",
    'idx_subtasks_task'              => "CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id)",
    'idx_task_custom_values_task'    => "CREATE INDEX IF NOT EXISTS idx_task_custom_values_task ON task_custom_values(task_id)",
    'idx_workflow_members_workflow'  => "CREATE INDEX IF NOT EXISTS idx_workflow_members_workflow ON workflow_members(workflow_id)",
    'idx_workflow_members_user'      => "CREATE INDEX IF NOT EXISTS idx_workflow_members_user ON workflow_members(user_id)",

    // ── Feature: Task Aging / Momentum Score ─────────────────────────────────
    'tasks_stage_updated_at' => "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMP NULL DEFAULT NULL",

    // ── Feature: Client View Portal ──────────────────────────────────────────
    'client_shares' => "CREATE TABLE IF NOT EXISTS client_shares (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL UNIQUE,
        workflow_id INT NOT NULL,
        created_by INT NOT NULL,
        label VARCHAR(100) NULL,
        expires_at TIMESTAMP NULL DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )",

    // ── Feature: Peer Kudos ───────────────────────────────────────────────────
    'kudos' => "CREATE TABLE IF NOT EXISTS kudos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        giver_id INT NOT NULL,
        receiver_id INT NOT NULL,
        message VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_task_giver (task_id, giver_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (giver_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
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
