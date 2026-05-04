-- Task Management Database Schema
CREATE DATABASE IF NOT EXISTS taskmanagement CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE taskmanagement;

CREATE TABLE IF NOT EXISTS packages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    max_users INT NOT NULL DEFAULT 10,
    description TEXT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    package_id INT NULL,
    package_starts_at DATE NULL,
    package_expires_at DATE NULL,
    discount_code VARCHAR(50) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'employee') NOT NULL DEFAULT 'employee',
    company_id INT NULL,
    can_create_tasks TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS discount_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(50) UNIQUE NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    is_used TINYINT(1) NOT NULL DEFAULT 0,
    used_by_company_id INT NULL,
    used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (used_by_company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workflows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_stages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workflow_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    priority ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
    stage_id INT NULL,
    workflow_id INT NOT NULL,
    assignee_id INT NULL,
    creator_id INT NOT NULL,
    parent_task_id INT NULL,
    start_date DATE NULL,
    due_date DATE NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (stage_id) REFERENCES workflow_stages(id) ON DELETE SET NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE RESTRICT,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscription_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    company_email VARCHAR(255) NOT NULL,
    company_phone VARCHAR(50) NULL,
    company_address TEXT NULL,
    manager_name VARCHAR(255) NOT NULL,
    manager_email VARCHAR(255) NOT NULL,
    manager_password VARCHAR(255) NOT NULL,
    package_id INT NOT NULL,
    discount_token VARCHAR(50) NULL,
    discount_percentage DECIMAL(5,2) NULL,
    is_trial TINYINT(1) NOT NULL DEFAULT 0,
    payment_intent_id VARCHAR(255) NULL,
    payment_status ENUM('pending','paid','failed','trial') NOT NULL DEFAULT 'pending',
    amount_paid DECIMAL(10,2) NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT
);

-- Seed: default packages
INSERT INTO packages (name, type, price, max_users, description) VALUES
('Starter Monthly', 'monthly', 29.99, 10, 'Perfect for small teams'),
('Starter Yearly', 'yearly', 299.99, 10, 'Perfect for small teams - save 17%'),
('Pro Monthly', 'monthly', 79.99, 50, 'For growing businesses'),
('Pro Yearly', 'yearly', 799.99, 50, 'For growing businesses - save 17%'),
('Enterprise Monthly', 'monthly', 199.99, 999, 'Unlimited users, full features'),
('Enterprise Yearly', 'yearly', 1999.99, 999, 'Unlimited users, full features - save 17%');

CREATE TABLE IF NOT EXISTS task_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Run this block only when upgrading an existing database (safe to ignore if table is new)
-- ALTER TABLE subscription_requests ADD COLUMN payment_intent_id VARCHAR(255) NULL;
-- ALTER TABLE subscription_requests ADD COLUMN payment_status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending';
-- ALTER TABLE subscription_requests ADD COLUMN amount_paid DECIMAL(10,2) NULL;

-- Seed: default admin user (password: admin123)
INSERT INTO users (name, email, password, role, company_id, can_create_tasks, is_active)
VALUES ('System Admin', 'admin@taskmanager.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', NULL, 0, 1);
