<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class EmployeeController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->authUser = Auth::requireAuth('employee', 'manager');
    }

    public function stats(): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $s1 = $this->db->prepare('SELECT COUNT(*) FROM tasks WHERE (assignee_id=? OR creator_id=?) AND is_active=1 AND parent_task_id IS NULL'); $s1->execute([$uid, $uid]); $myTasks = $s1->fetchColumn();
        $s2 = $this->db->prepare("SELECT COUNT(*) FROM tasks t JOIN workflow_stages ws ON t.stage_id=ws.id WHERE (t.assignee_id=? OR t.creator_id=?) AND t.is_active=1 AND ws.name IN ('Done','Closed')"); $s2->execute([$uid, $uid]); $done = $s2->fetchColumn();
        $s3 = $this->db->prepare('SELECT COUNT(*) FROM tasks WHERE (assignee_id=? OR creator_id=?) AND is_active=1 AND parent_task_id IS NULL AND due_date < CURDATE()'); $s3->execute([$uid, $uid]); $overdue = $s3->fetchColumn();
        echo json_encode(['my_tasks' => (int)$myTasks, 'done' => (int)$done, 'overdue' => (int)$overdue]);
    }

    public function listTasks(): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $stmt = $this->db->prepare('SELECT t.*, u.name as assignee_name, c.name as creator_name, ws.name as stage_name, ws.color as stage_color, w.name as workflow_name, (SELECT COUNT(*) FROM tasks WHERE parent_task_id=t.id AND is_active=1) as subtask_count FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN users c ON t.creator_id=c.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id LEFT JOIN workflows w ON t.workflow_id=w.id WHERE t.company_id=? AND (t.assignee_id=? OR t.creator_id=?) AND t.parent_task_id IS NULL AND t.is_active=1 ORDER BY t.created_at DESC');
        $stmt->execute([$cid, $uid, $uid]);
        echo json_encode($stmt->fetchAll());
    }

    public function getTask(int $id): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $stmt = $this->db->prepare(
            'SELECT t.*, u.name as assignee_name, cr.name as creator_name,
                    ws.name as stage_name, ws.color as stage_color,
                    w.name as workflow_name
             FROM tasks t
             LEFT JOIN users u            ON t.assignee_id = u.id
             LEFT JOIN users cr           ON t.creator_id  = cr.id
             LEFT JOIN workflow_stages ws ON t.stage_id    = ws.id
             LEFT JOIN workflows w        ON t.workflow_id = w.id
             WHERE t.id = ? AND t.company_id = ? AND t.is_active = 1'
        );
        $stmt->execute([$id, $cid]);
        $task = $stmt->fetch();
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        $sub = $this->db->prepare('SELECT t.*, u.name as assignee_name, ws.name as stage_name, ws.color as stage_color FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN workflow_stages ws ON t.stage_id=ws.id WHERE t.parent_task_id=? AND t.is_active=1 ORDER BY t.created_at ASC');
        $sub->execute([$id]);
        $task['subtasks'] = $sub->fetchAll();

        $com = $this->db->prepare('SELECT c.*, u.name as user_name FROM comments c JOIN users u ON c.user_id=u.id WHERE c.task_id=? ORDER BY c.created_at ASC');
        $com->execute([$id]);
        $task['comments'] = $com->fetchAll();

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
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND (assignee_id=? OR creator_id=?) AND is_active=1');
        $check->execute([$taskId, $cid, $uid, $uid]);
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

        $stmt = $this->db->prepare('INSERT INTO task_attachments (task_id, uploaded_by, filename, original_name, mime_type, file_size) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$taskId, $uid, $stored, $file['name'], $file['type'], $file['size']]);
        $newId = $this->db->lastInsertId();

        $row = $this->db->prepare('SELECT a.*, u.name as uploader_name FROM task_attachments a JOIN users u ON a.uploaded_by=u.id WHERE a.id=?');
        $row->execute([$newId]);
        echo json_encode($row->fetch());
    }

    public function deleteAttachment(int $taskId, int $attachId): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }

        $att = $this->db->prepare('SELECT * FROM task_attachments WHERE id=? AND task_id=?');
        $att->execute([$attachId, $taskId]);
        $attachment = $att->fetch();
        if (!$attachment) { http_response_code(404); echo json_encode(['error' => 'Attachment not found']); return; }
        if ($attachment['uploaded_by'] != $uid) { http_response_code(403); echo json_encode(['error' => 'You can only delete your own attachments']); return; }

        $file = __DIR__ . '/../../public/uploads/attachments/' . $attachment['filename'];
        if (file_exists($file)) unlink($file);

        $this->db->prepare('DELETE FROM task_attachments WHERE id=?')->execute([$attachId]);
        echo json_encode(['success' => true]);
    }

    public function createTask(): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        // Check permission
        $perm = $this->db->prepare('SELECT can_create_tasks FROM users WHERE id=?');
        $perm->execute([$uid]);
        $user = $perm->fetch();
        if (!$user || (!$user['can_create_tasks'] && $this->authUser['role'] !== 'manager')) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to create tasks']);
            return;
        }
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['title'])) { http_response_code(400); echo json_encode(['error' => 'Title required']); return; }
        if (empty($b['workflow_id'])) { http_response_code(400); echo json_encode(['error' => 'Project (workflow) is required']); return; }
        // Employee may only create tasks in projects they are already part of
        $wfAccess = $this->db->prepare('SELECT COUNT(*) FROM tasks WHERE workflow_id=? AND (assignee_id=? OR creator_id=?) AND is_active=1');
        $wfAccess->execute([$b['workflow_id'], $uid, $uid]);
        if (!$wfAccess->fetchColumn()) { http_response_code(403); echo json_encode(['error' => 'You do not have access to this project']); return; }
        // For subtasks, verify access to the parent task
        if (!empty($b['parent_task_id'])) {
            $parentAccess = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND (assignee_id=? OR creator_id=?) AND is_active=1');
            $parentAccess->execute([$b['parent_task_id'], $uid, $uid]);
            if (!$parentAccess->fetch()) { http_response_code(403); echo json_encode(['error' => 'You do not have access to the parent task']); return; }
        }
        $stmt = $this->db->prepare('INSERT INTO tasks (company_id, title, description, priority, stage_id, workflow_id, assignee_id, creator_id, parent_task_id, start_date, due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$cid, $b['title'], $b['description'] ?? null, $b['priority'] ?? 'medium', $b['stage_id'] ?? null, $b['workflow_id'], $b['assignee_id'] ?? $uid, $uid, $b['parent_task_id'] ?? null, $b['start_date'] ?? null, $b['due_date'] ?? null]);
        $id = $this->db->lastInsertId();
        $this->getTask($id);
    }

    public function updateStage(int $id): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $b = json_decode(file_get_contents('php://input'), true);
        $check = $this->db->prepare(
            'SELECT t.id, ws.name AS stage_name
             FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE t.id=? AND t.company_id=? AND (t.assignee_id=? OR t.creator_id=?) AND t.is_active=1'
        );
        $check->execute([$id, $cid, $uid, $uid]);
        $task = $check->fetch();
        if (!$task) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        if (in_array($task['stage_name'], ['Done', 'Closed'])) {
            http_response_code(403);
            echo json_encode(['error' => 'This task is already completed and its status cannot be changed.']);
            return;
        }
        $this->db->prepare('UPDATE tasks SET stage_id=? WHERE id=?')->execute([$b['stage_id'], $id]);
        echo json_encode(['success' => true]);
    }

    public function listWorkflows(): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];

        $stmt = $this->db->prepare(
            'SELECT w.id, w.name
             FROM workflows w
             WHERE w.company_id = ? AND w.is_active = 1
               AND w.id IN (
                   SELECT DISTINCT workflow_id FROM tasks
                   WHERE (assignee_id = ? OR creator_id = ?) AND is_active = 1
               )
             ORDER BY w.name ASC'
        );
        $stmt->execute([$cid, $uid, $uid]);
        $workflows = $stmt->fetchAll();

        foreach ($workflows as &$wf) {
            $s = $this->db->prepare(
                'SELECT id, name, color, order_index
                 FROM workflow_stages WHERE workflow_id = ? ORDER BY order_index ASC'
            );
            $s->execute([$wf['id']]);
            $wf['stages'] = $s->fetchAll();
        }

        echo json_encode($workflows);
    }

    public function addComment(int $taskId): void {
        $uid = $this->authUser['id'];
        $cid = $this->authUser['company_id'];
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND (assignee_id=? OR creator_id=?)');
        $check->execute([$taskId, $cid, $uid, $uid]);
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
}
