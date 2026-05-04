<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/stripe.php';
require_once __DIR__ . '/../services/MailService.php';

class SubscribeController {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function createPaymentIntent(): void {
        $b = json_decode(file_get_contents('php://input'), true);
        if (empty($b['package_id'])) { http_response_code(400); echo json_encode(['error' => 'package_id required']); return; }

        $pkg = $this->db->prepare('SELECT * FROM packages WHERE id=? AND is_active=1');
        $pkg->execute([$b['package_id']]);
        $package = $pkg->fetch();
        if (!$package) { http_response_code(400); echo json_encode(['error' => 'Package not found']); return; }

        $price = (float)$package['price'];

        // Apply discount if token provided
        if (!empty($b['discount_token'])) {
            $tok = $this->db->prepare("SELECT discount_percentage FROM discount_tokens WHERE token=? AND is_used=0 AND (expires_at IS NULL OR expires_at > NOW())");
            $tok->execute([$b['discount_token']]);
            $tokenRow = $tok->fetch();
            if ($tokenRow) {
                $price = round($price * (1 - $tokenRow['discount_percentage'] / 100), 2);
            }
        }

        // Stripe amounts are in the smallest currency unit (cents for USD)
        $amountCents = (int)round($price * 100);
        if ($amountCents < 50) { $amountCents = 50; } // Stripe minimum

        $intent = stripePost('/payment_intents', [
            'amount'                                => $amountCents,
            'currency'                              => 'usd',
            'automatic_payment_methods[enabled]'    => 'true',
            'metadata[package_id]'                  => $b['package_id'],
        ]);

        if (!empty($intent['error'])) {
            http_response_code(502);
            echo json_encode(['error' => $intent['error']['message'] ?? 'Payment provider error']);
            return;
        }

        echo json_encode([
            'client_secret'    => $intent['client_secret'],
            'amount'           => $price,
            'amount_cents'     => $amountCents,
            'publishable_key'  => STRIPE_PUBLISHABLE_KEY,
        ]);
    }

    public function submit(): void {
        $b = json_decode(file_get_contents('php://input'), true);

        // Required field validation
        $required = ['company_name', 'company_email', 'manager_name', 'manager_email', 'manager_password', 'package_id'];
        foreach ($required as $field) {
            if (empty($b[$field])) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing required field: ' . $field]);
                return;
            }
        }

        // Determine payment status
        $isTrial         = !empty($b['is_trial']) && $b['is_trial'] == '1';
        $paymentIntentId = null;
        $amountPaid      = null;
        $paymentStatus   = 'pending';

        if ($isTrial) {
            $paymentStatus = 'trial';
        } elseif (!empty($b['payment_intent_id'])) {
            $intent = stripeGet('/payment_intents/' . $b['payment_intent_id']);
            if (empty($intent['id']) || $intent['status'] !== 'succeeded') {
                http_response_code(402);
                echo json_encode(['error' => 'Payment has not been completed. Please check your card details and try again.']);
                return;
            }
            $paymentIntentId = $b['payment_intent_id'];
            $amountPaid      = $intent['amount'] / 100;
            $paymentStatus   = 'paid';
        }

        if (!filter_var($b['company_email'], FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid company email address']);
            return;
        }

        if (!filter_var($b['manager_email'], FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid manager email address']);
            return;
        }

        if (strlen($b['manager_password']) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 6 characters']);
            return;
        }

        // Verify package exists and is active
        $pkg = $this->db->prepare('SELECT * FROM packages WHERE id=? AND is_active=1');
        $pkg->execute([$b['package_id']]);
        $package = $pkg->fetch();
        if (!$package) {
            http_response_code(400);
            echo json_encode(['error' => 'Selected package is not available']);
            return;
        }

        // Check for duplicate pending request by manager email
        $dup = $this->db->prepare("SELECT id FROM subscription_requests WHERE manager_email=? AND status='pending'");
        $dup->execute([$b['manager_email']]);
        if ($dup->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'A pending request already exists for this email address']);
            return;
        }

        // Check manager email not already a registered user
        $userExists = $this->db->prepare('SELECT id FROM users WHERE email=?');
        $userExists->execute([$b['manager_email']]);
        if ($userExists->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'This email address is already registered']);
            return;
        }

        // Validate discount token if provided
        $discountToken      = null;
        $discountPercentage = null;
        if (!empty($b['discount_token'])) {
            $tok = $this->db->prepare("SELECT * FROM discount_tokens WHERE token=? AND is_used=0 AND (expires_at IS NULL OR expires_at > NOW())");
            $tok->execute([$b['discount_token']]);
            $tokenRow = $tok->fetch();
            if (!$tokenRow) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid or expired discount token']);
                return;
            }
            $discountToken      = $b['discount_token'];
            $discountPercentage = $tokenRow['discount_percentage'];
        }

        // Store hashed password
        $hashedPassword = password_hash($b['manager_password'], PASSWORD_BCRYPT);

        $stmt = $this->db->prepare('INSERT INTO subscription_requests
            (company_name, company_email, company_phone, company_address, manager_name, manager_email, manager_password, package_id, discount_token, discount_percentage, is_trial, payment_intent_id, payment_status, amount_paid)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $b['company_name'],
            $b['company_email'],
            $b['company_phone'] ?? null,
            $b['company_address'] ?? null,
            $b['manager_name'],
            $b['manager_email'],
            $hashedPassword,
            $b['package_id'],
            $discountToken,
            $discountPercentage,
            $isTrial ? 1 : 0,
            $paymentIntentId,
            $paymentStatus,
            $amountPaid,
        ]);

        // Notify admin by email
        MailService::sendAdminSubscriptionNotification([
            'company_name'        => $b['company_name'],
            'company_email'       => $b['company_email'],
            'company_phone'       => $b['company_phone'] ?? null,
            'manager_name'        => $b['manager_name'],
            'manager_email'       => $b['manager_email'],
            'package_name'        => $package['name'],
            'discount_token'      => $discountToken,
            'discount_percentage' => $discountPercentage,
        ]);

        echo json_encode(['success' => true, 'message' => 'Subscription request submitted. You will receive an email once your request is reviewed.']);
    }

    public function listPackages(): void {
        $rows = $this->db->query('SELECT id, name, type, price, max_users, description FROM packages WHERE is_active=1 ORDER BY price ASC')->fetchAll();
        echo json_encode($rows);
    }
}
