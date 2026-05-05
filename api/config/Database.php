<?php
class Database {
    private static ?PDO $instance = null;

    private static function getConfig(): array {
        return [
            'host'     => getenv('DB_HOST')     ?: 'localhost',
            'port'     => getenv('DB_PORT')     ?: '3306',
            'dbname'   => getenv('DB_NAME')     ?: 'taskmanagement',
            'username' => getenv('DB_USER')     ?: 'root',
            'password' => getenv('DB_PASS')     ?: '',
            'charset'  => 'utf8mb4',
        ];
    }

    public static function getInstance(): PDO {
        if (self::$instance === null) {
            $c = self::getConfig();
            $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['dbname']};charset={$c['charset']}";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            // Cloud MySQL providers (Railway, PlanetScale, etc.) require SSL
            if (getenv('DB_SSL') === 'true') {
                $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
            }
            self::$instance = new PDO($dsn, $c['username'], $c['password'], $options);
        }
        return self::$instance;
    }
}
