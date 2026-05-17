<?php
class TotpService {

    private static string $base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(): string {
        $bytes = random_bytes(10); // 10 bytes = 80 bits -> 16 base32 chars
        return self::base32Encode($bytes);
    }

    public static function getQrUrl(string $secret, string $email, string $issuer = 'TaskFlow'): string {
        $otpauth = 'otpauth://totp/' . rawurlencode($issuer . ':' . $email)
            . '?secret=' . $secret
            . '&issuer=' . rawurlencode($issuer);
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . rawurlencode($otpauth);
    }

    public static function verify(string $secret, string $code, int $window = 1): bool {
        $code = trim($code);
        if (!preg_match('/^\d{6}$/', $code)) return false;
        $timeStep = (int)floor(time() / 30);
        for ($i = -$window; $i <= $window; $i++) {
            $computed = self::hotp($secret, $timeStep + $i);
            if (hash_equals($computed, $code)) return true;
        }
        return false;
    }

    private static function base32Encode(string $bytes): string {
        $chars = self::$base32Chars;
        $binaryStr = '';
        for ($i = 0; $i < strlen($bytes); $i++) {
            $binaryStr .= str_pad(decbin(ord($bytes[$i])), 8, '0', STR_PAD_LEFT);
        }
        $result = '';
        $pad = (8 - (strlen($binaryStr) % 8)) % 8;
        if ($pad > 0) $binaryStr .= str_repeat('0', $pad);
        $chunks = str_split($binaryStr, 5);
        foreach ($chunks as $chunk) {
            $result .= $chars[bindec($chunk)];
        }
        return $result;
    }

    private static function base32Decode(string $s): string {
        $chars = self::$base32Chars;
        $s = strtoupper($s);
        $binaryStr = '';
        for ($i = 0; $i < strlen($s); $i++) {
            $pos = strpos($chars, $s[$i]);
            if ($pos === false) continue;
            $binaryStr .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $result = '';
        $chunks = str_split($binaryStr, 8);
        foreach ($chunks as $chunk) {
            if (strlen($chunk) === 8) {
                $result .= chr(bindec($chunk));
            }
        }
        return $result;
    }

    private static function hotp(string $secret, int $counter): string {
        $keyBytes = self::base32Decode($secret);
        // Pack counter as 8-byte big-endian
        $msg = pack('N*', 0) . pack('N*', $counter);
        $hmac = hash_hmac('sha1', $msg, $keyBytes, true);
        $offset = ord($hmac[19]) & 0x0f;
        $code = (
            ((ord($hmac[$offset])     & 0x7f) << 24) |
            ((ord($hmac[$offset + 1]) & 0xff) << 16) |
            ((ord($hmac[$offset + 2]) & 0xff) << 8)  |
            ((ord($hmac[$offset + 3]) & 0xff))
        ) % 1000000;
        return str_pad((string)$code, 6, '0', STR_PAD_LEFT);
    }
}
