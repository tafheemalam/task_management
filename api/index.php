<?php
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
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/AdminController.php';
require_once __DIR__ . '/controllers/ManagerController.php';
require_once __DIR__ . '/controllers/EmployeeController.php';
require_once __DIR__ . '/controllers/SubscribeController.php';
require_once __DIR__ . '/config/stripe.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Strip /api prefix
$path = preg_replace('#^/api#', '', $uri);
$path = rtrim($path, '/') ?: '/';
$segments = explode('/', trim($path, '/'));

try {
    // Auth routes
    if ($path === '/auth/login' && $method === 'POST') { (new AuthController())->login(); exit; }
    if ($path === '/auth/me' && $method === 'GET') { (new AuthController())->me(); exit; }

    // Public subscription routes (no auth required)
    if ($path === '/subscribe' && $method === 'POST') { (new SubscribeController())->submit(); exit; }
    if ($path === '/subscribe/packages' && $method === 'GET') { (new SubscribeController())->listPackages(); exit; }
    if ($path === '/subscribe/payment-intent' && $method === 'POST') { (new SubscribeController())->createPaymentIntent(); exit; }

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
            default => (function() { http_response_code(404); echo json_encode(['error' => 'Not found']); })()
        };
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
            $sub === 'workflows' && $method === 'GET' => $mgr->listWorkflows(),
            $sub === 'workflows' && $method === 'POST' => $mgr->createWorkflow(),
            $sub === 'workflows' && $id && $method === 'PUT' => $mgr->updateWorkflow($id),
            $sub === 'workflows' && $id && $method === 'DELETE' => $mgr->deleteWorkflow($id),
            $sub === 'tasks' && $method === 'GET' => $mgr->listTasks(),
            $sub === 'tasks' && $method === 'POST' => $mgr->createTask(),
            $sub === 'tasks' && $id && $action === 'comments' && $method === 'POST' => $mgr->addComment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'POST' => $mgr->uploadAttachment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'DELETE' && isset($segments[4]) => $mgr->deleteAttachment($id, (int)$segments[4]),
            $sub === 'tasks' && $id && $method === 'GET' && !$action => $mgr->getTask($id),
            $sub === 'tasks' && $id && $method === 'PUT' && !$action => $mgr->updateTask($id),
            $sub === 'tasks' && $id && $method === 'DELETE' => $mgr->deleteTask($id),
            $sub === 'company-users' && $method === 'GET' => $mgr->listCompanyUsers(),
            $sub === 'project-stats' && $method === 'GET' => $mgr->managerProjectStats(),
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
            $sub === 'tasks' && $method === 'GET' && !$id => $emp->listTasks(),
            $sub === 'tasks' && $method === 'POST' && !$id => $emp->createTask(),
            $sub === 'tasks' && $id && $method === 'GET' && !$action => $emp->getTask($id),
            $sub === 'tasks' && $id && $action === 'stage' && $method === 'PUT' => $emp->updateStage($id),
            $sub === 'tasks' && $id && $action === 'comments' && $method === 'POST' => $emp->addComment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'POST' => $emp->uploadAttachment($id),
            $sub === 'tasks' && $id && $action === 'attachments' && $method === 'DELETE' && isset($segments[4]) => $emp->deleteAttachment($id, (int)$segments[4]),
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
