<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/Auth.php';

class WebhookController {
    private PDO $db;
    private array $authUser;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->authUser = Auth::requireAuth('manager');
    }

    private function companyId(): int { return (int)$this->authUser['company_id']; }

    public function list(): void {
        $cid = $this->companyId();
        $stmt = $this->db->prepare('SELECT * FROM webhooks WHERE company_id=? ORDER BY created_at DESC');
        $stmt->execute([$cid]);
        echo json_encode($stmt->fetchAll());
    }

    public function create(): void {
        $cid = $this->companyId();
        $b   = json_decode(file_get_contents('php://input'), true);
        if (empty($b['name']) || empty($b['url'])) {
            http_response_code(400); echo json_encode(['error'=>'Name and URL are required']); return;
        }
        if (!filter_var($b['url'], FILTER_VALIDATE_URL)) {
            http_response_code(400); echo json_encode(['error'=>'Invalid URL']); return;
        }
        $secret = bin2hex(random_bytes(16));
        $events = json_encode($b['events'] ?? ['task.created','task.updated','comment.created']);
        $stmt = $this->db->prepare('INSERT INTO webhooks (company_id, name, url, secret, events) VALUES (?,?,?,?,?)');
        $stmt->execute([$cid, $b['name'], $b['url'], $secret, $events]);
        $id = $this->db->lastInsertId();
        $row = $this->db->prepare('SELECT * FROM webhooks WHERE id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    public function update(int $id): void {
        $cid = $this->companyId();
        $b   = json_decode(file_get_contents('php://input'), true);
        $check = $this->db->prepare('SELECT id FROM webhooks WHERE id=? AND company_id=?');
        $check->execute([$id, $cid]);
        if (!$check->fetch()) { http_response_code(404); echo json_encode(['error'=>'Webhook not found']); return; }
        $events = json_encode($b['events'] ?? []);
        $this->db->prepare('UPDATE webhooks SET name=?, url=?, events=?, is_active=? WHERE id=?')
                 ->execute([$b['name'], $b['url'], $events, $b['is_active'] ?? 1, $id]);
        $row = $this->db->prepare('SELECT * FROM webhooks WHERE id=?');
        $row->execute([$id]);
        echo json_encode($row->fetch());
    }

    public function delete(int $id): void {
        $cid = $this->companyId();
        $this->db->prepare('DELETE FROM webhooks WHERE id=? AND company_id=?')->execute([$id, $cid]);
        echo json_encode(['success'=>true]);
    }

    public function test(int $id): void {
        $cid = $this->companyId();
        $wh  = $this->db->prepare('SELECT * FROM webhooks WHERE id=? AND company_id=?');
        $wh->execute([$id, $cid]);
        $webhook = $wh->fetch();
        if (!$webhook) { http_response_code(404); echo json_encode(['error'=>'Webhook not found']); return; }
        $payload = json_encode(['event'=>'webhook.test','timestamp'=>time(),'company_id'=>$cid]);
        $result  = self::deliver($webhook['url'], $webhook['secret'], $payload);
        echo json_encode(['success'=>$result['ok'], 'status'=>$result['status'], 'response'=>$result['body']]);
    }

    public static function fire(PDO $db, int $companyId, string $event, array $data): void {
        try {
            $whs = $db->prepare("SELECT * FROM webhooks WHERE company_id=? AND is_active=1 AND JSON_CONTAINS(events, JSON_QUOTE(?))");
            $whs->execute([$companyId, $event]);
            $payload = json_encode(['event'=>$event,'timestamp'=>time(),'data'=>$data]);
            foreach ($whs->fetchAll() as $wh) {
                self::deliver($wh['url'], $wh['secret'], $payload);
                $db->prepare('UPDATE webhooks SET last_triggered_at=NOW() WHERE id=?')->execute([$wh['id']]);
            }
        } catch (\Throwable $e) {
            // Silently ignore webhook delivery errors so they don't break the main request
        }
    }

    private static function deliver(string $url, string $secret, string $payload): array {
        $sig = 'sha256='.hash_hmac('sha256', $payload, $secret);
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\nX-TaskFlow-Signature: {$sig}\r\nX-TaskFlow-Event: webhook\r\n",
            'content' => $payload,
            'timeout' => 8,
            'ignore_errors' => true,
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $status = isset($http_response_header[0]) ? (int)explode(' ', $http_response_header[0])[1] : 0;
        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => substr($body ?: '', 0, 500)];
    }
}
