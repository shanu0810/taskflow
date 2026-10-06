<#
.SYNOPSIS
    TaskFlow — Full Setup Script
    Installs dependencies, sets up the database, and starts all services.

.DESCRIPTION
    This script:
    1. Verifies prerequisites (Python 3.12, Node 18+, Redis, PostgreSQL)
    2. Creates the Python virtual environment
    3. Installs Python and Node packages
    4. Creates the PostgreSQL database and user
    5. Starts Redis (if not running)
    6. Runs database migrations
    7. Starts the backend API
    8. Starts the frontend dev server
    9. Starts a background worker

.USAGE
    # Run from the taskflow root directory:
    Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
    .\setup_taskflow.ps1

    # Or to just start services (skip install):
    .\setup_taskflow.ps1 -StartOnly
#>

param(
    [switch]$StartOnly,
    [switch]$StopAll
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── Colors ─────────────────────────────────────────────────────────────────

function Write-Step($msg) { Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  → $msg" -ForegroundColor Gray }

Write-Host @"
  ╔════════════════════════════════════════╗
  ║     TaskFlow Setup & Start Script     ║
  ╚════════════════════════════════════════╝
"@ -ForegroundColor Magenta

# ─── Stop services ───────────────────────────────────────────────────────────

if ($StopAll) {
    Write-Step "Stopping all TaskFlow services..."
    Get-Process -Name "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Ok "Services stopped"
    exit 0
}

# ─── Check PATH ──────────────────────────────────────────────────────────────

$env:PATH = "C:\Users\pk200\AppData\Local\Programs\Python\Python312\Scripts;" +
            "C:\Users\pk200\AppData\Local\Programs\Python\Python312;" +
            "C:\Program Files\Redis;" +
            "C:\Program Files\PostgreSQL\15\bin;" +
            "C:\Program Files (x86)\PostgresPro\15\bin;" +
            $env:PATH

# ─── 1. Verify prerequisites ─────────────────────────────────────────────────

Write-Step "Checking prerequisites..."

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    $ver = & python --version 2>&1
    Write-Ok "Python: $ver"
} else {
    Write-Fail "Python not found. Install Python 3.12 from python.org"
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $ver = & node --version 2>&1
    Write-Ok "Node.js: $ver"
} else {
    Write-Fail "Node.js not found. Install from nodejs.org"
    exit 1
}

# ─── 2. Start Redis ───────────────────────────────────────────────────────────

Write-Step "Starting Redis..."

$redisPong = redis-cli ping 2>&1
if ($redisPong -eq "PONG") {
    Write-Ok "Redis already running"
} else {
    $redisExe = "C:\Program Files\Redis\redis-server.exe"
    if (Test-Path $redisExe) {
        Start-Process -FilePath $redisExe -WindowStyle Hidden
        Start-Sleep -Seconds 2
        $redisPong = redis-cli ping 2>&1
        if ($redisPong -eq "PONG") {
            Write-Ok "Redis started"
        } else {
            Write-Warn "Redis may not be running. Backend will still start but queue won't work."
        }
    } else {
        Write-Warn "Redis not found at $redisExe. Install Redis for Windows."
    }
}

# ─── 3. Start PostgreSQL ─────────────────────────────────────────────────────

Write-Step "Checking PostgreSQL..."

$pgPaths = @(
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files (x86)\PostgresPro\15\bin",
    "C:\Program Files (x86)\PostgresPro\17\bin"
)

$pgBin = $null
foreach ($p in $pgPaths) {
    if (Test-Path "$p\psql.exe") {
        $pgBin = $p
        $env:PATH = "$p;" + $env:PATH
        Write-Ok "Found PostgreSQL at: $p"
        break
    }
}

if (-not $pgBin) {
    Write-Warn "PostgreSQL not found. The application requires PostgreSQL to run."
    Write-Info "Install PostgreSQL from: https://www.postgresql.org/download/windows/"
    Write-Info "Or use Docker: docker compose up --build"
} else {
    # Create DB and user if they don't exist
    Write-Info "Creating database and user (if not exists)..."
    $pgpassword = "postgres"
    $env:PGPASSWORD = $pgpassword

    & psql -U postgres -c "CREATE USER taskflow WITH PASSWORD 'taskflow_dev_password';" -h localhost 2>&1 | Out-Null
    & psql -U postgres -c "CREATE DATABASE taskflow OWNER taskflow;" -h localhost 2>&1 | Out-Null
    & psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE taskflow TO taskflow;" -h localhost 2>&1 | Out-Null
    Write-Ok "Database ready"
}

# ─── 4. Install Python dependencies ──────────────────────────────────────────

if (-not $StartOnly) {
    Write-Step "Installing Python dependencies..."
    Push-Location "$ProjectRoot\backend"
    
    if (-not (Test-Path "venv")) {
        Write-Info "Creating virtual environment..."
        & python -m venv venv
    }
    
    Write-Info "Installing packages..."
    & python -m pip install -r requirements.txt -q
    Write-Ok "Python dependencies installed"
    Pop-Location
}

# ─── 5. Install Node dependencies ─────────────────────────────────────────────

if (-not $StartOnly) {
    Write-Step "Installing Node.js dependencies..."
    Push-Location "$ProjectRoot\frontend"
    & npm install --silent
    Write-Ok "Node dependencies installed"
    Pop-Location
}

# ─── 6. Start Backend API ─────────────────────────────────────────────────────

Write-Step "Starting Backend API (port 8000)..."

$env:DATABASE_URL = "postgresql+psycopg://taskflow:taskflow_dev_password@localhost:5432/taskflow"
$env:REDIS_URL = "redis://localhost:6379/0"
$env:JWT_SECRET = "dev-secret-change-in-production"
$env:CORS_ORIGINS = '["http://localhost:3000"]'

$backendProc = Start-Process -FilePath "python" `
    -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" `
    -WorkingDirectory "$ProjectRoot\backend" `
    -PassThru -WindowStyle Minimized `
    -RedirectStandardOutput "$ProjectRoot\backend\api.log" `
    -RedirectStandardError "$ProjectRoot\backend\api_error.log"

Start-Sleep -Seconds 3
Write-Ok "Backend started (PID: $($backendProc.Id)) → http://localhost:8000"
Write-Info "API Docs: http://localhost:8000/api/docs"

# ─── 7. Start Frontend ────────────────────────────────────────────────────────

Write-Step "Starting Frontend (port 3000)..."

$env:NEXT_PUBLIC_API_URL = "http://localhost:8000"

$frontendProc = Start-Process -FilePath "node" `
    -ArgumentList "node_modules\.bin\next dev" `
    -WorkingDirectory "$ProjectRoot\frontend" `
    -PassThru -WindowStyle Minimized `
    -RedirectStandardOutput "$ProjectRoot\frontend\dev.log" `
    -RedirectStandardError "$ProjectRoot\frontend\dev_error.log"

Start-Sleep -Seconds 4
Write-Ok "Frontend started (PID: $($frontendProc.Id)) → http://localhost:3000"

# ─── 8. Start Worker ─────────────────────────────────────────────────────────

Write-Step "Starting Background Worker..."

$env:WORKER_ID = "worker-01"
$workerProc = Start-Process -FilePath "python" `
    -ArgumentList "-m app.workers.worker" `
    -WorkingDirectory "$ProjectRoot\backend" `
    -PassThru -WindowStyle Minimized `
    -RedirectStandardOutput "$ProjectRoot\backend\worker.log" `
    -RedirectStandardError "$ProjectRoot\backend\worker_error.log"

Start-Sleep -Seconds 2
Write-Ok "Worker started (PID: $($workerProc.Id))"

# ─── 9. Summary ──────────────────────────────────────────────────────────────

Write-Host @"

  ╔════════════════════════════════════════════════════╗
  ║              TaskFlow is running! 🚀               ║
  ╠════════════════════════════════════════════════════╣
  ║  Frontend:   http://localhost:3000                 ║
  ║  Backend:    http://localhost:8000                 ║
  ║  API Docs:   http://localhost:8000/api/docs        ║
  ║  Health:     http://localhost:8000/health          ║
  ╠════════════════════════════════════════════════════╣
  ║  Logs:                                             ║
  ║    backend\api.log         (API server)            ║
  ║    backend\worker.log      (Worker process)        ║
  ║    frontend\dev.log        (Next.js dev server)    ║
  ╠════════════════════════════════════════════════════╣
  ║  To stop:  .\setup_taskflow.ps1 -StopAll          ║
  ╚════════════════════════════════════════════════════╝
"@ -ForegroundColor Green

Write-Host "Opening browser in 3 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"
