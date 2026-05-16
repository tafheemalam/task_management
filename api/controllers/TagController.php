<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class TagController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->authUser = Auth::requireAuth('manager', 'employee');
    }

    public function listTags(): void {
        $cid = $this->authUser['company_id'];
        $stmt = $this->db->prepare('SELECT * FROM tags WHERE company_id=? ORDER BY name ASC');
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }

    public function createTag(): void {
        $cid = $this->authUser['company_id'];
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name'])) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $color = $b['color'] ?? '#6366f1';
        try {
            $stmt = $this->db->prepare('INSERT INTO tags (company_id, name, color) VALUES (?,?,?)');
            $stmt->execute([$cid, trim($b['name']), $color]);
            $id = $this->db->lastInsertId();
            $row = $this->db->prepare('SELECT * FROM tags WHERE id=?');
            $row->execute([$id]);
            echo json_encode($row->fetch());
        } catch (PDOException $e) {
            http_response_code(409); echo json_encode(['error' => 'Tag already exists']);
        }
    }

    public function deleteTag(int $id): void {
        $cid = $this->authUser['company_id'];
        $this->db->prepare('DELETE FROM tags WHERE id=? AND company_id=?')->execute([$id, $cid]);
        echo json_encode(['success' => true]);
    }

    public function addTagToTask(int $taskId): void {
        $cid = $this->authUser['company_id'];
        $b = json_decode(file_get_contents('php://input'), true);
        $tagId = (int)($b['tag_id'] ?? 0);
        // Verify task belongs to company
        $check = $this->db->prepare('SELECT id FROM tasks WHERE id=? AND company_id=? AND is_active=1');
        $check->execute([$taskId, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error' => 'Task not found']); return; }
        // Verify tag belongs to company
        $checkTag = $this->db->prepare('SELECT id FROM tags WHERE id=? AND company_id=?');
        $checkTag->execute([$tagId, $cid]);
        if (!$checkTag->fetch()) { http_response_code(404); echo json_encode(['error' => 'Tag not found']); return; }
        $this->db->prepare('INSERT IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)')->execute([$taskId, $tagId]);
        echo json_encode(['success' => true]);
    }

    public function removeTagFromTask(int $taskId, int $tagId): void {
        $this->db->prepare('DELETE FROM task_tags WHERE task_id=? AND tag_id=?')->execute([$taskId, $tagId]);
        echo json_encode(['success' => true]);
    }
}
