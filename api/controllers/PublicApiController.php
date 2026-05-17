<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class PublicApiController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($authHeader, 'Bearer ')) {
            http_response_code(401);
            echo json_encode(['error' => 'API key required']);
            exit;
        }
        $key  = substr($authHeader, 7);
        $user = Auth::verifyApiKey($key);
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid or inactive API key']);
            exit;
        }
        $this->db       = Database::getInstance();
        $this->authUser = $user;
    }

    private function companyId(): int {
        return (int)$this->authUser['company_id'];
    }

    public function listTasks(): void {
        $page      = max(1, (int)($_GET['page'] ?? 1));
        $perPage   = min(100, max(1, (int)($_GET['per_page'] ?? 20)));
        $projectId = isset($_GET['project_id']) ? (int)$_GET['project_id'] : null;
        $status    = $_GET['status'] ?? '';
        $offset    = ($page - 1) * $perPage;

        $where  = 't.company_id = ? AND t.is_active = 1 AND t.parent_task_id IS NULL';
        $params = [$this->companyId()];

        if ($projectId) {
            $where   .= ' AND t.workflow_id = ?';
            $params[] = $projectId;
        }
        if ($status) {
            $where   .= ' AND ws.name = ?';
            $params[] = $status;
        }

        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE $where"
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $params[] = $perPage;
        $params[] = $offset;
        $stmt = $this->db->prepare(
            "SELECT t.id, t.title, t.description, t.priority, t.due_date, t.start_date, t.created_at,
                    ws.name AS stage_name, w.name AS project_name,
                    u.name AS assignee_name, t.workflow_id, t.stage_id, t.assignee_id
             FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             LEFT JOIN workflows w ON t.workflow_id = w.id
             LEFT JOIN users u ON t.assignee_id = u.id
             WHERE $where
             ORDER BY t.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute($params);
        $tasks = $stmt->fetchAll();

        echo json_encode([
            'data' => $tasks,
            'meta' => [
                'page'     => $page,
                'per_page' => $perPage,
                'total'    => $total,
            ],
        ]);
    }

    public function getTask(int $id): void {
        $stmt = $this->db->prepare(
            'SELECT t.id, t.title, t.description, t.priority, t.due_date, t.start_date, t.created_at,
                    ws.name AS stage_name, w.name AS project_name,
                    u.name AS assignee_name, t.workflow_id, t.stage_id, t.assignee_id
             FROM tasks t
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             LEFT JOIN workflows w ON t.workflow_id = w.id
             LEFT JOIN users u ON t.assignee_id = u.id
             WHERE t.id = ? AND t.company_id = ? AND t.is_active = 1'
        );
        $stmt->execute([$id, $this->companyId()]);
        $task = $stmt->fetch();
        if (!$task) {
            http_response_code(404);
            echo json_encode(['error' => 'Task not found']);
            return;
        }
        echo json_encode($task);
    }

    public function listProjects(): void {
        $stmt = $this->db->prepare(
            'SELECT id, name, description, created_at FROM workflows WHERE company_id = ? AND is_active = 1 ORDER BY name'
        );
        $stmt->execute([$this->companyId()]);
        echo json_encode($stmt->fetchAll());
    }

    public function createTask(): void {
        $body = json_decode(file_get_contents('php://input'), true);
        $title = trim($body['title'] ?? '');
        if (!$title) {
            http_response_code(400);
            echo json_encode(['error' => 'Title is required']);
            return;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO tasks (company_id, title, description, priority, due_date, start_date, workflow_id, stage_id, assignee_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $this->companyId(),
            $title,
            $body['description'] ?? null,
            $body['priority'] ?? 'medium',
            $body['due_date'] ?? null,
            $body['start_date'] ?? null,
            $body['workflow_id'] ?? null,
            $body['stage_id'] ?? null,
            $body['assignee_id'] ?? null,
            $this->authUser['id'],
        ]);
        $id = $this->db->lastInsertId();
        $this->getTask($id);
    }

    public function updateTask(int $id): void {
        // Verify ownership
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id = ? AND company_id = ? AND is_active = 1');
        $check->execute([$id, $this->companyId()]);
        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Task not found']);
            return;
        }

        $body   = json_decode(file_get_contents('php://input'), true);
        $fields = [];
        $params = [];

        $allowed = ['title', 'description', 'priority', 'due_date', 'start_date', 'workflow_id', 'stage_id', 'assignee_id'];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f = ?";
                $params[] = $body[$f];
            }
        }

        if ($fields) {
            $params[] = $id;
            $this->db->prepare('UPDATE tasks SET ' . implode(', ', $fields) . ' WHERE id = ?')
                     ->execute($params);
        }

        $this->getTask($id);
    }
}
