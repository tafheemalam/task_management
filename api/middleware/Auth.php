<?php
class Auth {
    private static string $secret = 'tm_secret_key_2024_change_in_prod';

    public static function generateToken(array $payload): string {
        $header = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload['iat'] = time();
        $payload['exp'] = time() + 86400 * 7; // 7 days
        $encodedPayload = base64_encode(json_encode($payload));
        $signature = base64_encode(hash_hmac('sha256', "$header.$encodedPayload", self::$secret, true));
        return "$header.$encodedPayload.$signature";
    }

    public static function verifyToken(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        [$header, $payload, $signature] = $parts;
        $expected = base64_encode(hash_hmac('sha256', "$header.$payload", self::$secret, true));
        if (!hash_equals($expected, $signature)) return null;
        $data = json_decode(base64_decode($payload), true);
        if (!$data || $data['exp'] < time()) return null;
        return $data;
    }

    public static function getUser(): ?array {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($authHeader, 'Bearer ')) return null;
        $token = substr($authHeader, 7);
        return self::verifyToken($token);
    }

    public static function requireAuth(string ...$roles): array {
        $user = self::getUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        if ($roles && !in_array($user['role'], $roles)) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }
        return $user;
    }

    public static function generateTempToken(int $userId): string {
        $header  = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = base64_encode(json_encode([
            'sub'  => $userId,
            'type' => '2fa_pending',
            'iat'  => time(),
            'exp'  => time() + 300,
        ]));
        $signature = base64_encode(hash_hmac('sha256', "$header.$payload", self::$secret, true));
        return "$header.$payload.$signature";
    }

    public static function verifyTempToken(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        [$header, $payload, $signature] = $parts;
        $expected = base64_encode(hash_hmac('sha256', "$header.$payload", self::$secret, true));
        if (!hash_equals($expected, $signature)) return null;
        $data = json_decode(base64_decode($payload), true);
        if (!$data || $data['exp'] < time()) return null;
        return $data;
    }

    public static function verifyApiKey(string $key): ?array {
        $db        = \Database::getInstance();
        $keyPrefix = substr($key, 0, 10);
        $keyHash   = hash('sha256', $key);

        $stmt = $db->prepare(
            'SELECT u.*, ak.company_id AS ak_company_id, ak.permissions, ak.id AS ak_id
             FROM api_keys ak
             JOIN users u ON ak.user_id = u.id
             WHERE ak.key_prefix = ? AND ak.key_hash = ? AND ak.is_active = 1'
        );
        $stmt->execute([$keyPrefix, $keyHash]);
        $row = $stmt->fetch();
        if (!$row) return null;

        // Update last_used_at
        $db->prepare('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?')
           ->execute([$row['ak_id']]);

        // Merge company_id from api_key row
        $row['company_id'] = $row['ak_company_id'];
        return $row;
    }
}
