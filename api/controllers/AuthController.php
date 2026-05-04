<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class AuthController {
    public function login(): void {
        $body = json_decode(file_get_contents('php://input'), true);
        $email = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Email and password required']);
            return;
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT u.*, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.email = ? AND u.is_active = 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid credentials']);
            return;
        }

        $token = Auth::generateToken([
            'id' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'company_id' => $user['company_id'],
            'name' => $user['name'],
        ]);

        unset($user['password']);
        echo json_encode(['token' => $token, 'user' => $user]);
    }

    public function me(): void {
        $authUser = Auth::requireAuth();
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT u.id, u.name, u.email, u.role, u.company_id, u.can_create_tasks, u.is_active, u.created_at, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = ?');
        $stmt->execute([$authUser['id']]);
        $user = $stmt->fetch();
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            return;
        }
        echo json_encode($user);
    }
}
