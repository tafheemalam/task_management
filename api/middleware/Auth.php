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
}
