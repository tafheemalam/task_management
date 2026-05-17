<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class ApiKeyController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $this->db       = Database::getInstance();
        $this->authUser = Auth::requireAuth('manager', 'admin');
    }

    private function companyId(): int {
        return (int)$this->authUser['company_id'];
    }

    public function list(): void {
        $stmt = $this->db->prepare(
            'SELECT id, name, key_prefix, permissions, last_used_at, is_active, created_at
             FROM api_keys WHERE company_id = ? ORDER BY created_at DESC'
        );
        $stmt->execute([$this->companyId()]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['permissions'] = $row['permissions'] ? json_decode($row['permissions'], true) : [];
            $row['is_active']   = (bool)$row['is_active'];
        }
        echo json_encode($rows);
    }

    public function create(): void {
        $body        = json_decode(file_get_contents('php://input'), true);
        $name        = trim($body['name'] ?? '');
        $permissions = $body['permissions'] ?? [];

        if (!$name) {
            http_response_code(400);
            echo json_encode(['error' => 'API key name is required']);
            return;
        }

        $rawKey    = 'tf_' . bin2hex(random_bytes(20)); // 3 + 1 + 40 = 44 chars
        $keyPrefix = substr($rawKey, 0, 10);
        $keyHash   = hash('sha256', $rawKey);

        $stmt = $this->db->prepare(
            'INSERT INTO api_keys (company_id, user_id, name, key_hash, key_prefix, permissions)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $this->companyId(),
            $this->authUser['id'],
            $name,
            $keyHash,
            $keyPrefix,
            json_encode($permissions),
        ]);
        $id = $this->db->lastInsertId();

        echo json_encode([
            'id'          => $id,
            'name'        => $name,
            'key'         => $rawKey,
            'key_prefix'  => $keyPrefix,
            'permissions' => $permissions,
            'is_active'   => true,
            'created_at'  => date('Y-m-d H:i:s'),
        ]);
    }

    public function delete(int $id): void {
        $stmt = $this->db->prepare(
            'DELETE FROM api_keys WHERE id = ? AND company_id = ?'
        );
        $stmt->execute([$id, $this->companyId()]);
        echo json_encode(['success' => true]);
    }

    public function toggle(int $id): void {
        $stmt = $this->db->prepare(
            'UPDATE api_keys SET is_active = NOT is_active WHERE id = ? AND company_id = ?'
        );
        $stmt->execute([$id, $this->companyId()]);
        echo json_encode(['success' => true]);
    }
}
