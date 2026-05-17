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
        $stmt = $this->db->prepare('SELECT w.*, (SELECT COUNT(*) FROM workflow_stages WHERE workflow_id=w.id) as stage_count FROM workflows w WHERE w.company_id=? ORDER BY w.created_at DESC');
        $stmt->execute([$cid]);
        $workflows = $stmt->fetchAll();
        foreach ($workflows as &$wf) {
            $stages = $this->db->prepare('SELECT * FROM workflow_stages WHERE workflow_id=? ORDER BY order_index ASC');
            $stages->execute([$wf['id']]);
            $wf['stages'] = $stages->fetchAll();

            $members = $this->db->prepare('SELECT u.id, u.name, u.email FROM workflow_members wm JOIN users u ON wm.user_id=u.id WHERE wm.workflow_id=? ORDER BY u.name ASC');
            $members->execute([$wf['id']]);
            $wf['members'] = $members->fetchAll();
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
        if (empty($b['workflow_id'])) { http_response_code(400); echo json_encode(['error' => 'Project (workflow) is required']); return; }
        $err = $this->validateTaskFields($b, $cid);
        if ($err) { http_response_code(400); echo json_encode(['error' => $err]); return; }
        // Fetch old assignee before update to detect changes
        $oldTask = $this->db->prepare('SELECT assignee_id, title FROM tasks WHERE id=?');
        $oldTask->execute([$id]);
        $oldRow = $oldTask->fetch();
        $oldAssigneeId = $oldRow ? (int)$oldRow['assignee_id'] : null;

        $recurrenceRule = $b['recurrence_rule'] ?? 'none';
        $recurrenceEndDate = !empty($b['recurrence_end_date']) ? $b['recurrence_end_date'] : null;
        $this->db->prepare('UPDATE tasks SET title=?, description=?, priority=?, stage_id=?, workflow_id=?, assignee_id=?, start_date=?, due_date=?, recurrence_rule=?, recurrence_end_date=? WHERE id=?')->execute([$b['title'], $b['description'] ?? null, $b['priority'] ?? 'medium', $b['stage_id'] ?? null, $b['workflow_id'], $b['assignee_id'] ?? null, $b['start_date'] ?? null, $b['due_date'] ?? null, $recurrenceRule, $recurrenceEndDate, $id]);
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
        preg_match_all('/@([\w\s]+?)(?=\s|$|[,!?.])/u', $content, $m);
        $names = array_unique($m[1] ?? []);
        $cid   = $this->companyId();
        $uid   = $this->authUser['id'];
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
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['title'])) { http_response_code(400); echo json_encode(['error' => 'Title required']); return; }
        $stmt = $this->db->prepare('INSERT INTO subtasks (task_id, title, sort_order) VALUES (?,?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM subtasks s2 WHERE s2.task_id=?))');
        $stmt->execute([$taskId, trim($b['title']), $taskId]);
        echo json_encode(['status' => 'ok', 'id' => $this->db->lastInsertId()]);
    }

    public function updateSubtask(int $taskId, int $subtaskId): void {
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
}
