<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class ManagerController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->authUser = Auth::requireAuth('manager');
    }

    private function companyId(): int {
        return (int)$this->authUser['company_id'];
    }

    public function stats(): void {
        $cid = $this->companyId();
        $users = $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee'")->execute([$cid]) ? $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee'")->execute([$cid]) : 0;
        // Redo properly
        $s1 = $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee'"); $s1->execute([$cid]); $totalUsers = $s1->fetchColumn();
        $s2 = $this->db->prepare("SELECT COUNT(*) FROM tasks WHERE company_id=? AND parent_task_id IS NULL AND is_active=1"); $s2->execute([$cid]); $totalTasks = $s2->fetchColumn();
        $s3 = $this->db->prepare("SELECT COUNT(*) FROM workflows WHERE company_id=?"); $s3->execute([$cid]); $totalWorkflows = $s3->fetchColumn();
        $s4 = $this->db->prepare("SELECT COUNT(*) FROM tasks WHERE company_id=? AND parent_task_id IS NULL AND is_active=1 AND due_date < CURDATE()"); $s4->execute([$cid]); $overdueTasks = $s4->fetchColumn();

        echo json_encode([
            'total_users' => (int)$totalUsers,
            'total_tasks' => (int)$totalTasks,
            'total_workflows' => (int)$totalWorkflows,
            'overdue_tasks' => (int)$overdueTasks,
        ]);
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    public function listUsers(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare("SELECT id, name, email, role, can_create_tasks, is_active, created_at FROM users WHERE company_id=? AND role='employee' ORDER BY created_at DESC");
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }

    public function createUser(): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name']) || empty($b['email']) || empty($b['password'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Name, email and password are required']);
            return;
        }
        $exists = $this->db->prepare('SELECT id FROM users WHERE email=?');
        $exists->execute([$b['email']]);
        if ($exists->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Email already in use']);
            return;
        }
        $hash = password_hash($b['password'], PASSWORD_BCRYPT);
        $stmt = $this->db->prepare('INSERT INTO users (name, email, password, role, company_id, can_create_tasks) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$b['name'], $b['email'], $hash, 'employee', $cid, $b['can_create_tasks'] ?? 0]);
        $id = $this->db->lastInsertId();
        $row = $this->db->prepare('SELECT id, name, email, role, can_create_tasks, is_active, created_at FROM users WHERE id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    public function updateUser(int $id): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        $stmt = $this->db->prepare("SELECT id FROM users WHERE id=? AND company_id=? AND role='employee'");
        $stmt->execute([$id, $cid]);
        if (!$stmt->fetch()) { http_response_code(404); echo json_encode(['error' => 'User not found']); return; }

        $fields = ['name=?', 'email=?', 'can_create_tasks=?', 'is_active=?'];
        $values = [$b['name'], $b['email'], $b['can_create_tasks'] ?? 0, $b['is_active'] ?? 1];
        if (!empty($b['password'])) {
            $fields[] = 'password=?';
            $values[] = password_hash($b['password'], PASSWORD_BCRYPT);
        }
        $values[] = $id;
        $this->db->prepare('UPDATE users SET ' . implode(',', $fields) . ' WHERE id=?')->execute($values);
        $row = $this->db->prepare('SELECT id, name, email, role, can_create_tasks, is_active, created_at FROM users WHERE id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    public function toggleUserStatus(int $id): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare("SELECT id, is_active FROM users WHERE id=? AND company_id=? AND role='employee'");
        $stmt->execute([$id, $cid]);
        $user = $stmt->fetch();
        if (!$user) { http_response_code(404); echo json_encode(['error' => 'User not found']); return; }
        $new = $user['is_active'] ? 0 : 1;
        $this->db->prepare('UPDATE users SET is_active=? WHERE id=?')->execute([$new, $id]);
        echo json_encode(['is_active' => $new]);
    }

    public function toggleTaskCreation(int $id): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare("SELECT id, can_create_tasks FROM users WHERE id=? AND company_id=? AND role='employee'");
        $stmt->execute([$id, $cid]);
        $user = $stmt->fetch();
        if (!$user) { http_response_code(404); echo json_encode(['error' => 'User not found']); return; }
        $new = $user['can_create_tasks'] ? 0 : 1;
        $this->db->prepare('UPDATE users SET can_create_tasks=? WHERE id=?')->execute([$new, $id]);
        echo json_encode(['can_create_tasks' => $new]);
    }

    // ── Workflows ─────────────────────────────────────────────────────────────

    public function listWorkflows(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT w.*, (SELECT COUNT(*) FROM workflow_stages WHERE workflow_id=w.id) as stage_count FROM workflows w WHERE w.company_id=? ORDER BY w.created_at DESC');
        $stmt->execute([$cid]);
        $workflows = $stmt->fetchAll();
        foreach ($workflows as &$wf) {
            $stages = $this->db->prepare('SELECT * FROM workflow_stages WHERE workflow_id=? ORDER BY order_index ASC');
            $stages->execute([$wf['id']]);
            $wf['stages'] = $stages->fetchAll();
        }
        echo json_encode($workflows);
    }

    public function createWorkflow(): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name'])) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $stmt = $this->db->prepare('INSERT INTO workflows (company_id, name) VALUES (?,?)');
        $stmt->execute([$cid, $b['name']]);
        $wfId = $this->db->lastInsertId();

        $defaultStages = [
            ['name' => 'To Do', 'color' => '#64748b', 'order_index' => 0],
            ['name' => 'In Progress', 'color' => '#3b82f6', 'order_index' => 1],
            ['name' => 'QA', 'color' => '#a855f7', 'order_index' => 2],
            ['name' => 'Done', 'color' => '#22c55e', 'order_index' => 3],
            ['name' => 'Closed', 'color' => '#6b7280', 'order_index' => 4],
        ];
        $stages = !empty($b['stages']) ? $b['stages'] : $defaultStages;
        $stmtS = $this->db->prepare('INSERT INTO workflow_stages (workflow_id, name, color, order_index) VALUES (?,?,?,?)');
        foreach ($stages as $i => $s) {
            $stmtS->execute([$wfId, $s['name'], $s['color'] ?? '#6366f1', $s['order_index'] ?? $i]);
        }

        $wf = $this->db->prepare('SELECT * FROM workflows WHERE id=?');
        $wf->execute([$wfId]);
        $workflow = $wf->fetch();
        $wfStages = $this->db->prepare('SELECT * FROM workflow_stages WHERE workflow_id=? ORDER BY order_index ASC');
        $wfStages->execute([$wfId]);
        $workflow['stages'] = $wfStages->fetchAll();
        echo json_encode($workflow);
    }

    public function updateWorkflow(int $id): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$id, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Workflow not found']); return; }
        $this->db->prepare('UPDATE workflows SET name=?, is_active=? WHERE id=?')->execute([$b['name'], $b['is_active'] ?? 1, $id]);

        if (!empty($b['stages'])) {
            $this->db->prepare('DELETE FROM workflow_stages WHERE workflow_id=?')->execute([$id]);
            $stmtS = $this->db->prepare('INSERT INTO workflow_stages (workflow_id, name, color, order_index) VALUES (?,?,?,?)');
            foreach ($b['stages'] as $i => $s) {
                $stmtS->execute([$id, $s['name'], $s['color'] ?? '#6366f1', $s['order_index'] ?? $i]);
            }
        }

        $wf = $this->db->prepare('SELECT * FROM workflows WHERE id=?');
        $wf->execute([$id]);
        $workflow = $wf->fetch();
        $wfStages = $this->db->prepare('SELECT * FROM workflow_stages WHERE workflow_id=? ORDER BY order_index ASC');
        $wfStages->execute([$id]);
        $workflow['stages'] = $wfStages->fetchAll();
        echo json_encode($workflow);
    }

    public function deleteWorkflow(int $id): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$id, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $this->db->prepare('DELETE FROM workflows WHERE id=?')->execute([$id]);
        echo json_encode(['success' => true]);
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────

    public function listTasks(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT t.*, u.name as assignee_name, c.name as creator_name, ws.name as stage_name, ws.color as stage_color, w.name as workflow_name, (SELECT COUNT(*) FROM tasks WHERE parent_task_id=t.id AND is_active=1) as subtask_count FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN users c ON t.creator_id=c.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id LEFT JOIN workflows w ON t.workflow_id=w.id WHERE t.company_id=? AND t.parent_task_id IS NULL AND t.is_active=1 ORDER BY t.created_at DESC');
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }

    public function getTask(int $id): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT t.*, u.name as assignee_name, cr.name as creator_name, ws.name as stage_name, ws.color as stage_color, w.name as workflow_name FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN users cr ON t.creator_id=cr.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id LEFT JOIN workflows w ON t.workflow_id=w.id WHERE t.id=? AND t.company_id=?');
        $stmt->execute([$id, $cid]);
        $task = $stmt->fetch();
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        // Subtasks
        $sub = $this->db->prepare('SELECT t.*, u.name as assignee_name, ws.name as stage_name, ws.color as stage_color FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id WHERE t.parent_task_id=? AND t.is_active=1 ORDER BY t.created_at ASC');
        $sub->execute([$id]);
        $task['subtasks'] = $sub->fetchAll();

        // Comments
        $com = $this->db->prepare('SELECT c.*, u.name as user_name FROM comments c JOIN users u ON c.user_id=u.id WHERE c.task_id=? ORDER BY c.created_at ASC');
        $com->execute([$id]);
        $task['comments'] = $com->fetchAll();

        // Workflow stages
        if ($task['workflow_id']) {
            $stages = $this->db->prepare('SELECT * FROM workflow_stages WHERE workflow_id=? ORDER BY order_index ASC');
            $stages->execute([$task['workflow_id']]);
            $task['workflow_stages'] = $stages->fetchAll();
        }

        $att = $this->db->prepare('SELECT a.*, u.name as uploader_name FROM task_attachments a JOIN users u ON a.uploaded_by=u.id WHERE a.task_id=? ORDER BY a.created_at ASC');
        $att->execute([$id]);
        $task['attachments'] = $att->fetchAll();

        echo json_encode($task);
    }

    public function uploadAttachment(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        if (empty($_FILES['file'])) { http_response_code(400); echo json_encode(['error' => 'No file uploaded']); return; }

        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) { http_response_code(400); echo json_encode(['error' => 'Upload error']); return; }
        if ($file['size'] > 10 * 1024 * 1024) { http_response_code(400); echo json_encode(['error' => 'File exceeds 10 MB limit']); return; }

        $allowedMime = ['image/jpeg','image/png','image/gif','image/webp','application/pdf',
            'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain','application/zip','application/x-zip-compressed'];
        if (!in_array($file['type'], $allowedMime)) { http_response_code(400); echo json_encode(['error' => 'File type not allowed']); return; }

        $ext     = pathinfo($file['name'], PATHINFO_EXTENSION);
        $stored  = bin2hex(random_bytes(16)) . ($ext ? '.' . strtolower($ext) : '');
        $destDir = __DIR__ . '/../../public/uploads/attachments/';
        if (!is_dir($destDir)) mkdir($destDir, 0755, true);

        if (!move_uploaded_file($file['tmp_name'], $destDir . $stored)) {
            http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
        }

        $uid  = $this->authUser['id'];
        $stmt = $this->db->prepare('INSERT INTO task_attachments (task_id, uploaded_by, filename, original_name, mime_type, file_size) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$taskId, $uid, $stored, $file['name'], $file['type'], $file['size']]);
        $newId = $this->db->lastInsertId();

        $row = $this->db->prepare('SELECT a.*, u.name as uploader_name FROM task_attachments a JOIN users u ON a.uploaded_by=u.id WHERE a.id=?');
        $row->execute([$newId]);
        echo json_encode($row->fetch());
    }

    public function deleteAttachment(int $taskId, int $attachId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        $att = $this->db->prepare('SELECT * FROM task_attachments WHERE id=? AND task_id=?');
        $att->execute([$attachId, $taskId]);
        $attachment = $att->fetch();
        if (!$attachment) { http_response_code(404); echo json_encode(['error' => 'Attachment not found']); return; }

        $file = __DIR__ . '/../../public/uploads/attachments/' . $attachment['filename'];
        if (file_exists($file)) unlink($file);

        $this->db->prepare('DELETE FROM task_attachments WHERE id=?')->execute([$attachId]);
        echo json_encode(['success' => true]);
    }

    private function validateTaskFields(array $b, int $cid): ?string {
        // Workflow must belong to this company
        $wf = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $wf->execute([$b['workflow_id'], $cid]);
        if (!$wf->fetch()) return 'This project does not belong to your company';

        // Assignee (if given) must be a member of this company
        if (!empty($b['assignee_id'])) {
            $u = $this->db->prepare('SELECT id FROM users WHERE id=? AND company_id=?');
            $u->execute([$b['assignee_id'], $cid]);
            if (!$u->fetch()) return 'Assignee does not belong to your company';
        }

        // Stage (if given) must belong to the selected workflow
        if (!empty($b['stage_id'])) {
            $s = $this->db->prepare('SELECT id FROM workflow_stages WHERE id=? AND workflow_id=?');
            $s->execute([$b['stage_id'], $b['workflow_id']]);
            if (!$s->fetch()) return 'Selected stage does not belong to this project';
        }

        // Parent task (if given) must belong to this company
        if (!empty($b['parent_task_id'])) {
            $pt = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
            $pt->execute([$b['parent_task_id'], $cid]);
            if (!$pt->fetch()) return 'Parent task does not belong to your company';
        }

        return null;
    }

    public function createTask(): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['title'])) { http_response_code(400); echo json_encode(['error' => 'Title required']); return; }
        if (empty($b['workflow_id'])) { http_response_code(400); echo json_encode(['error' => 'Project (workflow) is required']); return; }
        $err = $this->validateTaskFields($b, $cid);
        if ($err) { http_response_code(400); echo json_encode(['error' => $err]); return; }
        $stmt = $this->db->prepare('INSERT INTO tasks (company_id, title, description, priority, stage_id, workflow_id, assignee_id, creator_id, parent_task_id, start_date, due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$cid, $b['title'], $b['description'] ?? null, $b['priority'] ?? 'medium', $b['stage_id'] ?? null, $b['workflow_id'], $b['assignee_id'] ?? null, $this->authUser['id'], $b['parent_task_id'] ?? null, $b['start_date'] ?? null, $b['due_date'] ?? null]);
        $id = $this->db->lastInsertId();
        $this->getTask($id);
    }

    public function updateTask(int $id): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $check->execute([$id, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        if (empty($b['workflow_id'])) { http_response_code(400); echo json_encode(['error' => 'Project (workflow) is required']); return; }
        $err = $this->validateTaskFields($b, $cid);
        if ($err) { http_response_code(400); echo json_encode(['error' => $err]); return; }
        $this->db->prepare('UPDATE tasks SET title=?, description=?, priority=?, stage_id=?, workflow_id=?, assignee_id=?, start_date=?, due_date=? WHERE id=?')->execute([$b['title'], $b['description'] ?? null, $b['priority'] ?? 'medium', $b['stage_id'] ?? null, $b['workflow_id'], $b['assignee_id'] ?? null, $b['start_date'] ?? null, $b['due_date'] ?? null, $id]);
        $this->getTask($id);
    }

    public function deleteTask(int $id): void {
        $cid = $this->companyId();
        $this->db->prepare('UPDATE tasks SET is_active=0 WHERE id=? AND company_id=?')->execute([$id, $cid]);
        echo json_encode(['success' => true]);
    }

    public function addComment(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['content'])) { http_response_code(400); echo json_encode(['error' => 'Content required']); return; }
        $stmt = $this->db->prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?,?,?)');
        $stmt->execute([$taskId, $this->authUser['id'], $b['content']]);
        $id = $this->db->lastInsertId();
        $row = $this->db->prepare('SELECT c.*, u.name as user_name FROM comments c JOIN users u ON c.user_id=u.id WHERE c.id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    public function managerProjectStats(): void {
        $cid = $this->companyId();

        $stages = $this->db->prepare(
            'SELECT COALESCE(ws.name,\'Unassigned\') AS stage_name, COUNT(t.id) AS count
             FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE t.company_id=? AND t.is_active=1 AND t.parent_task_id IS NULL
             GROUP BY COALESCE(ws.name,\'Unassigned\')
             ORDER BY count DESC'
        );
        $stages->execute([$cid]);

        $projects = $this->db->prepare(
            'SELECT w.id AS workflow_id, w.name AS workflow_name,
               COUNT(t.id)                                                                       AS total,
               SUM(CASE WHEN ws.name IN (\'Done\',\'Closed\') THEN 1 ELSE 0 END)                AS done,
               SUM(CASE WHEN t.due_date < CURDATE()
                        AND (ws.name IS NULL OR ws.name NOT IN (\'Done\',\'Closed\'))
                   THEN 1 ELSE 0 END)                                                            AS overdue
             FROM workflows w
             LEFT JOIN tasks t            ON t.workflow_id = w.id AND t.is_active=1 AND t.parent_task_id IS NULL
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id=?
             GROUP BY w.id, w.name
             ORDER BY total DESC'
        );
        $projects->execute([$cid]);

        $priorities = $this->db->prepare(
            'SELECT priority, COUNT(*) AS count
             FROM tasks WHERE company_id=? AND is_active=1 AND parent_task_id IS NULL
             GROUP BY priority
             ORDER BY FIELD(priority,\'high\',\'medium\',\'low\')'
        );
        $priorities->execute([$cid]);

        echo json_encode([
            'by_stage'    => $stages->fetchAll(),
            'by_project'  => $projects->fetchAll(),
            'by_priority' => $priorities->fetchAll(),
        ]);
    }

    public function listCompanyUsers(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare("SELECT id, name, email, can_create_tasks FROM users WHERE company_id=? AND is_active=1 ORDER BY name ASC");
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }
}
