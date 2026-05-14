# Academic Email Assistant — Setup Script
# Run this once to configure everything before first use.

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  ERR $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Academic Email Assistant — Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js not found. Download and install it from https://nodejs.org then re-run this script."
}
Write-OK "Node.js $(node --version)"

# ── 2. Check Ollama ───────────────────────────────────────────────────────────
Write-Step "Checking Ollama..."
if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Fail "Ollama not found. Download and install it from https://ollama.com then re-run this script."
}
Write-OK "Ollama found"

# ── 3. Install npm dependencies ───────────────────────────────────────────────
Write-Step "Installing npm dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed." }
Write-OK "Dependencies installed"

# ── 4. Install HTTPS dev certificates ────────────────────────────────────────
Write-Step "Installing HTTPS dev certificates (Outlook requires HTTPS)..."
npx office-addin-dev-certs install
if ($LASTEXITCODE -ne 0) { Write-Fail "Dev certificate install failed." }
Write-OK "Certificates installed"

# ── 5. Pull the AI model ──────────────────────────────────────────────────────
Write-Step "Downloading AI model — qwen2.5:3b (~2 GB, this may take a few minutes)..."
ollama pull qwen2.5:3b
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to pull model. Make sure Ollama is running." }
Write-OK "Model ready"

# ── 5b. Set OLLAMA_API_KEY if missing (OpenClaw requires this even for local Ollama) ─
Write-Step "Configuring Ollama provider key..."
$existingKey = [System.Environment]::GetEnvironmentVariable("OLLAMA_API_KEY", "User")
if ($existingKey) {
    Write-OK "OLLAMA_API_KEY already set — skipped"
} else {
    [System.Environment]::SetEnvironmentVariable("OLLAMA_API_KEY", "ollama", "User")
    $env:OLLAMA_API_KEY = "ollama"
    Write-OK "OLLAMA_API_KEY set"
}

# ── 6. Create OpenClaw config ─────────────────────────────────────────────────
Write-Step "Creating OpenClaw configuration..."
$openclawDir = "$env:USERPROFILE\.openclaw"
if (!(Test-Path $openclawDir)) { New-Item -ItemType Directory -Path $openclawDir | Out-Null }

$configPath = "$openclawDir\openclaw.json"

if (!(Test-Path $configPath)) {
    # Fresh install — write the full default config
    $config = @'
{
  "agents": {
    "defaults": {
      "model": "ollama/qwen2.5:3b"
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token"
    },
    "controlUi": {
      "allowedOrigins": ["https://localhost:3000"],
      "dangerouslyDisableDeviceAuth": true
    }
  },
  "plugins": {
    "entries": {
      "ollama": { "enabled": true }
    }
  }
}
'@
    Set-Content -Path $configPath -Value $config -Encoding utf8
    Write-OK "openclaw.json created"
} else {
    # Existing config — patch in any missing fields without touching the auth token
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    $changed = $false

    if ($null -eq $cfg.gateway) {
        $cfg | Add-Member -NotePropertyName "gateway" -NotePropertyValue ([PSCustomObject]@{})
        $changed = $true
    }
    if ($null -eq $cfg.gateway.controlUi) {
        $cfg.gateway | Add-Member -NotePropertyName "controlUi" -NotePropertyValue ([PSCustomObject]@{
            allowedOrigins              = @("https://localhost:3000")
            dangerouslyDisableDeviceAuth = $true
        })
        $changed = $true
    } else {
        if ($null -eq $cfg.gateway.controlUi.allowedOrigins) {
            $cfg.gateway.controlUi | Add-Member -NotePropertyName "allowedOrigins" -NotePropertyValue @("https://localhost:3000")
            $changed = $true
        }
        if ($null -eq $cfg.gateway.controlUi.dangerouslyDisableDeviceAuth) {
            $cfg.gateway.controlUi | Add-Member -NotePropertyName "dangerouslyDisableDeviceAuth" -NotePropertyValue $true
            $changed = $true
        }
    }
    if ($null -eq $cfg.plugins) {
        $cfg | Add-Member -NotePropertyName "plugins" -NotePropertyValue ([PSCustomObject]@{
            entries = [PSCustomObject]@{ ollama = [PSCustomObject]@{ enabled = $true } }
        })
        $changed = $true
    }

    if ($changed) {
        $cfg | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding utf8
        Write-OK "openclaw.json updated with required settings"
    } else {
        Write-OK "openclaw.json already configured correctly — skipped"
    }
}

# ── 7. Pre-create OpenClaw workspace to prevent bootstrap workflow ─────────────
Write-Step "Setting up OpenClaw workspace..."
$workspaceDir = "$openclawDir\workspace"
if (!(Test-Path $workspaceDir)) { New-Item -ItemType Directory -Path $workspaceDir | Out-Null }

$agentsPath = "$workspaceDir\AGENTS.md"
if (!(Test-Path $agentsPath)) {
    $agentsContent = @'
# Agents

## Session Startup

Do not create or check for daily memory files automatically on session startup. Only create or update memory files when the user explicitly asks. Do not run bootstrap workflows. Answer questions directly.
'@
    Set-Content -Path $agentsPath -Value $agentsContent -Encoding utf8
    Write-OK "Workspace configured"
} else {
    Write-OK "Workspace already exists — skipped"
}

# Remove bootstrap file if it exists
$bootstrapPath = "$workspaceDir\BOOTSTRAP.md"
if (Test-Path $bootstrapPath) {
    Remove-Item $bootstrapPath
    Write-OK "Bootstrap workflow disabled"
}
# ── 8. Deploy SOUL.md to OpenClaw workspace ────────────────────────────────
Write-Step "Deploying agent personality (SOUL.md) to OpenClaw workspace..."
$soulSource = Join-Path $PSScriptRoot ".agents\SOUL.md"
$soulDest   = "$workspaceDir\SOUL.md"
if (Test-Path $soulSource) {
    Copy-Item -Path $soulSource -Destination $soulDest -Force
    Write-OK "SOUL.md deployed to $soulDest"
} else {
    Write-Host "  WARN .agents\SOUL.md not found in repo — skipping" -ForegroundColor Yellow
}
$agentsSource = Join-Path $PSScriptRoot ".agents\AGENTS.md"
$agentsDest   = "$workspaceDir\AGENTS.md"
if (Test-Path $agentsSource) {
    Copy-Item -Path $agentsSource -Destination $agentsDest -Force
    Write-OK "AGENTS.md deployed to $agentsDest"
} else {
    Write-Host "  WARN .agents\AGENTS.md not found in repo — skipping" -ForegroundColor Yellow
}
$toolsSource = Join-Path $PSScriptRoot ".agents\TOOLS.md"
$toolsDest   = "$workspaceDir\TOOLS.md"
if (Test-Path $toolsSource) {
    Copy-Item -Path $toolsSource -Destination $toolsDest -Force
    Write-OK "TOOLS.md deployed to $toolsDest"
} else {
    Write-Host "  WARN .agents\TOOLS.md not found in repo — skipping" -ForegroundColor Yellow
}


# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Open Terminal 1 and run:" -ForegroundColor White
Write-Host "       npm run gateway" -ForegroundColor Yellow
Write-Host ""
Write-Host "  2. Find your token in:" -ForegroundColor White
Write-Host "       $configPath" -ForegroundColor Yellow
Write-Host "     Look for: gateway > auth > token" -ForegroundColor White
Write-Host ""
Write-Host "  3. Open Terminal 2 and run:" -ForegroundColor White
Write-Host "       npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "  4. In Outlook: Get Add-ins > My Add-ins > Add from file > select manifest.xml" -ForegroundColor White
Write-Host ""
Write-Host "  5. Open any email, click Academic Assistant in the ribbon," -ForegroundColor White
Write-Host "     paste your token into the settings panel, and click Save." -ForegroundColor White
Write-Host ""
