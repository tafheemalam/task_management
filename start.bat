@echo off
title TaskFlow - Task Management System

echo.
echo  ████████╗ █████╗ ███████╗██╗  ██╗███████╗██╗      ██████╗ ██╗    ██╗
echo     ██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝██║     ██╔═══██╗██║    ██║
echo     ██║   ███████║███████╗█████╔╝ █████╗  ██║     ██║   ██║██║ █╗ ██║
echo     ██║   ██╔══██║╚════██║██╔═██╗ ██╔══╝  ██║     ██║   ██║██║███╗██║
echo     ██║   ██║  ██║███████║██║  ██╗██║     ███████╗╚██████╔╝╚███╔███╔╝
echo     ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
echo.
echo  Task Management System
echo ─────────────────────────────────────────────────

:: Check if MySQL is running
"C:\xampp2.0\mysql\bin\mysqladmin.exe" -u root status >nul 2>&1
if errorlevel 1 (
    echo  [*] Starting MySQL...
    start "" "C:\xampp2.0\mysql\bin\mysqld.exe" --defaults-file="C:\xampp2.0\mysql\bin\my.ini" --standalone
    timeout /t 3 /nobreak >nul
    echo  [OK] MySQL started
) else (
    echo  [OK] MySQL is already running
)

:: Run database setup
echo  [*] Initializing database...
"C:\xampp2.0\mysql\bin\mysql.exe" -u root -e "source G:/Task Management/database.sql" >nul 2>&1
echo  [OK] Database ready

echo.
echo  ─────────────────────────────────────────────────
echo   Starting TaskFlow server...
echo   URL: http://localhost:8080
echo   Press Ctrl+C to stop
echo  ─────────────────────────────────────────────────
echo.

:: Open browser after short delay
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080"

:: Start PHP development server
"C:\xampp2.0\php\php.exe" -S localhost:8080 -t "G:\Task Management\public" "G:\Task Management\router.php"
