<?php
class EmailService {

    public static function isEnabled(): bool {
        return filter_var(getenv('MAIL_ENABLED') ?: 'false', FILTER_VALIDATE_BOOLEAN);
    }

    public static function send(string $toEmail, string $toName, string $subject, string $htmlBody): bool {
        if (!self::isEnabled()) return false;
        $from     = getenv('MAIL_FROM')      ?: 'noreply@taskflow.app';
        $fromName = getenv('MAIL_FROM_NAME') ?: 'TaskFlow';
        $smtpHost = getenv('MAIL_SMTP_HOST') ?: '';
        $smtpPort = (int)(getenv('MAIL_SMTP_PORT') ?: 587);
        $smtpUser = getenv('MAIL_SMTP_USER') ?: '';
        $smtpPass = getenv('MAIL_SMTP_PASS') ?: '';

        if ($smtpHost && $smtpUser) {
            return self::sendSmtp($toEmail, $toName, $subject, $htmlBody, $from, $fromName, $smtpHost, $smtpPort, $smtpUser, $smtpPass);
        }
        $headers  = "MIME-Version: 1.0\r\nContent-type: text/html; charset=UTF-8\r\n";
        $headers .= "From: {$fromName} <{$from}>\r\n";
        return @mail($toEmail, $subject, $htmlBody, $headers);
    }

    private static function sendSmtp(string $to, string $toName, string $subject, string $html,
        string $from, string $fromName, string $host, int $port, string $user, string $pass): bool {
        try {
            $socket = @fsockopen("ssl://{$host}", $port, $errno, $errstr, 10);
            if (!$socket) $socket = @fsockopen("tls://{$host}", $port, $errno, $errstr, 10);
            if (!$socket) return false;
            fgets($socket, 512);
            fputs($socket, "EHLO taskflow\r\n");
            while ($l = fgets($socket, 512)) { if ($l[3] === ' ') break; }
            fputs($socket, "AUTH LOGIN\r\n");         fgets($socket, 512);
            fputs($socket, base64_encode($user)."\r\n"); fgets($socket, 512);
            fputs($socket, base64_encode($pass)."\r\n");
            $r = fgets($socket, 512);
            if (substr($r,0,3) !== '235') { fclose($socket); return false; }
            fputs($socket, "MAIL FROM:<{$from}>\r\n");  fgets($socket, 512);
            fputs($socket, "RCPT TO:<{$to}>\r\n");      fgets($socket, 512);
            fputs($socket, "DATA\r\n");                  fgets($socket, 512);
            $msg  = "From: {$fromName} <{$from}>\r\nTo: {$toName} <{$to}>\r\n";
            $msg .= "Subject: {$subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n";
            $msg .= $html . "\r\n.\r\n";
            fputs($socket, $msg); fgets($socket, 512);
            fputs($socket, "QUIT\r\n"); fclose($socket);
            return true;
        } catch (Throwable $e) { return false; }
    }

    public static function taskAssigned(string $toEmail, string $toName, string $taskTitle, string $projectName, string $byName): void {
        self::send($toEmail, $toName, "Task assigned: {$taskTitle}", self::tpl(
            "New Task Assigned",
            "<p>Hi <strong>{$toName}</strong>,</p>
             <p><strong>{$byName}</strong> assigned you a task:</p>
             <div style='border-left:4px solid #6366f1;background:#f8fafc;padding:16px;margin:16px 0;border-radius:6px'>
               <strong style='font-size:15px'>{$taskTitle}</strong><br>
               <span style='color:#64748b'>Project: {$projectName}</span>
             </div>"
        ));
    }

    public static function commentNotify(string $toEmail, string $toName, string $taskTitle, string $byName, string $content): void {
        self::send($toEmail, $toName, "New comment on: {$taskTitle}", self::tpl(
            "New Comment",
            "<p>Hi <strong>{$toName}</strong>,</p>
             <p><strong>{$byName}</strong> commented on <strong>{$taskTitle}</strong>:</p>
             <div style='border-left:4px solid #6366f1;background:#f8fafc;padding:16px;margin:16px 0;border-radius:6px;font-style:italic'>
               ".htmlspecialchars(substr($content,0,400))."
             </div>"
        ));
    }

    public static function mentionNotify(string $toEmail, string $toName, string $byName, string $taskTitle, string $content): void {
        self::send($toEmail, $toName, "You were mentioned by {$byName}", self::tpl(
            "You were mentioned",
            "<p>Hi <strong>{$toName}</strong>,</p>
             <p><strong>{$byName}</strong> mentioned you in <strong>{$taskTitle}</strong>:</p>
             <div style='border-left:4px solid #6366f1;background:#f8fafc;padding:16px;margin:16px 0;border-radius:6px;font-style:italic'>
               ".htmlspecialchars(substr($content,0,400))."
             </div>"
        ));
    }

    private static function tpl(string $title, string $body): string {
        return "<!DOCTYPE html><html><body style='font-family:system-ui,sans-serif;background:#f1f5f9;margin:0;padding:32px 16px'>
          <div style='max-width:540px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)'>
            <div style='background:linear-gradient(135deg,#6366f1,#3b82f6);padding:24px 32px'>
              <div style='color:#fff;font-size:20px;font-weight:700'>TaskFlow</div>
              <div style='color:rgba(255,255,255,0.8);font-size:13px'>{$title}</div>
            </div>
            <div style='padding:28px 32px;color:#1e293b'>{$body}</div>
            <div style='padding:16px 32px;background:#f8fafc;color:#94a3b8;font-size:11px;text-align:center'>
              TaskFlow — Project Management Platform
            </div>
          </div></body></html>";
    }
}
