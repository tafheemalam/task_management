<?php
require_once __DIR__ . '/../config/Database.php';

class ClientShareController {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function getShare(string $token): void {
        $stmt = $this->db->prepare(
            'SELECT cs.*, w.name as workflow_name, w.description as workflow_description
             FROM client_shares cs
             JOIN workflows w ON cs.workflow_id = w.id
             WHERE cs.token = ? AND cs.is_active = 1
               AND (cs.expires_at IS NULL OR cs.expires_at > NOW())'
        );
        $stmt->execute([$token]);
        $share = $stmt->fetch();

        if (!$share) {
            http_response_code(404);
            echo json_encode(['error' => 'Share link not found or has expired']);
            return;
        }

        $wfId = (int)$share['workflow_id'];

        $stagesStmt = $this->db->prepare(
            'SELECT id, name, color, sort_order FROM workflow_stages
             WHERE workflow_id = ? ORDER BY sort_order'
        );
        $stagesStmt->execute([$wfId]);
        $stages = $stagesStmt->fetchAll();

        $tasksStmt = $this->db->prepare(
            'SELECT t.id, t.title, t.description, t.priority, t.due_date, t.stage_id,
                    u.name as assignee_name,
                    ws.name as stage_name, ws.color as stage_color,
                    DATEDIFF(NOW(), COALESCE(t.stage_updated_at, t.created_at)) as days_since_moved
             FROM tasks t
             LEFT JOIN users u ON t.assignee_id = u.id
             LEFT JOIN workflow_stages ws ON t.stage_id = ws.id
             WHERE t.workflow_id = ? AND t.parent_task_id IS NULL
             ORDER BY FIELD(t.priority, "high", "medium", "low"), t.due_date ASC'
        );
        $tasksStmt->execute([$wfId]);
        $tasks = $tasksStmt->fetchAll();

        echo json_encode([
            'status'   => 'ok',
            'workflow' => [
                'name'        => $share['workflow_name'],
                'description' => $share['workflow_description'],
                'label'       => $share['label'],
            ],
            'stages' => $stages,
            'tasks'  => $tasks,
        ]);
    }
}
