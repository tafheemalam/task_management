<?php
// SSE must be handled before JSON headers
$_sseUri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (preg_match('#^/api/sse$#', $_sseUri)) {
    require_once __DIR__ . '/sse_handler.php';
    exit;
}

// Suppress PHP notices/warnings so they don't corrupt JSON responses
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', '0');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/middleware/Auth.php';
require_once __DIR__ . '/services/TotpService.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/AdminController.php';
require_once __DIR__ . '/controllers/ManagerController.php';
require_once __DIR__ . '/controllers/EmployeeController.php';
require_once __DIR__ . '/controllers/SubscribeController.php';
require_once __DIR__ . '/controllers/NotificationController.php';
require_once __DIR__ . '/controllers/TagController.php';
require_once __DIR__ . '/controllers/WebhookController.php';
require_once __DIR__ . '/controllers/ProfileController.php';
require_once __DIR__ . '/controllers/ApiKeyController.php';
require_once __DIR__ . '/controllers/PublicApiController.php';
require_once __DIR__ . '/config/stripe.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Strip /api prefix
$path = preg_replace('#^/api#', '', $uri);
$path = rtrim($path, '/') ?: '/';
$segments = explode('/', trim($path, '/'));

try {
    // Public API v1 routes (API key auth)
    if (str_starts_with($path, '/v1/')) {
        $ctrl = new PublicApiController();
        if ($path === '/v1/tasks' && $method === 'GET')  { $ctrl->listTasks(); exit; }
        if ($path === '/v1/tasks' && $method === 'POST') { $ctrl->createTask(); exit; }
        if ($path === '/v1/projects' && $method === 'GET') { $ctrl->listProjects(); exit; }
        if (preg_match('#^/v1/tasks/(\d+)$#', $path, $m)) {
            if ($method === 'GET')   { $ctrl->getTask((int)$m[1]); exit; }
            if ($method === 'PATCH') { $ctrl->updateTask((int)$m[1]); exit; }
        }
        http_response_code(404); echo json_encode(['error' => 'Not found']); exit;
    }

    // Auth routes
    if ($path === '/auth/login' && $method === 'POST') { (new AuthController())->login(); exit; }
    if ($path === '/auth/me' && $method === 'GET') { (new AuthController())->me(); exit; }
    if ($path === '/auth/2fa/verify' && $method === 'POST') { (new AuthController())->verify2FA(); exit; }

    // Profile routes
    if ($path === '/profile' && $method === 'GET')  { (new ProfileController())->getProfile(); exit; }
    if ($path === '/profile/2fa/setup' && $method === 'POST')   { (new ProfileController())->setup2FA(); exit; }
    if ($path === '/profile/2fa/enable' && $method === 'POST')  { (new ProfileController())->enable2FA(); exit; }
    if ($path === '/profile/2fa/disable' && $method === 'POST') { (new ProfileController())->disable2FA(); exit; }

    // API Keys routes (manager/admin)
    if ($path === '/api-keys' && $method === 'GET')  { (new ApiKeyController())->list(); exit; }
    if ($path === '/api-keys' && $method === 'POST') { (new ApiKeyController())->create(); exit; }
    if (preg_match('#^/api-keys/(\d+)$#', $path, $m) && $method === 'DELETE') { (new ApiKeyController())->delete((int)$m[1]); exit; }
    if (preg_match('#^/api-keys/(\d+)/toggle$#', $path, $m) && $method === 'PATCH') { (new ApiKeyController())->toggle((int)$m[1]); exit; }

    // Settings branding (any auth role)
    if ($path === '/settings/branding' && $method === 'GET') {
        $user = Auth::requireAuth('admin', 'manager', 'employee');
        $db   = Database::getInstance();
        $stmt = $db->prepare('SELECT * FROM company_settings WHERE company_id=?');
        $stmt->execute([$user['company_id']]);
        $row = $stmt->fetch();
        if (!$row) {
            echo json_encode([
                'company_id'           => $user['company_id'],
                'logo_url'             => null,
                'primary_color'        => '#6366f1',
                'secondary_color'      => '#3b82f6',
                'company_display_name' => null,
            ]);
        } else {
            echo json_encode($row);
        }
        exit;
    }

    // Search (regex routes, before role blocks)
    if (preg_match('#^/(manager|employee)/search$#', $path) && $method === 'GET') {
        $role = $segments[0];
        if ($role === 'manager') (new ManagerController())->search();
        else (new EmployeeController())->search();
        exit;
    }

    // Webhooks
    if ($path === '/manager/webhooks' && $method === 'GET')  { (new WebhookController())->list();   exit; }
    if ($path === '/manager/webhooks' && $method === 'POST') { (new WebhookController())->create(); exit; }
    if (preg_match('#^/manager/webhooks/(\d+)$#', $path, $m)) {
        $wh = new WebhookController();
        if ($method === 'PUT')    { $wh->update((int)$m[1]); exit; }
        if ($method === 'DELETE') { $wh->delete((int)$m[1]); exit; }
    }
    if (preg_match('#^/manager/webhooks/(\d+)/test$#', $path, $m) && $method === 'POST') {
        (new WebhookController())->test((int)$m[1]); exit;
    }

    // Public subscription routes (no auth required)
    if ($path === '/subscribe' && $method === 'POST') { (new SubscribeController())->submit(); exit; }
    if ($path === '/subscribe/packages' && $method === 'GET') { (new SubscribeController())->listPackages(); exit; }
    if ($path === '/subscribe/payment-intent' && $method === 'POST') { (new SubscribeController())->createPaymentIntent(); exit; }

    // Tags (both roles)
    if ($path === '/tags' && $method === 'GET') { (new TagController())->listTags(); exit; }
    if ($path === '/tags' && $method === 'POST') { (new TagController())->createTag(); exit; }
    if (preg_match('#^/tags/(\d+)$#', $path, $m) && $method === 'DELETE') { (new TagController())->deleteTag((int)$m[1]); exit; }
    if (preg_match('#^/(manager|employee)/tasks/(\d+)/tags$#', $path, $m) && $method === 'POST') {
        (new TagController())->addTagToTask((int)$m[2]); exit;
    }
    if (preg_match('#^/(manager|employee)/tasks/(\d+)/tags/(\d+)$#', $path, $m) && $method === 'DELETE') {
        (new TagController())->removeTagFromTask((int)$m[2], (int)$m[3]); exit;
    }

    // Notifications
    if (preg_match('#^/(manager|employee)/notifications$#', $path) && $method === 'GET') { (new NotificationController())->list(); exit; }
    if (preg_match('#^/(manager|employee)/notifications/all/read$#', $path) && $method === 'PUT') { (new NotificationController())->markAllRead(); exit; }
    if (preg_match('#^/(manager|employee)/notifications/(\d+)/read$#', $path, $m) && $method === 'PUT') { (new NotificationController())->markRead((int)$m[2]); exit; }

    // Admin routes
    if ($segments[0] === 'admin') {
        $admin = new AdminController();
        $sub = $segments[1] ?? '';
        $id = isset($segments[2]) ? (int)$segments[2] : null;
        $action = $segments[3] ?? '';

        match(true) {
            $sub === 'stats' && $method === 'GET' => $admin->stats(),
            $sub === 'packages' && $method === 'GET' => $admin->listPackages(),
            $sub === 'packages' && $method === 'POST' => $admin->createPackage(),
            $sub === 'packages' && $id && $method === 'PUT' => $admin->updatePackage($id),
            $sub === 'packages' && $id && $method === 'DELETE' => $admin->deletePackage($id),
            $sub === 'companies' && $method === 'GET' => $admin->listCompanies(),
            $sub === 'companies' && $method === 'POST' => $admin->createCompany(),
            $sub === 'companies' && $id && $method === 'PUT' => $admin->updateCompany($id),
            $sub === 'managers' && $method === 'GET' => $admin->listManagers(),
            $sub === 'managers' && $id && $action === 'toggle-status' && $method === 'PUT' => $admin->toggleManagerStatus($id),
            $sub === 'discount-tokens' && $method === 'GET' => $admin->listTokens(),
            $sub === 'discount-tokens' && $method === 'POST' => $admin->createToken(),
            $sub === 'subscription-requests' && $method === 'GET' => $admin->listSubscriptionRequests(),
            $sub === 'subscription-requests' && $id && $action === 'approve' && $method === 'PUT' => $admin->approveSubscriptionRequest($id),
            $sub === 'subscription-requests' && $id && $action === 'reject' && $method === 'PUT' => $admin->rejectSubscriptionRequest($id),
            $sub === 'branding' && $id && $method === 'GET' => $admin->getBranding($id),
            $sub === 'branding' && $id && $method === 'PUT' => $admin->saveBranding($id),
            default => (function() { http_response_code(404); echo json_encode(['error' => 'Not found']); })()
        };
        exit;
    }

    // Subtask routes (manager + employee)
    if (preg_match('#^/(manager|employee)/tasks/(\d+)/subtasks$#', $path, $m)) {
        $ctrl = $m[1] === 'manager' ? new ManagerController() : new EmployeeController();
        match($method) {
            'GET'  => $ctrl->listSubtasks((int)$m[2]),
            'POST' => $ctrl->createSubtask((int)$m[2]),
            default => (function() { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); })()
        };
        exit;
    }
    if (preg_match('#^/(manager|employee)/tasks/(\d+)/subtasks/(\d+)$#', $path, $m)) {
        $ctrl = $m[1] === 'manager' ? new ManagerController() : new EmployeeController();
        match($method) {
            'PUT'    => $ctrl->updateSubtask((int)$m[2], (int)$m[3]),
            'DELETE' => $ctrl->deleteSubtask((int)$m[2], (int)$m[3]),
            default  => (function() { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); })()
        };
        exit;
    }

    // Duplicate task (manager + employee)
    if (preg_match('#^/(manager|employee)/tasks/(\d+)/duplicate$#', $path, $m) && $method === 'POST') {
        $ctrl = $m[1] === 'manager' ? new ManagerController() : new EmployeeController();
        $ctrl->duplicateTask((int)$m[2]);
        exit;
    }

    // Task Templates — read-only for employees
    if ($path === '/employee/task-templates' && $method === 'GET') {
        $user = Auth::requireAuth('employee', 'manager');
        $db   = Database::getInstance();
        $stmt = $db->prepare('SELECT tt.*, u.name as created_by_name FROM task_templates tt JOIN users u ON tt.created_by=u.id WHERE tt.company_id=? ORDER BY tt.name');
        $stmt->execute([$user['company_id']]);
        echo json_encode(['status'=>'ok','data'=>$stmt->fetchAll()]);
        exit;
    }

    // Task Templates
    if ($path === '/manager/task-templates') {
        $ctrl = new ManagerController();
        match($method) {
            'GET'  => $ctrl->listTaskTemplates(),
            'POST' => $ctrl->createTaskTemplate(),
            default => (function() { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); })()
        };
        exit;
    }
    if (preg_match('#^/manager/task-templates/(\d+)$#', $path, $m)) {
        $ctrl = new ManagerController();
        match($method) {
            'PUT'    => $ctrl->updateTaskTemplate((int)$m[1]),
            'DELETE' => $ctrl->deleteTaskTemplate((int)$m[1]),
            default  => (function() { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); })()
        };
        exit;
    }
    if (preg_match('#^/manager/tasks/(\d+)/save-as-template$#', $path, $m) && $method === 'POST') {
        (new ManagerController())->saveTaskAsTemplate((int)$m[1]);
        exit;
    }

    // Project Templates
    if ($path === '/manager/project-templates' && $method === 'GET') {
        (new ManagerController())->listProjectTemplates();
        exit;
    }
    if (preg_match('#^/manager/workflows/(\d+)/save-as-template$#', $path, $m) && $method === 'POST') {
        (new ManagerController())->saveProjectAsTemplate((int)$m[1]);
        exit;
    }
    if (preg_match('#^/manager/project-templates/(\d+)/create-project$#', $path, $m) && $method === 'POST') {
        (new ManagerController())->createProjectFromTemplate((int)$m[1]);
        exit;
    }
    if (preg_match('#^/manager/project-templates/(\d+)$#', $path, $m) && $method === 'DELETE') {
        (new ManagerController())->deleteProjectTemplate((int)$m[1]);
        exit;
    }

    // Manager routes
    if ($segments[0] === 'manager') {
        $mgr = new ManagerController();
        $sub = $segments[1] ?? '';
        $id = isset($segments[2]) ? (int)$segments[2] : null;
        $action = $segments[3] ?? '';

        match(true) {
            $sub === 'stats' && $method === 'GET' => $mgr->stats(),
            $sub === 'users' && $method === 'GET' => $mgr->listUsers(),
            $sub === 'users' && $method === 'POST' => $mgr->createUser(),
            $sub === 'users' && $id && $method === 'PUT' && !$action => $mgr->updateUser($id),
            $sub === 'users' && $id && $action === 'toggle-status' && $method === 'PUT' => $mgr->toggleUserStatus($id),
            $sub === 'users' && $id && $action === 'toggle-task-creation' && $method === 'PUT' => $mgr->toggleTaskCreation($id),
            $sub === 'workflows' && $id && $action === 'members' && $method === 'GET' => $mgr->listProjectMembers($id),
            $sub === 'workflows' && $id && $action === 'members' && $method === 'POST' => $mgr->addProjectMember($id),
            $sub === 'workflows' && $id && $action === 'members' && $method === 'DELETE' && isset($segments[4]) => $mgr->removeProjectMember($id, (int)$segments[4]),
            $sub === 'workflows' && $id && $action === 'custom-fields' && $method === 'GET' => $mgr->listCustomFields($id),
            $sub === 'workflows' && $id && $action === 'custom-fields' && $method === 'POST' => $mgr->createCustomField($id),
            $sub === 'workflows' && $method === 'GET' => $mgr->listWorkflows(),
            $sub === 'workflows' && $method === 'POST' => $mgr->createWorkflow(),
            $sub === 'workflows' && $id && $method === 'PUT' => $mgr->updateWorkflow($id),
            $sub === 'workflows' && $id && $method === 'DELETE' => $mgr->deleteWorkflow($id),
            $sub === 'custom-fields' && $id && $method === 'PUT' => $mgr->updateCustomField($id),
            $sub === 'custom-fields' && $id && $method === 'DELETE' => $mgr->deleteCustomField($id),
            $sub === 'tasks' && $method === 'GET' && !$id => $mgr->listTasks(),
            $sub === 'tasks' && $method === 'POST' && !$id => $mgr->createTask(),
            $sub === 'tasks' && $id && $action === 'time-logs' && $method === 'GET' => $mgr->listTimeLogs($id),
            $sub === 'tasks' && $id && $action === 'time-logs' && $method === 'POST' => $mgr->addTimeLog($id),
            $sub === 'tasks' && $id && $action === 'time-logs' && $method === 'DELETE' && isset($segments[4]) => $mgr->deleteTimeLog($id, (int)$segments[4]),
            $sub === 'time-report' && $method === 'GET' => $mgr->timeReport(),
            $sub === 'tasks' && $id && $action === 'dependencies' && $method === 'POST' => $mgr->addDependency($id),
            $sub === 'tasks' && $id && $action === 'dependencies' && $method === 'DELETE' && isset($segments[4]) => $mgr->removeDependency($id, (int)$segments[4]),
            $sub === 'tasks' && $id && $action === 'comments' && $method === 'POST' => $mgr->addComment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'POST' => $mgr->uploadAttachment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'DELETE' && isset($segments[4]) => $mgr->deleteAttachment($id, (int)$segments[4]),
            $sub === 'tasks' && $id && $action === 'activity' && $method === 'GET' => $mgr->getActivityLog($id),
            $sub === 'tasks' && $id && $method === 'GET' && !$action => $mgr->getTask($id),
            $sub === 'tasks' && $id && $method === 'PUT' && !$action => $mgr->updateTask($id),
            $sub === 'tasks' && $id && $method === 'DELETE' => $mgr->deleteTask($id),
            $sub === 'company-users' && $method === 'GET' => $mgr->listCompanyUsers(),
            $sub === 'project-stats' && $method === 'GET' => $mgr->managerProjectStats(),
            $sub === 'workload' && $method === 'GET' => $mgr->workload(),
            default => (function() { http_response_code(404); echo json_encode(['error' => 'Not found']); })()
        };
        exit;
    }

    // Employee routes
    if ($segments[0] === 'employee') {
        $emp = new EmployeeController();
        $sub = $segments[1] ?? '';
        $id = isset($segments[2]) ? (int)$segments[2] : null;
        $action = $segments[3] ?? '';

        match(true) {
            $sub === 'stats' && $method === 'GET' => $emp->stats(),
            $sub === 'project-tasks' && $method === 'GET' => $emp->listProjectTasks(),
            $sub === 'tasks' && $method === 'GET' && !$id => $emp->listTasks(),
            $sub === 'tasks' && $method === 'POST' && !$id => $emp->createTask(),
            $sub === 'tasks' && $id && $method === 'GET' && !$action => $emp->getTask($id),
            $sub === 'tasks' && $id && $action === 'stage' && $method === 'PUT' => $emp->updateStage($id),
            $sub === 'tasks' && $id && $action === 'time-logs' && $method === 'GET' => $emp->listTimeLogs($id),
            $sub === 'tasks' && $id && $action === 'time-logs' && $method === 'POST' => $emp->addTimeLog($id),
            $sub === 'tasks' && $id && $action === 'comments' && $method === 'POST' => $emp->addComment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'POST' => $emp->uploadAttachment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'DELETE' && isset($segments[4]) => $emp->deleteAttachment($id, (int)$segments[4]),
            $sub === 'tasks' && $id && $action === 'activity' && $method === 'GET' => $emp->getActivityLog($id),
            $sub === 'workflows' && $method === 'GET' => $emp->listWorkflows(),
            default => (function() { http_response_code(404); echo json_encode(['error' => 'Not found']); })()
        };
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => 'API endpoint not found']);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
