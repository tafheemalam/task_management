<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class NotificationController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->authUser = Auth::requireAuth('employee', 'manager');
    }

    public function list(): void {
        $uid = $this->authUser['id'];
        $stmt = $this->db->prepare(
            'SELECT n.*, t.title as task_title FROM notifications n
             LEFT JOIN tasks t ON n.task_id = t.id
             WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 30'
        );
        $stmt->execute([$uid]);
        $rows = $stmt->fetchAll();
        $unreadCount = count(array_filter($rows, fn($r) => !$r['is_read']));
        echo json_encode(['notifications' => $rows, 'unread_count' => $unreadCount]);
    }

    public function markRead(int $id): void {
        $uid = $this->authUser['id'];
        $this->db->prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?')->execute([$id, $uid]);
        echo json_encode(['success' => true]);
    }

    public function markAllRead(): void {
        $uid = $this->authUser['id'];
        $this->db->prepare('UPDATE notifications SET is_read=1 WHERE user_id=?')->execute([$uid]);
        echo json_encode(['success' => true]);
    }

    public static function create(PDO $db, int $userId, string $type, string $message, ?int $taskId = null): void {
        $stmt = $db->prepare('INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)');
        $stmt->execute([$userId, $type, $message, $taskId]);
    }
}
