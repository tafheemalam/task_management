<?php

class MailService {
    // Set this to the admin's email address
    const ADMIN_EMAIL = 'admin@taskmanager.com';
    const FROM_EMAIL  = 'noreply@taskmanager.com';
    const FROM_NAME   = 'TaskFlow';

    public static function sendAdminSubscriptionNotification(array $req): bool {
        $to      = self::ADMIN_EMAIL;
        $subject = 'New Subscription Request – ' . $req['company_name'];

        $discount = $req['discount_token']
            ? "<tr><td style='padding:4px 0;color:#6b7280;'>Discount Token</td><td style='padding:4px 0;font-weight:600;'>{$req['discount_token']} ({$req['discount_percentage']}% off)</td></tr>"
            : '';

        $body = self::wrap("
            <h2 style='margin:0 0 16px;color:#1e293b;font-size:18px;'>New Subscription Request</h2>
            <p style='margin:0 0 16px;color:#475569;'>A new company has submitted a subscription request and is awaiting your review.</p>
            <table style='width:100%;border-collapse:collapse;font-size:14px;'>
                <tr><td style='padding:4px 0;color:#6b7280;width:40%;'>Company</td><td style='padding:4px 0;font-weight:600;'>{$req['company_name']}</td></tr>
                <tr><td style='padding:4px 0;color:#6b7280;'>Email</td><td style='padding:4px 0;'>{$req['company_email']}</td></tr>
                <tr><td style='padding:4px 0;color:#6b7280;'>Phone</td><td style='padding:4px 0;'>" . ($req['company_phone'] ?: '—') . "</td></tr>
                <tr><td style='padding:4px 0;color:#6b7280;'>Manager</td><td style='padding:4px 0;'>{$req['manager_name']} ({$req['manager_email']})</td></tr>
                <tr><td style='padding:4px 0;color:#6b7280;'>Package</td><td style='padding:4px 0;'>{$req['package_name']}</td></tr>
                {$discount}
            </table>
            <p style='margin:24px 0 0;color:#475569;font-size:13px;'>Please log in to the admin panel to approve or reject this request.</p>
        ");

        return self::send($to, $subject, $body);
    }

    public static function sendApprovalEmail(array $req): bool {
        $to      = $req['manager_email'];
        $subject = 'Your TaskFlow Subscription has been Approved!';

        $body = self::wrap("
            <h2 style='margin:0 0 16px;color:#1e293b;font-size:18px;'>Subscription Approved</h2>
            <p style='margin:0 0 16px;color:#475569;'>Congratulations! Your subscription request for <strong>{$req['company_name']}</strong> has been approved.</p>
            <p style='margin:0 0 8px;color:#475569;'>You can now log in with the following credentials:</p>
            <table style='width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;'>
                <tr><td style='padding:4px 0;color:#6b7280;width:40%;'>Email</td><td style='padding:4px 0;font-weight:600;'>{$req['manager_email']}</td></tr>
                <tr><td style='padding:4px 0;color:#6b7280;'>Password</td><td style='padding:4px 0;'>The password you set during registration</td></tr>
                <tr><td style='padding:4px 0;color:#6b7280;'>Package</td><td style='padding:4px 0;'>{$req['package_name']}</td></tr>
            </table>
            <p style='margin:0;color:#475569;font-size:13px;'>Welcome aboard — the TaskFlow team is excited to have you!</p>
        ");

        return self::send($to, $subject, $body);
    }

    public static function sendRejectionEmail(array $req, string $reason = ''): bool {
        $to      = $req['manager_email'];
        $subject = 'Update on Your TaskFlow Subscription Request';

        $reasonHtml = $reason
            ? "<p style='margin:16px 0 0;padding:12px;background:#fef2f2;border-left:3px solid #ef4444;color:#991b1b;font-size:14px;'><strong>Reason:</strong> {$reason}</p>"
            : '';

        $body = self::wrap("
            <h2 style='margin:0 0 16px;color:#1e293b;font-size:18px;'>Subscription Request Update</h2>
            <p style='margin:0 0 16px;color:#475569;'>We regret to inform you that your subscription request for <strong>{$req['company_name']}</strong> has not been approved at this time.</p>
            {$reasonHtml}
            <p style='margin:16px 0 0;color:#475569;font-size:13px;'>If you believe this is an error or would like to discuss further, please contact our support team.</p>
        ");

        return self::send($to, $subject, $body);
    }

    private static function send(string $to, string $subject, string $htmlBody): bool {
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: " . self::FROM_NAME . " <" . self::FROM_EMAIL . ">\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";

        return @mail($to, $subject, $htmlBody, $headers);
    }

    private static function wrap(string $content): string {
        return "<!DOCTYPE html><html><body style='margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f8fafc;'>
            <div style='max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:32px;'>
                <div style='margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #f1f5f9;'>
                    <span style='font-size:20px;font-weight:700;color:#2563eb;'>TaskFlow</span>
                </div>
                {$content}
            </div>
        </body></html>";
    }
}
