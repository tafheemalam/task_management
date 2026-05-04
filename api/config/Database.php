<?php
class Database {
    private static ?PDO $instance = null;

    private static function getConfig(): array {
        return [
            'host' => 'localhost',
            'port' => '3306',
            'dbname' => 'taskmanagement',
            'username' => 'root',
            'password' => '',
            'charset' => 'utf8mb4',
        ];
    }

    public static function getInstance(): PDO {
        if (self::$instance === null) {
            $c = self::getConfig();
            $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['dbname']};charset={$c['charset']}";
            self::$instance = new PDO($dsn, $c['username'], $c['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }
        return self::$instance;
    }
}
