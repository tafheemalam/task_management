<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/../services/MailService.php';

class AdminController {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function stats(): void {
        Auth::requireAuth('admin');
        $companies       = $this->db->query('SELECT COUNT(*) FROM companies')->fetchColumn();
        $activeCompanies = $this->db->query('SELECT COUNT(*) FROM companies WHERE is_active=1')->fetchColumn();
        $managers        = $this->db->query("SELECT COUNT(*) FROM users WHERE role='manager' AND is_active=1")->fetchColumn();
        $packages        = $this->db->query('SELECT COUNT(*) FROM packages WHERE is_active=1')->fetchColumn();
        $tokens          = $this->db->query('SELECT COUNT(*) FROM discount_tokens WHERE is_used=0')->fetchColumn();
        $pendingReq      = $this->db->query("SELECT COUNT(*) FROM subscription_requests WHERE status='pending'")->fetchColumn();
        $approvedReq     = $this->db->query("SELECT COUNT(*) FROM subscription_requests WHERE status='approved'")->fetchColumn();
        $rejectedReq     = $this->db->query("SELECT COUNT(*) FROM subscription_requests WHERE status='rejected'")->fetchColumn();

        $byPackage = $this->db->query(
            "SELECT p.name AS package_name, COUNT(c.id) AS company_count
             FROM packages p
             LEFT JOIN companies c ON c.package_id = p.id AND c.is_active = 1
             WHERE p.is_active = 1
             GROUP BY p.id, p.name
             ORDER BY company_count DESC"
        )->fetchAll();

        echo json_encode(compact(
            'companies', 'activeCompanies', 'managers', 'packages',
            'tokens', 'pendingReq', 'approvedReq', 'rejectedReq', 'byPackage'
        ));
    }

    // ── Packages ──────────────────────────────────────────────────────────────

    public function listPackages(): void {
        Auth::requireAuth('admin');
        $rows = $this->db->query('SELECT * FROM packages ORDER BY price ASC')->fetchAll();
        echo json_encode($rows);
    }

    public function createPackage(): void {
        Auth::requireAuth('admin');
        $b = json_decode(file_get_contents('php://input'), true);
        $stmt = $this->db->prepare('INSERT INTO packages (name, type, price, max_users, description) VALUES (?,?,?,?,?)');
        $stmt->execute([$b['name'], $b['type'] ?? 'monthly', $b['price'] ?? 0, $b['max_users'] ?? 10, $b['description'] ?? '']);
        $id = $this->db->lastInsertId();
        $pkg = $this->db->prepare('SELECT * FROM packages WHERE id=?');
        $pkg->execute([$id]);
        echo json_encode($pkg->fetch());
    }

    public function updatePackage(int $id): void {
        Auth::requireAuth('admin');
        $b = json_decode(file_get_contents('php://input'), true);
        $stmt = $this->db->prepare('UPDATE packages SET name=?, type=?, price=?, max_users=?, description=?, is_active=? WHERE id=?');
        $stmt->execute([$b['name'], $b['type'] ?? 'monthly', $b['price'] ?? 0, $b['max_users'] ?? 10, $b['description'] ?? '', $b['is_active'] ?? 1, $id]);
        $pkg = $this->db->prepare('SELECT * FROM packages WHERE id=?');
        $pkg->execute([$id]);
        echo json_encode($pkg->fetch());
    }

    public function deletePackage(int $id): void {
        Auth::requireAuth('admin');
        $this->db->prepare('UPDATE packages SET is_active=0 WHERE id=?')->execute([$id]);
        echo json_encode(['success' => true]);
    }

    // ── Companies ─────────────────────────────────────────────────────────────

    public function listCompanies(): void {
        Auth::requireAuth('admin');
        $rows = $this->db->query('SELECT c.*, p.name as package_name, u.name as manager_name, u.email as manager_email FROM companies c LEFT JOIN packages p ON c.package_id=p.id LEFT JOIN users u ON u.company_id=c.id AND u.role="manager" ORDER BY c.created_at DESC')->fetchAll();
        echo json_encode($rows);
    }

    public function createCompany(): void {
        Auth::requireAuth('admin');
        $b = json_decode(file_get_contents('php://input'), true);

        if (empty($b['name']) || empty($b['manager_name']) || empty($b['manager_email']) || empty($b['manager_password'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Company name, manager name, email and password are required']);
            return;
        }

        // Check manager email uniqueness
        $exists = $this->db->prepare('SELECT id FROM users WHERE email=?');
        $exists->execute([$b['manager_email']]);
        if ($exists->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Manager email already exists']);
            return;
        }

        // Validate discount token if provided
        $discountCode = null;
        if (!empty($b['discount_code'])) {
            $tok = $this->db->prepare("SELECT * FROM discount_tokens WHERE token=? AND is_used=0 AND (expires_at IS NULL OR expires_at > NOW())");
            $tok->execute([$b['discount_code']]);
            $token = $tok->fetch();
            if (!$token) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid or expired discount code']);
                return;
            }
            $discountCode = $b['discount_code'];
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('INSERT INTO companies (name, email, phone, address, package_id, package_starts_at, package_expires_at, discount_code) VALUES (?,?,?,?,?,?,?,?)');
            $stmt->execute([$b['name'], $b['email'] ?? null, $b['phone'] ?? null, $b['address'] ?? null, $b['package_id'] ?? null, $b['package_starts_at'] ?? null, $b['package_expires_at'] ?? null, $discountCode]);
            $companyId = $this->db->lastInsertId();

            $hash = password_hash($b['manager_password'], PASSWORD_BCRYPT);
            $mu = $this->db->prepare('INSERT INTO users (name, email, password, role, company_id) VALUES (?,?,?,?,?)');
            $mu->execute([$b['manager_name'], $b['manager_email'], $hash, 'manager', $companyId]);

            if ($discountCode) {
                $this->db->prepare("UPDATE discount_tokens SET is_used=1, used_by_company_id=?, used_at=NOW() WHERE token=?")->execute([$companyId, $discountCode]);
            }

            $this->db->commit();

            $company = $this->db->prepare('SELECT c.*, p.name as package_name FROM companies c LEFT JOIN packages p ON c.package_id=p.id WHERE c.id=?');
            $company->execute([$companyId]);
            echo json_encode($company->fetch());
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function updateCompany(int $id): void {
        Auth::requireAuth('admin');
        $b = json_decode(file_get_contents('php://input'), true);
        $stmt = $this->db->prepare('UPDATE companies SET name=?, email=?, phone=?, address=?, package_id=?, package_starts_at=?, package_expires_at=?, is_active=? WHERE id=?');
        $stmt->execute([$b['name'], $b['email'] ?? null, $b['phone'] ?? null, $b['address'] ?? null, $b['package_id'] ?? null, $b['package_starts_at'] ?? null, $b['package_expires_at'] ?? null, $b['is_active'] ?? 1, $id]);
        $company = $this->db->prepare('SELECT * FROM companies WHERE id=?');
        $company->execute([$id]);
        echo json_encode($company->fetch());
    }

    public function toggleManagerStatus(int $id): void {
        Auth::requireAuth('admin');
        $stmt = $this->db->prepare("SELECT id, is_active FROM users WHERE id=? AND role='manager'");
        $stmt->execute([$id]);
        $manager = $stmt->fetch();
        if (!$manager) {
            http_response_code(404);
            echo json_encode(['error' => 'Manager not found']);
            return;
        }
        $newStatus = $manager['is_active'] ? 0 : 1;
        $this->db->prepare('UPDATE users SET is_active=? WHERE id=?')->execute([$newStatus, $id]);
        echo json_encode(['is_active' => $newStatus]);
    }

    public function listManagers(): void {
        Auth::requireAuth('admin');
        $rows = $this->db->query("SELECT u.id, u.name, u.email, u.is_active, u.created_at, c.name as company_name, c.id as company_id FROM users u LEFT JOIN companies c ON u.company_id=c.id WHERE u.role='manager' ORDER BY u.created_at DESC")->fetchAll();
        echo json_encode($rows);
    }

    // ── Discount Tokens ───────────────────────────────────────────────────────

    public function listTokens(): void {
        Auth::requireAuth('admin');
        $rows = $this->db->query("SELECT dt.*, c.name as company_name FROM discount_tokens dt LEFT JOIN companies c ON dt.used_by_company_id=c.id ORDER BY dt.created_at DESC")->fetchAll();
        echo json_encode($rows);
    }

    public function createToken(): void {
        Auth::requireAuth('admin');
        $b = json_decode(file_get_contents('php://input'), true);
        $token = strtoupper(substr(bin2hex(random_bytes(6)), 0, 8) . '-' . substr(bin2hex(random_bytes(4)), 0, 4));
        $pct = $b['discount_percentage'] ?? 10;
        $exp = !empty($b['expires_at']) ? $b['expires_at'] : null;
        $stmt = $this->db->prepare('INSERT INTO discount_tokens (token, discount_percentage, expires_at) VALUES (?,?,?)');
        $stmt->execute([$token, $pct, $exp]);
        $id = $this->db->lastInsertId();
        $row = $this->db->prepare('SELECT * FROM discount_tokens WHERE id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    // ── Subscription Requests ─────────────────────────────────────────────────

    public function listSubscriptionRequests(): void {
        Auth::requireAuth('admin');
        $rows = $this->db->query('SELECT sr.*, p.name as package_name, p.price as package_price, p.type as package_type
            FROM subscription_requests sr
            JOIN packages p ON sr.package_id = p.id
            ORDER BY sr.created_at DESC')->fetchAll();
        echo json_encode($rows);
    }

    public function approveSubscriptionRequest(int $id): void {
        Auth::requireAuth('admin');

        $req = $this->db->prepare("SELECT sr.*, p.name as package_name FROM subscription_requests sr JOIN packages p ON sr.package_id=p.id WHERE sr.id=? AND sr.status='pending'");
        $req->execute([$id]);
        $request = $req->fetch();
        if (!$request) {
            http_response_code(404);
            echo json_encode(['error' => 'Pending subscription request not found']);
            return;
        }

        // Check manager email still free
        $emailCheck = $this->db->prepare('SELECT id FROM users WHERE email=?');
        $emailCheck->execute([$request['manager_email']]);
        if ($emailCheck->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Manager email is already registered']);
            return;
        }

        $this->db->beginTransaction();
        try {
            // Create company
            $companyStmt = $this->db->prepare('INSERT INTO companies (name, email, phone, address, package_id, package_starts_at, discount_code) VALUES (?,?,?,?,?,CURDATE(),?)');
            $companyStmt->execute([
                $request['company_name'],
                $request['company_email'],
                $request['company_phone'],
                $request['company_address'],
                $request['package_id'],
                $request['discount_token'],
            ]);
            $companyId = $this->db->lastInsertId();

            // Create manager user (password already hashed at request time)
            $userStmt = $this->db->prepare('INSERT INTO users (name, email, password, role, company_id) VALUES (?,?,?,?,?)');
            $userStmt->execute([$request['manager_name'], $request['manager_email'], $request['manager_password'], 'manager', $companyId]);

            // Mark discount token as used if applicable
            if ($request['discount_token']) {
                $this->db->prepare("UPDATE discount_tokens SET is_used=1, used_by_company_id=?, used_at=NOW() WHERE token=?")->execute([$companyId, $request['discount_token']]);
            }

            // Mark request as approved
            $this->db->prepare("UPDATE subscription_requests SET status='approved', updated_at=NOW() WHERE id=?")->execute([$id]);

            $this->db->commit();

            // Send approval email to manager
            MailService::sendApprovalEmail([
                'manager_email' => $request['manager_email'],
                'manager_name'  => $request['manager_name'],
                'company_name'  => $request['company_name'],
                'package_name'  => $request['package_name'],
            ]);

            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function rejectSubscriptionRequest(int $id): void {
        Auth::requireAuth('admin');
        $b = json_decode(file_get_contents('php://input'), true);

        $req = $this->db->prepare("SELECT sr.*, p.name as package_name FROM subscription_requests sr JOIN packages p ON sr.package_id=p.id WHERE sr.id=? AND sr.status='pending'");
        $req->execute([$id]);
        $request = $req->fetch();
        if (!$request) {
            http_response_code(404);
            echo json_encode(['error' => 'Pending subscription request not found']);
            return;
        }

        $reason = trim($b['reason'] ?? '');
        $this->db->prepare("UPDATE subscription_requests SET status='rejected', rejection_reason=?, updated_at=NOW() WHERE id=?")->execute([$reason ?: null, $id]);

        MailService::sendRejectionEmail([
            'manager_email' => $request['manager_email'],
            'manager_name'  => $request['manager_name'],
            'company_name'  => $request['company_name'],
        ], $reason);

        echo json_encode(['success' => true]);
    }
}
