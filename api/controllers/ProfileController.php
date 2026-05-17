<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/../services/TotpService.php';

class ProfileController {
    private PDO $db;
    private array $user;

    public function __construct() {
        $this->db   = Database::getInstance();
        $this->user = Auth::requireAuth('admin', 'manager', 'employee');
    }

    public function getProfile(): void {
        $stmt = $this->db->prepare(
            'SELECT id, name, email, role, totp_enabled FROM users WHERE id = ?'
        );
        $stmt->execute([$this->user['id']]);
        $profile = $stmt->fetch();
        if (!$profile) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            return;
        }
        $profile['totp_enabled'] = (bool)$profile['totp_enabled'];
        echo json_encode($profile);
    }

    public function setup2FA(): void {
        $secret = TotpService::generateSecret();
        $stmt = $this->db->prepare(
            'UPDATE users SET totp_secret = ? WHERE id = ?'
        );
        $stmt->execute([$secret, $this->user['id']]);

        $email  = $this->user['email'];
        $qrUrl  = TotpService::getQrUrl($secret, $email);
        echo json_encode(['secret' => $secret, 'qr_url' => $qrUrl]);
    }

    public function enable2FA(): void {
        $body = json_decode(file_get_contents('php://input'), true);
        $code = trim($body['code'] ?? '');

        $stmt = $this->db->prepare('SELECT totp_secret FROM users WHERE id = ?');
        $stmt->execute([$this->user['id']]);
        $row = $stmt->fetch();

        if (!$row || !$row['totp_secret']) {
            http_response_code(400);
            echo json_encode(['error' => 'Please set up 2FA first']);
            return;
        }

        if (!TotpService::verify($row['totp_secret'], $code)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid code. Please try again.']);
            return;
        }

        $this->db->prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?')
                 ->execute([$this->user['id']]);
        echo json_encode(['success' => true, 'message' => '2FA enabled successfully']);
    }

    public function disable2FA(): void {
        $body = json_decode(file_get_contents('php://input'), true);
        $code = trim($body['code'] ?? '');

        $stmt = $this->db->prepare('SELECT totp_secret FROM users WHERE id = ?');
        $stmt->execute([$this->user['id']]);
        $row = $stmt->fetch();

        if (!$row || !$row['totp_secret']) {
            http_response_code(400);
            echo json_encode(['error' => '2FA is not set up']);
            return;
        }

        if (!TotpService::verify($row['totp_secret'], $code)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid code. Please try again.']);
            return;
        }

        $this->db->prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?')
                 ->execute([$this->user['id']]);
        echo json_encode(['success' => true, 'message' => '2FA disabled successfully']);
    }
}
