<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/NotificationController.php';
require_once __DIR__ . '/../services/EmailService.php';
require_once __DIR__ . '/WebhookController.php';

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

    private function getTaskLock(int $taskId): array {
        $stmt = $this->db->prepare(
            'SELECT ws.name FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE t.id = ?'
        );
        $stmt->execute([$taskId]);
        $name     = strtolower((string)($stmt->fetchColumn() ?: ''));
        $isClosed = str_contains($name, 'closed');
        $isDone   = !$isClosed && (str_contains($name, 'done') || str_contains($name, 'complet'));
        return ['isDone' => $isDone, 'isClosed' => $isClosed];
    }

    private function checkUsageLimit(string $resource): ?string {
        // Note: ManagerController is only reachable by role='manager'.
        // Admins use AdminController which has no limits.
        $cid = $this->companyId();
        $pkg = $this->db->prepare(
            'SELECT p.max_users, p.max_projects
             FROM companies c
             LEFT JOIN packages p ON c.package_id = p.id
             WHERE c.id = ?'
        );
        $pkg->execute([$cid]);
        $limits = $pkg->fetch();
        if (!$limits || !$limits['max_users']) return null; // No package or unlimited

        if ($resource === 'users') {
            $cnt = $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee' AND is_active=1");
            $cnt->execute([$cid]);
            $current = (int)$cnt->fetchColumn();
            $max = (int)$limits['max_users'];
            if ($max > 0 && $current >= $max) {
                return "Team member limit reached ({$current}/{$max}). Upgrade your plan to add more members.";
            }
        }

        if ($resource === 'projects') {
            $cnt = $this->db->prepare("SELECT COUNT(*) FROM workflows WHERE company_id=? AND is_active=1");
            $cnt->execute([$cid]);
            $current = (int)$cnt->fetchColumn();
            $max = (int)($limits['max_projects'] ?? 0);
            if ($max > 0 && $current >= $max) {
                return "Project limit reached ({$current}/{$max}). Upgrade your plan to create more projects.";
            }
        }
        return null;
    }

    public function search(): void {
        $cid = $this->companyId();
        $q   = trim($_GET['q'] ?? '');
        if (strlen($q) < 2) { echo json_encode(['tasks'=>[],'projects'=>[],'users'=>[]]); return; }
        $like = '%'.$q.'%';

        $tasks = $this->db->prepare(
            'SELECT t.id, t.title, t.priority, ws.name as stage_name, ws.color as stage_color,
                    w.name as workflow_name, u.name as assignee_name
             FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id=ws.id
             LEFT JOIN workflows w ON t.workflow_id=w.id
             LEFT JOIN users u ON t.assignee_id=u.id
             WHERE t.company_id=? AND t.is_active=1 AND t.parent_task_id IS NULL
               AND (t.title LIKE ? OR t.description LIKE ?)
             ORDER BY t.updated_at DESC LIMIT 8'
        );
        $tasks->execute([$cid, $like, $like]);

        $projects = $this->db->prepare(
            'SELECT id, name FROM workflows WHERE company_id=? AND name LIKE ? AND is_active=1 LIMIT 5'
        );
        $projects->execute([$cid, $like]);

        $users = $this->db->prepare(
            "SELECT id, name, email FROM users WHERE company_id=? AND role='employee' AND name LIKE ? AND is_active=1 LIMIT 5"
        );
        $users->execute([$cid, $like]);

        echo json_encode([
            'tasks'    => $tasks->fetchAll(),
            'projects' => $projects->fetchAll(),
            'users'    => $users->fetchAll(),
        ]);
    }

    public function stats(): void {
        $cid = $this->companyId();
        $users = $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee'")->execute([$cid]) ? $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee'")->execute([$cid]) : 0;
        // Redo properly
        $s1 = $this->db->prepare("SELECT COUNT(*) FROM users WHERE company_id=? AND role='employee'"); $s1->execute([$cid]); $totalUsers = $s1->fetchColumn();
        $s2 = $this->db->prepare("SELECT COUNT(*) FROM tasks WHERE company_id=? AND parent_task_id IS NULL AND is_active=1"); $s2->execute([$cid]); $totalTasks = $s2->fetchColumn();
        $s3 = $this->db->prepare("SELECT COUNT(*) FROM workflows WHERE company_id=?"); $s3->execute([$cid]); $totalWorkflows = $s3->fetchColumn();
        $s4 = $this->db->prepare("SELECT COUNT(*) FROM tasks WHERE company_id=? AND parent_task_id IS NULL AND is_active=1 AND due_date < CURDATE()"); $s4->execute([$cid]); $overdueTasks = $s4->fetchColumn();

        // Get plan limits
        $planStmt = $this->db->prepare('SELECT p.max_users, p.max_projects FROM companies c LEFT JOIN packages p ON c.package_id=p.id WHERE c.id=?');
        $planStmt->execute([$cid]);
        $plan = $planStmt->fetch();

        echo json_encode([
            'total_users' => (int)$totalUsers,
            'total_tasks' => (int)$totalTasks,
            'total_workflows' => (int)$totalWorkflows,
            'overdue_tasks' => (int)$overdueTasks,
            'plan_max_users'    => (int)($plan['max_users']    ?? 0),
            'plan_max_projects' => (int)($plan['max_projects'] ?? 0),
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
        $limitErr = $this->checkUsageLimit('users');
        if ($limitErr) { http_response_code(403); echo json_encode(['error' => $limitErr]); return; }
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

        // Single query for all workflows
        $stmt = $this->db->prepare(
            'SELECT w.*, (SELECT COUNT(*) FROM workflow_stages WHERE workflow_id=w.id) as stage_count
             FROM workflows w WHERE w.company_id=? ORDER BY w.created_at DESC'
        );
        $stmt->execute([$cid]);
        $workflows = $stmt->fetchAll();

        if (empty($workflows)) { echo json_encode([]); return; }

        $wfIds = array_column($workflows, 'id');
        $placeholders = implode(',', array_fill(0, count($wfIds), '?'));

        // Bulk fetch all stages for all workflows in one query
        $stagesStmt = $this->db->prepare(
            "SELECT * FROM workflow_stages WHERE workflow_id IN ($placeholders) ORDER BY order_index ASC"
        );
        $stagesStmt->execute($wfIds);
        $allStages = $stagesStmt->fetchAll();

        // Bulk fetch all members for all workflows in one query
        $membersStmt = $this->db->prepare(
            "SELECT wm.workflow_id, u.id, u.name, u.email
             FROM workflow_members wm JOIN users u ON wm.user_id=u.id
             WHERE wm.workflow_id IN ($placeholders) ORDER BY u.name ASC"
        );
        $membersStmt->execute($wfIds);
        $allMembers = $membersStmt->fetchAll();

        // Group stages by workflow_id
        $stagesByWf = [];
        foreach ($allStages as $s) {
            $stagesByWf[$s['workflow_id']][] = $s;
        }

        // Group members by workflow_id
        $membersByWf = [];
        foreach ($allMembers as $m) {
            $membersByWf[$m['workflow_id']][] = $m;
        }

        // Attach to workflows
        foreach ($workflows as &$wf) {
            $wf['stages']  = $stagesByWf[$wf['id']]  ?? [];
            $wf['members'] = $membersByWf[$wf['id']] ?? [];
        }

        echo json_encode($workflows);
    }

    public function createWorkflow(): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name'])) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $limitErr = $this->checkUsageLimit('projects');
        if ($limitErr) { http_response_code(403); echo json_encode(['error' => $limitErr]); return; }
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
        $cid     = $this->companyId();
        $page    = max(1, (int)($_GET['page']    ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 50)));
        $offset  = ($page - 1) * $perPage;

        // Build WHERE clause from optional filters
        $where  = ['t.company_id=?', 't.parent_task_id IS NULL', 't.is_active=1'];
        $params = [$cid];

        if (!empty($_GET['workflow_id'])) {
            $where[]  = 't.workflow_id=?';
            $params[] = (int)$_GET['workflow_id'];
        }
        if (!empty($_GET['assignee_id'])) {
            $where[]  = 't.assignee_id=?';
            $params[] = (int)$_GET['assignee_id'];
        }
        if (!empty($_GET['priority'])) {
            $where[]  = 't.priority=?';
            $params[] = $_GET['priority'];
        }
        if (!empty($_GET['stage_id'])) {
            $where[]  = 't.stage_id=?';
            $params[] = (int)$_GET['stage_id'];
        }
        if (!empty($_GET['search'])) {
            $where[]  = 't.title LIKE ?';
            $params[] = '%' . $_GET['search'] . '%';
        }

        $whereStr = implode(' AND ', $where);

        // Total count
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM tasks t WHERE $whereStr");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Paginated results
        $sortInput = $_GET['sort'] ?? '';
        if ($sortInput === 'staleness') {
            $dirIn   = ($_GET['dir'] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
            $orderBy = "COALESCE(t.stage_updated_at, t.created_at) $dirIn";
        } else {
            $sort    = in_array($sortInput, ['title','priority','due_date','created_at']) ? $sortInput : 'created_at';
            $dirIn   = ($_GET['dir'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
            $orderBy = "t.$sort $dirIn";
        }
        $dataParams = array_merge($params, [$perPage, $offset]);

        $stmt = $this->db->prepare(
            "SELECT t.*, u.name as assignee_name, c.name as creator_name,
                    ws.name as stage_name, ws.color as stage_color, w.name as workflow_name,
                    (SELECT COUNT(*) FROM tasks WHERE parent_task_id=t.id AND is_active=1) as subtask_count,
                    DATEDIFF(NOW(), COALESCE(t.stage_updated_at, t.created_at)) as days_since_moved
             FROM tasks t
             LEFT JOIN users u  ON t.assignee_id=u.id
             LEFT JOIN users c  ON t.creator_id=c.id
             LEFT JOIN workflow_stages ws ON t.stage_id=ws.id
             LEFT JOIN workflows w ON t.workflow_id=w.id
             WHERE $whereStr
             ORDER BY $orderBy
             LIMIT ? OFFSET ?"
        );
        $stmt->execute($dataParams);
        $tasks = $stmt->fetchAll();

        echo json_encode([
            'data' => $tasks,
            'meta' => [
                'page'     => $page,
                'per_page' => $perPage,
                'total'    => $total,
                'pages'    => (int)ceil($total / $perPage),
            ],
        ]);
    }

    public function getTask(int $id): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT t.*, u.name as assignee_name, cr.name as creator_name, ws.name as stage_name, ws.color as stage_color, w.name as workflow_name, DATEDIFF(NOW(), COALESCE(t.stage_updated_at, t.created_at)) as days_since_moved FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN users cr ON t.creator_id=cr.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id LEFT JOIN workflows w ON t.workflow_id=w.id WHERE t.id=? AND t.company_id=?');
        $stmt->execute([$id, $cid]);
        $task = $stmt->fetch();
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        // Subtasks (child tasks)
        $sub = $this->db->prepare('SELECT t.*, u.name as assignee_name, ws.name as stage_name, ws.color as stage_color FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id WHERE t.parent_task_id=? AND t.is_active=1 ORDER BY t.created_at ASC');
        $sub->execute([$id]);
        $task['subtasks'] = $sub->fetchAll();

        // Checklist subtasks
        $cl = $this->db->prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY sort_order, id');
        $cl->execute([$id]);
        $task['checklist'] = $cl->fetchAll(PDO::FETCH_ASSOC);

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

        $tags = $this->db->prepare('SELECT t.* FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id=?');
        $tags->execute([$id]);
        $task['tags'] = $tags->fetchAll();

        $deps = $this->db->prepare(
            'SELECT t.id, t.title, ws.name as stage_name, ws.color as stage_color
             FROM task_dependencies td
             JOIN tasks t ON td.depends_on_id = t.id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE td.task_id = ?'
        );
        $deps->execute([$id]);
        $task['dependencies'] = $deps->fetchAll();

        // Custom field values
        if ($task['workflow_id']) {
            $cvStmt = $this->db->prepare(
                'SELECT cf.id AS field_id, cf.name, cf.field_type, cf.options, cf.is_required,
                        tcv.value
                 FROM custom_fields cf
                 LEFT JOIN task_custom_values tcv ON tcv.field_id = cf.id AND tcv.task_id = ?
                 WHERE cf.workflow_id = ?
                 ORDER BY cf.sort_order ASC, cf.id ASC'
            );
            $cvStmt->execute([$id, $task['workflow_id']]);
            $customValues = $cvStmt->fetchAll();
            foreach ($customValues as &$cv) {
                $cv['options']     = $cv['options'] ? json_decode($cv['options'], true) : [];
                $cv['is_required'] = (bool)$cv['is_required'];
            }
            $task['custom_values'] = $customValues;
        } else {
            $task['custom_values'] = [];
        }

        echo json_encode($task);
    }

    public function uploadAttachment(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $lock = $this->getTaskLock($taskId);
        if ($lock['isClosed'] || $lock['isDone']) {
            http_response_code(403);
            echo json_encode(['error' => $lock['isClosed'] ? 'Task is closed and cannot be changed.' : 'Comments are disabled while task is in Done stage.']);
            return;
        }

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
        $lock = $this->getTaskLock($taskId);
        if ($lock['isClosed'] || $lock['isDone']) {
            http_response_code(403);
            echo json_encode(['error' => $lock['isClosed'] ? 'Task is closed and cannot be changed.' : 'Comments are disabled while task is in Done stage.']);
            return;
        }

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
        $stageId    = !empty($b['stage_id'])       ? (int)$b['stage_id']       : null;
        $assigneeId = !empty($b['assignee_id'])    ? (int)$b['assignee_id']    : null;
        $parentId   = !empty($b['parent_task_id']) ? (int)$b['parent_task_id'] : null;
        $recurrenceRule = $b['recurrence_rule'] ?? 'none';
        $recurrenceEndDate = !empty($b['recurrence_end_date']) ? $b['recurrence_end_date'] : null;
        $stmt = $this->db->prepare('INSERT INTO tasks (company_id, title, description, priority, stage_id, workflow_id, assignee_id, creator_id, parent_task_id, start_date, due_date, recurrence_rule, recurrence_end_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$cid, $b['title'], $b['description'] ?? null, $b['priority'] ?? 'medium', $stageId, $b['workflow_id'], $assigneeId, $this->authUser['id'], $parentId, $b['start_date'] ?? null, $b['due_date'] ?? null, $recurrenceRule, $recurrenceEndDate]);
        $id = (int)$this->db->lastInsertId();
        $this->logActivity($id, 'Task created', $b['title']);
        if (!empty($assigneeId) && $assigneeId != $this->authUser['id']) {
            NotificationController::create($this->db, $assigneeId, 'task_assigned',
                "You have been assigned a task: " . $b['title'], $id);
            // Email the assignee
            $aUser = $this->db->prepare('SELECT email, name FROM users WHERE id=?');
            $aUser->execute([$assigneeId]);
            if ($aRow = $aUser->fetch()) {
                $wfRow = $this->db->prepare('SELECT name FROM workflows WHERE id=?');
                $wfRow->execute([$b['workflow_id']]);
                $wfName = $wfRow->fetchColumn() ?: '';
                EmailService::taskAssigned($aRow['email'], $aRow['name'], $b['title'], $wfName, $this->authUser['name']);
            }
        }
        WebhookController::fire($this->db, $cid, 'task.created', ['task_id'=>$id,'title'=>$b['title'],'assignee_id'=>$assigneeId]);
        $this->getTask($id);
    }

    public function updateTask(int $id): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $check->execute([$id, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $lock = $this->getTaskLock($id);
        if ($lock['isClosed']) {
            http_response_code(403);
            echo json_encode(['error' => 'Task is closed and cannot be changed.']);
            return;
        }
        if (empty($b['workflow_id'])) { http_response_code(400); echo json_encode(['error' => 'Project (workflow) is required']); return; }
        $err = $this->validateTaskFields($b, $cid);
        if ($err) { http_response_code(400); echo json_encode(['error' => $err]); return; }
        // Fetch old row before update to detect changes
        $oldTask = $this->db->prepare('SELECT assignee_id, stage_id, title FROM tasks WHERE id=?');
        $oldTask->execute([$id]);
        $oldRow = $oldTask->fetch();
        $oldAssigneeId = $oldRow ? (int)$oldRow['assignee_id'] : null;
        $oldStageId    = $oldRow ? (int)$oldRow['stage_id']    : null;

        $recurrenceRule = $b['recurrence_rule'] ?? 'none';
        $recurrenceEndDate = !empty($b['recurrence_end_date']) ? $b['recurrence_end_date'] : null;
        $this->db->prepare('UPDATE tasks SET title=?, description=?, priority=?, stage_id=?, workflow_id=?, assignee_id=?, start_date=?, due_date=?, recurrence_rule=?, recurrence_end_date=? WHERE id=?')->execute([$b['title'], $b['description'] ?? null, $b['priority'] ?? 'medium', $b['stage_id'] ?? null, $b['workflow_id'], $b['assignee_id'] ?? null, $b['start_date'] ?? null, $b['due_date'] ?? null, $recurrenceRule, $recurrenceEndDate, $id]);
        // Track stage moves for task aging feature
        $newStageId = !empty($b['stage_id']) ? (int)$b['stage_id'] : null;
        if ($newStageId !== $oldStageId) {
            $this->db->prepare('UPDATE tasks SET stage_updated_at = NOW() WHERE id=?')->execute([$id]);
        }
        $this->logActivity($id, 'Task updated');

        // Check if new stage is a done stage and task has recurrence
        if (!empty($b['stage_id'])) {
            $stageStmt = $this->db->prepare('SELECT name FROM workflow_stages WHERE id=?');
            $stageStmt->execute([$b['stage_id']]);
            $stageName = strtolower($stageStmt->fetchColumn() ?? '');
            $isDoneStage = str_contains($stageName, 'done') || str_contains($stageName, 'complet') || str_contains($stageName, 'closed') || str_contains($stageName, 'finish');
            if ($isDoneStage) {
                $taskStmt = $this->db->prepare('SELECT * FROM tasks WHERE id=?');
                $taskStmt->execute([$id]);
                $fullTask = $taskStmt->fetch(PDO::FETCH_ASSOC);
                if ($fullTask && !empty($fullTask['recurrence_rule']) && $fullTask['recurrence_rule'] !== 'none') {
                    $this->spawnRecurringInstance($fullTask);
                }
            }
        }
        $newAssigneeId = !empty($b['assignee_id']) ? (int)$b['assignee_id'] : null;
        if ($newAssigneeId && $newAssigneeId !== $oldAssigneeId && $newAssigneeId != $this->authUser['id']) {
            NotificationController::create($this->db, $newAssigneeId, 'task_assigned',
                "You have been assigned a task: " . $b['title'], $id);
            // Email the new assignee
            $aUser = $this->db->prepare('SELECT email, name FROM users WHERE id=?');
            $aUser->execute([$newAssigneeId]);
            if ($aRow = $aUser->fetch()) {
                $wfRow = $this->db->prepare('SELECT name FROM workflows WHERE id=?');
                $wfRow->execute([$b['workflow_id']]);
                $wfName = $wfRow->fetchColumn() ?: '';
                EmailService::taskAssigned($aRow['email'], $aRow['name'], $b['title'], $wfName, $this->authUser['name']);
            }
        }
        WebhookController::fire($this->db, $cid, 'task.updated', ['task_id'=>$id,'title'=>$b['title']]);

        // Upsert custom field values
        if (!empty($b['custom_values']) && is_array($b['custom_values'])) {
            $upsert = $this->db->prepare(
                'INSERT INTO task_custom_values (task_id, field_id, value)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value)'
            );
            foreach ($b['custom_values'] as $fieldId => $value) {
                $upsert->execute([$id, (int)$fieldId, $value !== null ? (string)$value : null]);
            }
        }

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
        $lock = $this->getTaskLock($taskId);
        if ($lock['isClosed'] || $lock['isDone']) {
            http_response_code(403);
            echo json_encode(['error' => $lock['isClosed'] ? 'Task is closed and cannot be changed.' : 'Comments are disabled while task is in Done stage.']);
            return;
        }
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['content'])) { http_response_code(400); echo json_encode(['error' => 'Content required']); return; }
        $uid = $this->authUser['id'];
        $stmt = $this->db->prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?,?,?)');
        $stmt->execute([$taskId, $uid, $b['content']]);
        $id = $this->db->lastInsertId();
        $this->logActivity($taskId, 'Comment added', substr($b['content'], 0, 100));
        $row = $this->db->prepare('SELECT c.*, u.name as user_name FROM comments c JOIN users u ON c.user_id=u.id WHERE c.id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
        WebhookController::fire($this->db, $cid, 'comment.created', ['task_id'=>$taskId,'user'=>$this->authUser['name'],'preview'=>substr($b['content'],0,100)]);

        // Notify task assignee/creator about new comment (if not the commenter)
        $taskInfo = $this->db->prepare('SELECT assignee_id, creator_id, title FROM tasks WHERE id=?');
        $taskInfo->execute([$taskId]);
        $ti = $taskInfo->fetch();
        $notifyIds = array_unique(array_filter([$ti['assignee_id'], $ti['creator_id']], fn($x) => $x && $x != $uid));
        foreach ($notifyIds as $nid) {
            $nUser = $this->db->prepare('SELECT email, name FROM users WHERE id=?');
            $nUser->execute([$nid]);
            if ($nRow = $nUser->fetch()) {
                NotificationController::create($this->db, $nid, 'comment', "{$this->authUser['name']} commented on: {$ti['title']}", $taskId);
                EmailService::commentNotify($nRow['email'], $nRow['name'], $ti['title'], $this->authUser['name'], $b['content']);
            }
        }
        // @mention parsing
        $this->processMentions($taskId, $b['content'], $ti['title']);
    }

    private function processMentions(int $taskId, string $content, string $taskTitle): void {
        $cid = $this->companyId();
        $uid = $this->authUser['id'];

        // @all — notify every active company user except the commenter
        if (preg_match('/@all\b/i', $content)) {
            $all = $this->db->prepare("SELECT id, email, name FROM users WHERE company_id=? AND is_active=1 AND id!=?");
            $all->execute([$cid, $uid]);
            foreach ($all->fetchAll() as $uRow) {
                NotificationController::create($this->db, $uRow['id'], 'mention',
                    "{$this->authUser['name']} mentioned everyone in a comment", $taskId);
                EmailService::mentionNotify($uRow['email'], $uRow['name'], $this->authUser['name'], $taskTitle, $content);
            }
            return;
        }

        preg_match_all('/@([\w\s]+?)(?=\s|$|[,!?.])/u', $content, $m);
        $names = array_unique($m[1] ?? []);
        foreach ($names as $name) {
            $name = trim($name);
            if (!$name) continue;
            $mu = $this->db->prepare("SELECT id, email, name FROM users WHERE company_id=? AND name LIKE ? LIMIT 1");
            $mu->execute([$cid, '%'.$name.'%']);
            if ($mRow = $mu->fetch()) {
                if ($mRow['id'] == $uid) continue;
                NotificationController::create($this->db, $mRow['id'], 'mention',
                    "{$this->authUser['name']} mentioned you in a comment", $taskId);
                EmailService::mentionNotify($mRow['email'], $mRow['name'], $this->authUser['name'], $taskTitle, $content);
            }
        }
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

        $assignees = $this->db->prepare(
            'SELECT COALESCE(u.name,\'Unassigned\') AS assignee_name,
                    COUNT(t.id)                       AS total,
                    SUM(CASE WHEN ws.name IN (\'Done\',\'Closed\') THEN 1 ELSE 0 END) AS done,
                    SUM(CASE WHEN t.due_date < CURDATE()
                             AND (ws.name IS NULL OR ws.name NOT IN (\'Done\',\'Closed\'))
                        THEN 1 ELSE 0 END) AS overdue
             FROM tasks t
             LEFT JOIN users u             ON t.assignee_id = u.id
             LEFT JOIN workflow_stages ws  ON t.stage_id    = ws.id
             WHERE t.company_id=? AND t.is_active=1 AND t.parent_task_id IS NULL
             GROUP BY t.assignee_id, COALESCE(u.name,\'Unassigned\')
             ORDER BY total DESC
             LIMIT 15'
        );
        $assignees->execute([$cid]);

        echo json_encode([
            'by_stage'    => $stages->fetchAll(),
            'by_project'  => $projects->fetchAll(),
            'by_priority' => $priorities->fetchAll(),
            'by_assignee' => $assignees->fetchAll(),
        ]);
    }

    public function listCompanyUsers(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare("SELECT id, name, email, can_create_tasks FROM users WHERE company_id=? AND is_active=1 ORDER BY name ASC");
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }

    // ── Project Members ───────────────────────────────────────────────────────

    public function listProjectMembers(int $workflowId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$workflowId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Project not found']); return; }

        $stmt = $this->db->prepare(
            'SELECT u.id, u.name, u.email, wm.added_at
             FROM workflow_members wm
             JOIN users u ON wm.user_id = u.id
             WHERE wm.workflow_id = ?
             ORDER BY u.name ASC'
        );
        $stmt->execute([$workflowId]);
        echo json_encode($stmt->fetchAll());
    }

    public function addProjectMember(int $workflowId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$workflowId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Project not found']); return; }

        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['user_id'])) { http_response_code(400); echo json_encode(['error' => 'user_id required']); return; }

        $userCheck = $this->db->prepare("SELECT id, name FROM users WHERE id=? AND company_id=? AND role='employee' AND is_active=1");
        $userCheck->execute([$b['user_id'], $cid]);
        $user = $userCheck->fetch();
        if (!$user) { http_response_code(404); echo json_encode(['error' => 'Employee not found']); return; }

        $stmt = $this->db->prepare('INSERT IGNORE INTO workflow_members (workflow_id, user_id) VALUES (?,?)');
        $stmt->execute([$workflowId, $b['user_id']]);
        echo json_encode(['success' => true, 'user' => $user]);
    }

    public function removeProjectMember(int $workflowId, int $userId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$workflowId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Project not found']); return; }

        $this->db->prepare('DELETE FROM workflow_members WHERE workflow_id=? AND user_id=?')->execute([$workflowId, $userId]);
        echo json_encode(['success' => true]);
    }

    // ── Task Dependencies ─────────────────────────────────────────────────────

    public function addDependency(int $taskId): void {
        $cid = $this->companyId();
        $b   = json_decode(file_get_contents('php://input'), true);
        $depId = (int)($b['depends_on_id'] ?? 0);
        if (!$depId || $depId === $taskId) { http_response_code(400); echo json_encode(['error' => 'Invalid dependency']); return; }
        // Verify both tasks belong to company
        $chk = $this->db->prepare('SELECT COUNT(*) FROM tasks WHERE id IN (?,?) AND company_id=?');
        $chk->execute([$taskId, $depId, $cid]);
        if ($chk->fetchColumn() < 2) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        // Prevent circular: depId must not already depend on taskId
        $circ = $this->db->prepare('SELECT COUNT(*) FROM task_dependencies WHERE task_id=? AND depends_on_id=?');
        $circ->execute([$depId, $taskId]);
        if ($circ->fetchColumn()) { http_response_code(409); echo json_encode(['error' => 'Circular dependency detected']); return; }
        $this->db->prepare('INSERT IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?,?)')->execute([$taskId, $depId]);
        echo json_encode(['success' => true]);
    }

    public function removeDependency(int $taskId, int $depId): void {
        $this->db->prepare('DELETE FROM task_dependencies WHERE task_id=? AND depends_on_id=?')->execute([$taskId, $depId]);
        echo json_encode(['success' => true]);
    }

    // ── Activity Log ──────────────────────────────────────────────────────────

    private function logActivity(int $taskId, string $action, string $detail = ''): void {
        $uid = $this->authUser['id'];
        $this->db->prepare('INSERT INTO activity_log (task_id, user_id, action, detail) VALUES (?,?,?,?)')
                 ->execute([$taskId, $uid, $action, $detail]);
    }

    public function getActivityLog(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $stmt = $this->db->prepare(
            'SELECT a.*, u.name as user_name FROM activity_log a
             JOIN users u ON a.user_id = u.id
             WHERE a.task_id=? ORDER BY a.created_at DESC LIMIT 50'
        );
        $stmt->execute([$taskId]);
        echo json_encode($stmt->fetchAll());
    }

    // ── Time Tracking ─────────────────────────────────────────────────────────

    public function listTimeLogs(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error'=>'Task not found']); return; }
        $stmt = $this->db->prepare(
            'SELECT tl.*, u.name as user_name FROM time_logs tl
             JOIN users u ON tl.user_id=u.id
             WHERE tl.task_id=? ORDER BY tl.logged_date DESC, tl.created_at DESC'
        );
        $stmt->execute([$taskId]);
        echo json_encode($stmt->fetchAll());
    }

    public function addTimeLog(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error'=>'Task not found']); return; }
        $b = json_decode(file_get_contents('php://input'), true);
        $minutes = (int)($b['minutes'] ?? 0);
        if ($minutes <= 0) { http_response_code(400); echo json_encode(['error'=>'Minutes must be greater than 0']); return; }
        $date = $b['logged_date'] ?? date('Y-m-d');
        $stmt = $this->db->prepare('INSERT INTO time_logs (task_id, user_id, description, minutes, logged_date) VALUES (?,?,?,?,?)');
        $stmt->execute([$taskId, $this->authUser['id'], $b['description'] ?? null, $minutes, $date]);
        $id = $this->db->lastInsertId();
        $row = $this->db->prepare('SELECT tl.*, u.name as user_name FROM time_logs tl JOIN users u ON tl.user_id=u.id WHERE tl.id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    public function deleteTimeLog(int $taskId, int $logId): void {
        $this->db->prepare('DELETE FROM time_logs WHERE id=? AND task_id=?')->execute([$logId, $taskId]);
        echo json_encode(['success'=>true]);
    }

    public function timeReport(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare(
            'SELECT u.id, u.name,
                    SUM(tl.minutes) as total_minutes,
                    COUNT(DISTINCT tl.task_id) as tasks_logged,
                    MAX(tl.logged_date) as last_log
             FROM time_logs tl
             JOIN users u ON tl.user_id=u.id
             JOIN tasks t ON tl.task_id=t.id
             WHERE t.company_id=?
             GROUP BY u.id, u.name
             ORDER BY total_minutes DESC'
        );
        $stmt->execute([$cid]);
        $byUser = $stmt->fetchAll();

        $byProject = $this->db->prepare(
            'SELECT w.id, w.name, SUM(tl.minutes) as total_minutes, COUNT(tl.id) as log_count
             FROM time_logs tl
             JOIN tasks t ON tl.task_id=t.id
             JOIN workflows w ON t.workflow_id=w.id
             WHERE w.company_id=?
             GROUP BY w.id, w.name
             ORDER BY total_minutes DESC'
        );
        $byProject->execute([$cid]);

        echo json_encode(['by_user'=>$byUser, 'by_project'=>$byProject->fetchAll()]);
    }

    // ── Custom Fields ─────────────────────────────────────────────────────────

    public function listCustomFields(int $workflowId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$workflowId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Project not found']); return; }

        $stmt = $this->db->prepare(
            'SELECT * FROM custom_fields WHERE workflow_id=? ORDER BY sort_order ASC, id ASC'
        );
        $stmt->execute([$workflowId]);
        $fields = $stmt->fetchAll();
        foreach ($fields as &$f) {
            $f['options']      = $f['options'] ? json_decode($f['options'], true) : [];
            $f['is_required']  = (bool)$f['is_required'];
        }
        echo json_encode($fields);
    }

    public function createCustomField(int $workflowId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM workflows WHERE id=? AND company_id=?');
        $check->execute([$workflowId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Project not found']); return; }

        $b = json_decode(file_get_contents('php://input'), true);
        $name      = trim($b['name'] ?? '');
        $fieldType = $b['field_type'] ?? 'text';
        if (!$name) { http_response_code(400); echo json_encode(['error' => 'Field name required']); return; }

        $allowed = ['text', 'number', 'date', 'select', 'checkbox'];
        if (!in_array($fieldType, $allowed)) { http_response_code(400); echo json_encode(['error' => 'Invalid field type']); return; }

        $options    = !empty($b['options']) ? json_encode($b['options']) : null;
        $isRequired = !empty($b['is_required']) ? 1 : 0;
        $sortOrder  = (int)($b['sort_order'] ?? 0);

        $stmt = $this->db->prepare(
            'INSERT INTO custom_fields (workflow_id, name, field_type, options, is_required, sort_order)
             VALUES (?,?,?,?,?,?)'
        );
        $stmt->execute([$workflowId, $name, $fieldType, $options, $isRequired, $sortOrder]);
        $id = $this->db->lastInsertId();

        $row = $this->db->prepare('SELECT * FROM custom_fields WHERE id=?');
        $row->execute([$id]);
        $field = $row->fetch();
        $field['options']     = $field['options'] ? json_decode($field['options'], true) : [];
        $field['is_required'] = (bool)$field['is_required'];
        echo json_encode($field);
    }

    public function updateCustomField(int $fieldId): void {
        $cid = $this->companyId();
        // Verify field belongs to a workflow of this company
        $check = $this->db->prepare(
            'SELECT cf.id FROM custom_fields cf
             JOIN workflows w ON cf.workflow_id=w.id
             WHERE cf.id=? AND w.company_id=?'
        );
        $check->execute([$fieldId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Field not found']); return; }

        $b = json_decode(file_get_contents('php://input'), true);
        $name       = trim($b['name'] ?? '');
        $fieldType  = $b['field_type'] ?? 'text';
        $options    = !empty($b['options']) ? json_encode($b['options']) : null;
        $isRequired = !empty($b['is_required']) ? 1 : 0;
        $sortOrder  = (int)($b['sort_order'] ?? 0);

        $this->db->prepare(
            'UPDATE custom_fields SET name=?, field_type=?, options=?, is_required=?, sort_order=? WHERE id=?'
        )->execute([$name, $fieldType, $options, $isRequired, $sortOrder, $fieldId]);

        $row = $this->db->prepare('SELECT * FROM custom_fields WHERE id=?');
        $row->execute([$fieldId]);
        $field = $row->fetch();
        $field['options']     = $field['options'] ? json_decode($field['options'], true) : [];
        $field['is_required'] = (bool)$field['is_required'];
        echo json_encode($field);
    }

    public function deleteCustomField(int $fieldId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare(
            'SELECT cf.id FROM custom_fields cf
             JOIN workflows w ON cf.workflow_id=w.id
             WHERE cf.id=? AND w.company_id=?'
        );
        $check->execute([$fieldId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Field not found']); return; }

        $this->db->prepare('DELETE FROM custom_fields WHERE id=?')->execute([$fieldId]);
        echo json_encode(['success' => true]);
    }

    // ── Workload ──────────────────────────────────────────────────────────────

    // ── Checklist Subtasks ────────────────────────────────────────────────────

    public function listSubtasks(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $stmt = $this->db->prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY sort_order, id');
        $stmt->execute([$taskId]);
        echo json_encode(['status' => 'ok', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    public function createSubtask(int $taskId): void {
        $cid = $this->companyId();
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $lock = $this->getTaskLock($taskId);
        if ($lock['isClosed'] || $lock['isDone']) {
            http_response_code(403);
            echo json_encode(['error' => $lock['isClosed'] ? 'Task is closed and cannot be changed.' : 'Comments are disabled while task is in Done stage.']);
            return;
        }
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['title'])) { http_response_code(400); echo json_encode(['error' => 'Title required']); return; }
        $stmt = $this->db->prepare('INSERT INTO subtasks (task_id, title, sort_order) VALUES (?,?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM subtasks s2 WHERE s2.task_id=?))');
        $stmt->execute([$taskId, trim($b['title']), $taskId]);
        echo json_encode(['status' => 'ok', 'id' => $this->db->lastInsertId()]);
    }

    public function updateSubtask(int $taskId, int $subtaskId): void {
        $lock = $this->getTaskLock($taskId);
        if ($lock['isClosed'] || $lock['isDone']) {
            http_response_code(403);
            echo json_encode(['error' => $lock['isClosed'] ? 'Task is closed and cannot be changed.' : 'Comments are disabled while task is in Done stage.']);
            return;
        }
        $b = json_decode(file_get_contents('php://input'), true);
        $sets = []; $params = [];
        if (isset($b['is_done'])) { $sets[] = 'is_done=?'; $params[] = (int)$b['is_done']; }
        if (isset($b['title']))   { $sets[] = 'title=?';   $params[] = trim($b['title']); }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'Nothing to update']); return; }
        $params[] = $subtaskId; $params[] = $taskId;
        $this->db->prepare('UPDATE subtasks SET ' . implode(',', $sets) . ' WHERE id=? AND task_id=?')->execute($params);
        echo json_encode(['status' => 'ok']);
    }

    public function deleteSubtask(int $taskId, int $subtaskId): void {
        $lock = $this->getTaskLock($taskId);
        if ($lock['isClosed'] || $lock['isDone']) {
            http_response_code(403);
            echo json_encode(['error' => $lock['isClosed'] ? 'Task is closed and cannot be changed.' : 'Comments are disabled while task is in Done stage.']);
            return;
        }
        $this->db->prepare('DELETE FROM subtasks WHERE id=? AND task_id=?')->execute([$subtaskId, $taskId]);
        echo json_encode(['status' => 'ok']);
    }

    // ── Duplicate Task ────────────────────────────────────────────────────────

    public function duplicateTask(int $taskId): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT * FROM tasks WHERE id=? AND company_id=?');
        $stmt->execute([$taskId, $cid]);
        $task = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        $ins = $this->db->prepare('INSERT INTO tasks (title, description, priority, due_date, stage_id, workflow_id, assignee_id, company_id, creator_id, estimated_minutes, recurrence_rule) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $ins->execute([
            'Copy of ' . $task['title'],
            $task['description'],
            $task['priority'],
            $task['due_date'],
            $task['stage_id'],
            $task['workflow_id'],
            $task['assignee_id'],
            $task['company_id'],
            $this->authUser['id'],
            $task['estimated_minutes'],
            'none',
        ]);
        $newId = (int)$this->db->lastInsertId();

        // Copy custom field values
        $vals = $this->db->prepare('SELECT field_id, value FROM task_custom_values WHERE task_id=?');
        $vals->execute([$taskId]);
        $ins2 = $this->db->prepare('INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?,?,?)');
        foreach ($vals->fetchAll(PDO::FETCH_ASSOC) as $v) {
            $ins2->execute([$newId, $v['field_id'], $v['value']]);
        }

        // Copy checklist subtasks
        $subs = $this->db->prepare('SELECT title, sort_order FROM subtasks WHERE task_id=? ORDER BY sort_order');
        $subs->execute([$taskId]);
        $ins3 = $this->db->prepare('INSERT INTO subtasks (task_id, title, sort_order) VALUES (?,?,?)');
        foreach ($subs->fetchAll(PDO::FETCH_ASSOC) as $s) {
            $ins3->execute([$newId, $s['title'], $s['sort_order']]);
        }

        echo json_encode(['status' => 'ok', 'data' => ['id' => $newId]]);
    }

    // ── Recurring Tasks ───────────────────────────────────────────────────────

    private function spawnRecurringInstance(array $task): void {
        $rule = $task['recurrence_rule'] ?? 'none';
        $baseDate = $task['due_date'] ? new DateTime($task['due_date']) : new DateTime();
        $interval = match($rule) {
            'daily'   => new DateInterval('P1D'),
            'weekly'  => new DateInterval('P7D'),
            'monthly' => new DateInterval('P1M'),
            default   => null,
        };
        if (!$interval) return;

        $newDue = clone $baseDate;
        $newDue->add($interval);

        if (!empty($task['recurrence_end_date'])) {
            $endDate = new DateTime($task['recurrence_end_date']);
            if ($newDue > $endDate) return;
        }

        // Get first stage of the workflow
        $firstStage = $this->db->prepare('SELECT id FROM workflow_stages WHERE workflow_id=? ORDER BY order_index, id LIMIT 1');
        $firstStage->execute([$task['workflow_id']]);
        $firstStageId = $firstStage->fetchColumn() ?: $task['stage_id'];

        $this->db->prepare('INSERT INTO tasks (title, description, priority, due_date, stage_id, workflow_id, assignee_id, company_id, creator_id, estimated_minutes, recurrence_rule, recurrence_end_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $task['title'],
                $task['description'],
                $task['priority'],
                $newDue->format('Y-m-d'),
                $firstStageId,
                $task['workflow_id'],
                $task['assignee_id'],
                $task['company_id'],
                $task['creator_id'],
                $task['estimated_minutes'],
                $task['recurrence_rule'],
                $task['recurrence_end_date'],
            ]);
    }

    // ── Task Templates ────────────────────────────────────────────────────────

    public function listTaskTemplates(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT tt.*, u.name as created_by_name FROM task_templates tt JOIN users u ON tt.created_by=u.id WHERE tt.company_id=? ORDER BY tt.name');
        $stmt->execute([$cid]);
        echo json_encode(['status' => 'ok', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    public function createTaskTemplate(): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name']) || empty($b['title_template'])) { http_response_code(400); echo json_encode(['error' => 'Name and title required']); return; }
        $this->db->prepare('INSERT INTO task_templates (company_id, workflow_id, name, title_template, description, priority, estimated_minutes, checklist, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$cid, !empty($b['workflow_id']) ? (int)$b['workflow_id'] : null, $b['name'], $b['title_template'], $b['description'] ?? null, $b['priority'] ?? 'medium', !empty($b['estimated_minutes']) ? (int)$b['estimated_minutes'] : null, isset($b['checklist']) ? json_encode($b['checklist']) : null, $this->authUser['id']]);
        echo json_encode(['status' => 'ok', 'id' => $this->db->lastInsertId()]);
    }

    public function updateTaskTemplate(int $id): void {
        $cid = $this->companyId();
        $b = json_decode(file_get_contents('php://input'), true);
        $this->db->prepare('UPDATE task_templates SET name=?, title_template=?, description=?, priority=?, estimated_minutes=?, checklist=?, workflow_id=? WHERE id=? AND company_id=?')
            ->execute([$b['name'], $b['title_template'], $b['description'] ?? null, $b['priority'] ?? 'medium', !empty($b['estimated_minutes']) ? (int)$b['estimated_minutes'] : null, isset($b['checklist']) ? json_encode($b['checklist']) : null, !empty($b['workflow_id']) ? (int)$b['workflow_id'] : null, $id, $cid]);
        echo json_encode(['status' => 'ok']);
    }

    public function deleteTaskTemplate(int $id): void {
        $cid = $this->companyId();
        $this->db->prepare('DELETE FROM task_templates WHERE id=? AND company_id=?')->execute([$id, $cid]);
        echo json_encode(['status' => 'ok']);
    }

    public function saveTaskAsTemplate(int $taskId): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT * FROM tasks WHERE id=? AND company_id=?');
        $stmt->execute([$taskId, $cid]);
        $task = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        $subs = $this->db->prepare('SELECT title FROM subtasks WHERE task_id=? ORDER BY sort_order, id');
        $subs->execute([$taskId]);
        $checklist = array_column($subs->fetchAll(PDO::FETCH_ASSOC), 'title');

        $b = json_decode(file_get_contents('php://input'), true);
        $name = $b['template_name'] ?? ('Template: ' . $task['title']);

        $this->db->prepare('INSERT INTO task_templates (company_id, workflow_id, name, title_template, description, priority, estimated_minutes, checklist, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$cid, $task['workflow_id'], $name, $task['title'], $task['description'], $task['priority'], $task['estimated_minutes'], json_encode($checklist), $this->authUser['id']]);
        echo json_encode(['status' => 'ok', 'id' => $this->db->lastInsertId()]);
    }

    // ── Project Templates ─────────────────────────────────────────────────────

    public function listProjectTemplates(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT * FROM project_templates WHERE company_id=? ORDER BY name');
        $stmt->execute([$cid]);
        echo json_encode(['status' => 'ok', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    public function saveProjectAsTemplate(int $workflowId): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT * FROM workflows WHERE id=? AND company_id=?');
        $stmt->execute([$workflowId, $cid]);
        $wf = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$wf) { http_response_code(404); echo json_encode(['error' => 'Project not found']); return; }

        $stages = $this->db->prepare('SELECT name, order_index FROM workflow_stages WHERE workflow_id=? ORDER BY order_index ASC');
        $stages->execute([$workflowId]);
        $stageList = $stages->fetchAll(PDO::FETCH_ASSOC);

        $fields = $this->db->prepare('SELECT name, field_type, options, is_required, sort_order FROM custom_fields WHERE workflow_id=? ORDER BY sort_order');
        $fields->execute([$workflowId]);
        $fieldList = $fields->fetchAll(PDO::FETCH_ASSOC);

        $b = json_decode(file_get_contents('php://input'), true);
        $name = $b['template_name'] ?? ('Template: ' . $wf['name']);

        $this->db->prepare('INSERT INTO project_templates (company_id, name, description, stages, custom_fields, created_by) VALUES (?,?,?,?,?,?)')
            ->execute([$cid, $name, $wf['description'] ?? null, json_encode($stageList), json_encode($fieldList), $this->authUser['id']]);
        echo json_encode(['status' => 'ok', 'id' => $this->db->lastInsertId()]);
    }

    public function createProjectFromTemplate(int $templateId): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT * FROM project_templates WHERE id=? AND company_id=?');
        $stmt->execute([$templateId, $cid]);
        $tpl = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$tpl) { http_response_code(404); echo json_encode(['error' => 'Template not found']); return; }

        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name'])) { http_response_code(400); echo json_encode(['error' => 'Project name required']); return; }

        $limitErr = $this->checkUsageLimit('projects');
        if ($limitErr) { http_response_code(403); echo json_encode(['error' => $limitErr]); return; }

        $this->db->prepare('INSERT INTO workflows (company_id, name) VALUES (?,?)')
            ->execute([$cid, $b['name']]);
        $wfId = (int)$this->db->lastInsertId();

        $stages = json_decode($tpl['stages'], true) ?: [];
        $stageIns = $this->db->prepare('INSERT INTO workflow_stages (workflow_id, name, order_index) VALUES (?,?,?)');
        foreach ($stages as $i => $s) {
            $stageIns->execute([$wfId, $s['name'], $s['order_index'] ?? $i]);
        }

        $fields = json_decode($tpl['custom_fields'], true) ?: [];
        $fieldIns = $this->db->prepare('INSERT INTO custom_fields (workflow_id, name, field_type, options, is_required, sort_order) VALUES (?,?,?,?,?,?)');
        foreach ($fields as $f) {
            $fieldIns->execute([$wfId, $f['name'], $f['field_type'], $f['options'], (int)($f['is_required'] ?? 0), $f['sort_order'] ?? 0]);
        }

        echo json_encode(['status' => 'ok', 'data' => ['id' => $wfId, 'name' => $b['name']]]);
    }

    public function deleteProjectTemplate(int $id): void {
        $cid = $this->companyId();
        $this->db->prepare('DELETE FROM project_templates WHERE id=? AND company_id=?')->execute([$id, $cid]);
        echo json_encode(['status' => 'ok']);
    }

    // ── Workload ──────────────────────────────────────────────────────────────

    public function workload(): void {
        $cid = $this->companyId();
        $today     = date('Y-m-d');
        $weekEnd   = date('Y-m-d', strtotime('+7 days'));

        // Get all company users (employees + manager)
        $usersStmt = $this->db->prepare(
            "SELECT id, name, email, role FROM users WHERE company_id=? AND is_active=1 ORDER BY name ASC"
        );
        $usersStmt->execute([$cid]);
        $users = $usersStmt->fetchAll();

        // Get all open tasks grouped by assignee
        $tasksStmt = $this->db->prepare(
            "SELECT t.id, t.title, t.priority, t.due_date, t.assignee_id,
                    ws.name AS stage_name, ws.color AS stage_color
             FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE t.company_id = ? AND t.is_active = 1
               AND t.parent_task_id IS NULL
               AND t.assignee_id IS NOT NULL
               AND (ws.name IS NULL OR ws.name NOT IN ('Done', 'Closed', 'done', 'closed'))
             ORDER BY t.due_date ASC"
        );
        $tasksStmt->execute([$cid]);
        $allTasks = $tasksStmt->fetchAll();

        // Index tasks by assignee
        $tasksByUser = [];
        foreach ($allTasks as $t) {
            $tasksByUser[$t['assignee_id']][] = $t;
        }

        $result = [];
        $totalOverdue = 0;
        foreach ($users as $u) {
            $uid    = $u['id'];
            $tasks  = $tasksByUser[$uid] ?? [];
            $overdue       = 0;
            $dueThisWeek   = 0;
            foreach ($tasks as $t) {
                if ($t['due_date'] && $t['due_date'] < $today) $overdue++;
                elseif ($t['due_date'] && $t['due_date'] >= $today && $t['due_date'] <= $weekEnd) $dueThisWeek++;
            }
            $totalOverdue += $overdue;
            $result[] = [
                'user_id'       => $uid,
                'name'          => $u['name'],
                'email'         => $u['email'],
                'role'          => $u['role'],
                'total_tasks'   => count($tasks),
                'overdue'       => $overdue,
                'due_this_week' => $dueThisWeek,
                'tasks'         => $tasks,
            ];
        }

        // Total stats
        $totalTasks = count($allTasks);

        echo json_encode([
            'team_members' => count($users),
            'total_tasks'  => $totalTasks,
            'total_overdue'=> $totalOverdue,
            'users'        => $result,
        ]);
    }

    // ── Kudos ──────────────────────────────────────────────────────────────────

    public function giveKudos(int $taskId): void {
        $cid = $this->companyId();
        $uid = (int)$this->authUser['id'];

        $stmt = $this->db->prepare('SELECT id, assignee_id FROM tasks WHERE id=? AND company_id=?');
        $stmt->execute([$taskId, $cid]);
        $task = $stmt->fetch();
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        if (!$task['assignee_id']) { http_response_code(400); echo json_encode(['error' => 'Task has no assignee to kudos']); return; }
        if ((int)$task['assignee_id'] === $uid) { http_response_code(400); echo json_encode(['error' => 'You cannot give kudos to yourself']); return; }

        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim($body['message'] ?? '') ?: null;

        $this->db->prepare(
            'INSERT INTO kudos (task_id, giver_id, receiver_id, message)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE message = VALUES(message), created_at = NOW()'
        )->execute([$taskId, $uid, (int)$task['assignee_id'], $message]);

        $giverName = $this->authUser['name'];
        $this->db->prepare(
            'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)'
        )->execute([$task['assignee_id'], 'kudos', "{$giverName} gave you kudos!", $taskId]);

        echo json_encode(['ok' => true]);
    }

    public function getTaskKudos(int $taskId): void {
        $cid = $this->companyId();
        $uid = (int)$this->authUser['id'];

        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        $stmt = $this->db->prepare(
            'SELECT k.id, k.giver_id, k.message, k.created_at, g.name as giver_name
             FROM kudos k
             JOIN users g ON g.id = k.giver_id
             WHERE k.task_id = ?
             ORDER BY k.created_at DESC'
        );
        $stmt->execute([$taskId]);
        $kudos    = $stmt->fetchAll();
        $hasGiven = !empty(array_filter($kudos, fn($k) => (int)$k['giver_id'] === $uid));

        echo json_encode(['kudos' => $kudos, 'has_given' => $hasGiven]);
    }

    public function kudosLeaderboard(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare(
            'SELECT u.id, u.name, COUNT(k.id) as kudos_count, MAX(k.created_at) as last_kudos_at
             FROM users u
             JOIN kudos k ON k.receiver_id = u.id
             JOIN tasks t ON t.id = k.task_id
             WHERE t.company_id = ?
             GROUP BY u.id, u.name
             ORDER BY kudos_count DESC
             LIMIT 10'
        );
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }

    // ── Client View Portal ────────────────────────────────────────────────────

    public function listShares(): void {
        $cid  = $this->companyId();
        $wfId = isset($_GET['workflow_id']) ? (int)$_GET['workflow_id'] : null;

        $sql    = 'SELECT cs.token, cs.label, cs.expires_at, cs.is_active, cs.created_at,
                          w.name as workflow_name, w.id as workflow_id
                   FROM client_shares cs
                   JOIN workflows w ON cs.workflow_id = w.id
                   WHERE w.company_id = ?';
        $params = [$cid];

        if ($wfId) {
            $sql    .= ' AND cs.workflow_id = ?';
            $params[] = $wfId;
        }

        $sql .= ' ORDER BY cs.created_at DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['status' => 'ok', 'data' => $stmt->fetchAll()]);
    }

    public function createShare(): void {
        $b        = json_decode(file_get_contents('php://input'), true) ?? [];
        $wfId     = (int)($b['workflow_id'] ?? 0);
        $label    = trim($b['label'] ?? '');
        $expiresAt = !empty($b['expires_at']) ? $b['expires_at'] : null;

        if (!$wfId) {
            http_response_code(422);
            echo json_encode(['error' => 'workflow_id required']);
            return;
        }

        $chk = $this->db->prepare('SELECT id FROM workflows WHERE id = ? AND company_id = ?');
        $chk->execute([$wfId, $this->companyId()]);
        if (!$chk->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        $token = bin2hex(random_bytes(24));

        $this->db->prepare(
            'INSERT INTO client_shares (token, workflow_id, created_by, label, expires_at) VALUES (?, ?, ?, ?, ?)'
        )->execute([$token, $wfId, $this->authUser['id'], $label ?: null, $expiresAt]);

        echo json_encode(['status' => 'ok', 'token' => $token]);
    }

    public function deleteShare(string $token): void {
        $cid  = $this->companyId();
        $chk  = $this->db->prepare(
            'SELECT cs.id FROM client_shares cs
             JOIN workflows w ON cs.workflow_id = w.id
             WHERE cs.token = ? AND w.company_id = ?'
        );
        $chk->execute([$token, $cid]);
        if (!$chk->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Share not found']);
            return;
        }

        $this->db->prepare('DELETE FROM client_shares WHERE token = ?')->execute([$token]);
        echo json_encode(['status' => 'ok']);
    }

    // ── Sprints ───────────────────────────────────────────────────────────────

    private function ensureSprintTables(): void {
        $this->db->exec(
            "CREATE TABLE IF NOT EXISTS sprints (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                workflow_id INT NULL,
                name VARCHAR(255) NOT NULL,
                goal TEXT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status ENUM('planning','active','completed') DEFAULT 'planning',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sprints_company (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $this->db->exec(
            "CREATE TABLE IF NOT EXISTS sprint_tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sprint_id INT NOT NULL,
                task_id INT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_sprint_task (sprint_id, task_id),
                INDEX idx_st_sprint (sprint_id),
                INDEX idx_st_task (task_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }

    public function listSprints(): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $stmt = $this->db->prepare(
            "SELECT s.*, w.name as workflow_name,
                    COUNT(DISTINCT st.task_id) as total_tasks,
                    SUM(CASE WHEN (LOWER(ws.name) LIKE '%done%' OR LOWER(ws.name) LIKE '%complet%' OR LOWER(ws.name) LIKE '%closed%') THEN 1 ELSE 0 END) as completed_tasks
             FROM sprints s
             LEFT JOIN workflows w ON s.workflow_id = w.id
             LEFT JOIN sprint_tasks st ON st.sprint_id = s.id
             LEFT JOIN tasks t ON t.id = st.task_id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE s.company_id = ?
             GROUP BY s.id
             ORDER BY FIELD(s.status,'active','planning','completed'), s.start_date DESC"
        );
        $stmt->execute([$cid]);
        echo json_encode(['status' => 'ok', 'data' => $stmt->fetchAll()]);
    }

    public function createSprint(): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $b = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($b['name']) || empty($b['start_date']) || empty($b['end_date'])) {
            http_response_code(400); echo json_encode(['error' => 'name, start_date, end_date required']); return;
        }
        $stmt = $this->db->prepare(
            "INSERT INTO sprints (company_id, workflow_id, name, goal, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $cid,
            !empty($b['workflow_id']) ? (int)$b['workflow_id'] : null,
            $b['name'],
            $b['goal'] ?? null,
            $b['start_date'],
            $b['end_date'],
            $b['status'] ?? 'planning',
        ]);
        echo json_encode(['status' => 'ok', 'id' => (int)$this->db->lastInsertId()]);
    }

    public function updateSprint(int $id): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $chk = $this->db->prepare('SELECT id FROM sprints WHERE id=? AND company_id=?');
        $chk->execute([$id, $cid]);
        if (!$chk->fetch()) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $b = json_decode(file_get_contents('php://input'), true) ?? [];
        $this->db->prepare(
            "UPDATE sprints SET name=?, goal=?, start_date=?, end_date=?, status=?, workflow_id=? WHERE id=?"
        )->execute([
            $b['name'], $b['goal'] ?? null, $b['start_date'], $b['end_date'],
            $b['status'] ?? 'planning',
            !empty($b['workflow_id']) ? (int)$b['workflow_id'] : null,
            $id,
        ]);
        echo json_encode(['status' => 'ok']);
    }

    public function deleteSprint(int $id): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $chk = $this->db->prepare('SELECT id FROM sprints WHERE id=? AND company_id=?');
        $chk->execute([$id, $cid]);
        if (!$chk->fetch()) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $this->db->prepare('DELETE FROM sprint_tasks WHERE sprint_id=?')->execute([$id]);
        $this->db->prepare('DELETE FROM sprints WHERE id=?')->execute([$id]);
        echo json_encode(['status' => 'ok']);
    }

    public function listSprintTasks(int $sprintId): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $chk = $this->db->prepare('SELECT id FROM sprints WHERE id=? AND company_id=?');
        $chk->execute([$sprintId, $cid]);
        if (!$chk->fetch()) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $stmt = $this->db->prepare(
            "SELECT t.id, t.title, t.priority, t.due_date,
                    ws.name as stage_name, ws.color as stage_color,
                    u.name as assignee_name, w.name as project_name
             FROM tasks t
             JOIN sprint_tasks st ON st.task_id = t.id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             LEFT JOIN users u ON t.assignee_id = u.id
             LEFT JOIN workflows w ON t.workflow_id = w.id
             WHERE st.sprint_id = ? AND t.company_id = ?
             ORDER BY t.priority DESC, t.title ASC"
        );
        $stmt->execute([$sprintId, $cid]);
        echo json_encode(['status' => 'ok', 'data' => $stmt->fetchAll()]);
    }

    public function addSprintTask(int $sprintId): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $chk = $this->db->prepare('SELECT id FROM sprints WHERE id=? AND company_id=?');
        $chk->execute([$sprintId, $cid]);
        if (!$chk->fetch()) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $b      = json_decode(file_get_contents('php://input'), true) ?? [];
        $taskId = (int)($b['task_id'] ?? 0);
        if (!$taskId) { http_response_code(400); echo json_encode(['error' => 'task_id required']); return; }
        $tc = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=?');
        $tc->execute([$taskId, $cid]);
        if (!$tc->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        $this->db->prepare('INSERT IGNORE INTO sprint_tasks (sprint_id, task_id) VALUES (?,?)')->execute([$sprintId, $taskId]);
        echo json_encode(['status' => 'ok']);
    }

    public function removeSprintTask(int $sprintId, int $taskId): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $chk = $this->db->prepare('SELECT id FROM sprints WHERE id=? AND company_id=?');
        $chk->execute([$sprintId, $cid]);
        if (!$chk->fetch()) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $this->db->prepare('DELETE FROM sprint_tasks WHERE sprint_id=? AND task_id=?')->execute([$sprintId, $taskId]);
        echo json_encode(['status' => 'ok']);
    }

    public function sprintBurndown(int $sprintId): void {
        $cid = $this->companyId();
        $this->ensureSprintTables();
        $sprint = $this->db->prepare('SELECT * FROM sprints WHERE id=? AND company_id=?');
        $sprint->execute([$sprintId, $cid]);
        $s = $sprint->fetch();
        if (!$s) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }

        $totalQ = $this->db->prepare('SELECT COUNT(*) FROM sprint_tasks WHERE sprint_id=?');
        $totalQ->execute([$sprintId]);
        $total = (int)$totalQ->fetchColumn();

        $compQ = $this->db->prepare(
            "SELECT DATE(t.updated_at) as d, COUNT(*) as cnt
             FROM tasks t
             JOIN sprint_tasks st ON st.task_id = t.id
             JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE st.sprint_id = ?
               AND (LOWER(ws.name) LIKE '%done%' OR LOWER(ws.name) LIKE '%complet%' OR LOWER(ws.name) LIKE '%closed%')
               AND DATE(t.updated_at) BETWEEN ? AND ?
             GROUP BY DATE(t.updated_at)"
        );
        $compQ->execute([$sprintId, $s['start_date'], $s['end_date']]);
        $byDay = [];
        foreach ($compQ->fetchAll() as $r) { $byDay[$r['d']] = (int)$r['cnt']; }

        $start      = new \DateTime($s['start_date']);
        $endFull    = new \DateTime($s['end_date']);
        $endCap     = new \DateTime(min($s['end_date'], date('Y-m-d')));
        $sprintDays = (int)$start->diff($endFull)->days + 1;

        $burndown = [];
        $cumDone  = 0;
        $dayIdx   = 0;
        $current  = clone $start;
        while ($current <= $endCap) {
            $ds       = $current->format('Y-m-d');
            $cumDone += $byDay[$ds] ?? 0;
            $burndown[] = [
                'date'      => $ds,
                'remaining' => max(0, $total - $cumDone),
                'ideal'     => round($total - ($total * $dayIdx / max(1, $sprintDays - 1)), 1),
            ];
            $current->modify('+1 day');
            $dayIdx++;
        }

        echo json_encode(['status' => 'ok', 'sprint' => $s, 'total' => $total, 'data' => $burndown]);
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    public function analytics(): void {
        $cid = $this->companyId();

        // Overview counts
        $ov = $this->db->prepare(
            "SELECT
                COUNT(*) as total,
                SUM(CASE WHEN (LOWER(ws.name) LIKE '%done%' OR LOWER(ws.name) LIKE '%complet%' OR LOWER(ws.name) LIKE '%closed%') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN t.due_date < CURDATE()
                          AND (LOWER(ws.name) NOT LIKE '%done%' AND LOWER(ws.name) NOT LIKE '%complet%' AND LOWER(ws.name) NOT LIKE '%closed%')
                     THEN 1 ELSE 0 END) as overdue
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id = ?"
        );
        $ov->execute([$cid]);
        $overview = $ov->fetch();

        // Completion rate — tasks created in last 30 days
        $mo = $this->db->prepare(
            "SELECT
                COUNT(*) as total,
                SUM(CASE WHEN (LOWER(ws.name) LIKE '%done%' OR LOWER(ws.name) LIKE '%complet%' OR LOWER(ws.name) LIKE '%closed%') THEN 1 ELSE 0 END) as completed
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id = ? AND t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
        );
        $mo->execute([$cid]);
        $monthly = $mo->fetch();
        $completionRate = $monthly['total'] > 0 ? round($monthly['completed'] / $monthly['total'] * 100) : 0;

        // Tasks by stage
        $stageQ = $this->db->prepare(
            "SELECT COALESCE(ws.name,'No Stage') as stage_name, COALESCE(ws.color,'#94a3b8') as color, COUNT(*) as count
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id = ?
             GROUP BY ws.id, ws.name, ws.color
             ORDER BY count DESC"
        );
        $stageQ->execute([$cid]);
        $tasksByStage = $stageQ->fetchAll();

        // Tasks by priority
        $prioQ = $this->db->prepare(
            "SELECT COALESCE(priority,'medium') as priority, COUNT(*) as count
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             WHERE w.company_id = ?
             GROUP BY priority"
        );
        $prioQ->execute([$cid]);
        $tasksByPriority = ['high' => 0, 'medium' => 0, 'low' => 0];
        foreach ($prioQ->fetchAll() as $r) {
            $k = in_array($r['priority'], ['high','medium','low']) ? $r['priority'] : 'medium';
            $tasksByPriority[$k] += (int)$r['count'];
        }

        // Weekly velocity — completed tasks per week for last 8 weeks
        $velQ = $this->db->prepare(
            "SELECT YEARWEEK(t.updated_at, 1) as yw, COUNT(*) as completed
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id = ?
               AND (LOWER(ws.name) LIKE '%done%' OR LOWER(ws.name) LIKE '%complet%' OR LOWER(ws.name) LIKE '%closed%')
               AND t.updated_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
             GROUP BY YEARWEEK(t.updated_at, 1)
             ORDER BY yw ASC"
        );
        $velQ->execute([$cid]);
        $velMap = [];
        foreach ($velQ->fetchAll() as $r) { $velMap[(string)$r['yw']] = (int)$r['completed']; }

        $velocity = [];
        for ($i = 7; $i >= 0; $i--) {
            $ts = strtotime("-{$i} weeks");
            $yw = date('oW', $ts); // ISO year + zero-padded week
            $velocity[] = ['label' => date('M j', $ts), 'completed' => $velMap[$yw] ?? 0];
        }

        // Average cycle time (days) — completed tasks in last 90 days
        $ctQ = $this->db->prepare(
            "SELECT AVG(DATEDIFF(t.updated_at, t.created_at)) as avg_days
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id = ?
               AND (LOWER(ws.name) LIKE '%done%' OR LOWER(ws.name) LIKE '%complet%' OR LOWER(ws.name) LIKE '%closed%')
               AND t.updated_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)"
        );
        $ctQ->execute([$cid]);
        $avgCycleTime = round((float)$ctQ->fetchColumn(), 1);

        // Bottleneck — in-progress stage with most tasks
        $bnQ = $this->db->prepare(
            "SELECT ws.name, ws.color, COUNT(*) as count
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE w.company_id = ?
               AND LOWER(ws.name) NOT LIKE '%done%'
               AND LOWER(ws.name) NOT LIKE '%complet%'
               AND LOWER(ws.name) NOT LIKE '%closed%'
             GROUP BY ws.id, ws.name, ws.color
             ORDER BY count DESC
             LIMIT 1"
        );
        $bnQ->execute([$cid]);
        $bottleneck = $bnQ->fetch() ?: null;

        echo json_encode([
            'status' => 'ok',
            'data'   => [
                'total_tasks'       => (int)$overview['total'],
                'completed_tasks'   => (int)$overview['completed'],
                'overdue_tasks'     => (int)$overview['overdue'],
                'completion_rate'   => $completionRate,
                'avg_cycle_time'    => $avgCycleTime,
                'bottleneck'        => $bottleneck,
                'tasks_by_stage'    => $tasksByStage,
                'tasks_by_priority' => $tasksByPriority,
                'weekly_velocity'   => $velocity,
            ],
        ]);
    }

    // ── Invitations ───────────────────────────────────────────────────────────

    private function ensureInvitationsTable(): void {
        $this->db->exec('CREATE TABLE IF NOT EXISTS invitations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            email VARCHAR(255) NOT NULL,
            token VARCHAR(64) NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_inv_token (token),
            INDEX idx_inv_company (company_id)
        )');
    }

    public function listInvitations(): void {
        $this->ensureInvitationsTable();
        $stmt = $this->db->prepare(
            'SELECT id, email, expires_at, created_at FROM invitations
             WHERE company_id=? AND accepted_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC'
        );
        $stmt->execute([$this->companyId()]);
        $rows = $stmt->fetchAll();
        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host  = $_SERVER['HTTP_HOST'] ?? 'localhost';
        foreach ($rows as &$r) {
            $r['link'] = "{$proto}://{$host}/?invite={$r['token']}";
        }
        echo json_encode($rows);
    }

    public function createInvitation(): void {
        $this->ensureInvitationsTable();
        $data  = json_decode(file_get_contents('php://input'), true);
        $email = trim($data['email'] ?? '');

        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Valid email address required']);
            return;
        }

        // Email must not belong to an existing user in this company
        $stmt = $this->db->prepare('SELECT id FROM users WHERE email=? AND company_id=?');
        $stmt->execute([$email, $this->companyId()]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'A user with this email already exists in your team']);
            return;
        }

        // No active pending invitation for this email
        $stmt = $this->db->prepare(
            'SELECT id FROM invitations WHERE email=? AND company_id=? AND accepted_at IS NULL AND expires_at > NOW()'
        );
        $stmt->execute([$email, $this->companyId()]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'A pending invitation already exists for this email']);
            return;
        }

        $limitErr = $this->checkUsageLimit('users');
        if ($limitErr) { http_response_code(403); echo json_encode(['error' => $limitErr]); return; }

        $token     = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));

        $stmt = $this->db->prepare(
            'INSERT INTO invitations (company_id, email, token, expires_at) VALUES (?,?,?,?)'
        );
        $stmt->execute([$this->companyId(), $email, $token, $expiresAt]);
        $invId = (int)$this->db->lastInsertId();

        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host  = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $link  = "{$proto}://{$host}/?invite={$token}";

        // Best-effort email (may not work on localhost/XAMPP)
        $emailSent = false;
        $subject   = 'You\'ve been invited to join TaskFlow';
        $body      = "Hello,\n\nYou've been invited to join your team on TaskFlow.\n\nClick the link below to set up your account:\n{$link}\n\nThis invitation expires in 7 days.\n\nTaskFlow Team";
        try { $emailSent = @mail($email, $subject, $body, 'From: noreply@taskflow.app'); } catch (\Throwable $e) {}

        echo json_encode([
            'id'         => $invId,
            'email'      => $email,
            'link'       => $link,
            'expires_at' => $expiresAt,
            'email_sent' => $emailSent,
        ]);
    }

    public function revokeInvitation(int $id): void {
        $this->ensureInvitationsTable();
        $stmt = $this->db->prepare('DELETE FROM invitations WHERE id=? AND company_id=?');
        $stmt->execute([$id, $this->companyId()]);
        echo json_encode(['ok' => true]);
    }
}
