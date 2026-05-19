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
# The expected model is whatever was just pulled in step 5. If OpenClaw was
# previously onboarded with a different model (e.g. llama3.1, gemma3, etc.)
# and that model is not installed locally, the gateway will 404 on every chat
# request. So we enforce the model here on both fresh installs and re-runs.
Write-Step "Creating OpenClaw configuration..."
$openclawDir = "$env:USERPROFILE\.openclaw"
if (!(Test-Path $openclawDir)) { New-Item -ItemType Directory -Path $openclawDir | Out-Null }

$configPath  = "$openclawDir\openclaw.json"
$expectedModel = "ollama/qwen2.5:3b"

if (!(Test-Path $configPath)) {
    # Fresh install — write the full default config. We use the agents.list
    # schema because that is what `openclaw onboard` writes and what the
    # gateway actually reads at runtime; agents.defaults.model is ignored
    # once an agent with id "main" exists.
    $config = @"
{
  "agents": {
    "defaults": {
      "workspace": "$($openclawDir.Replace('\','\\'))\\workspace"
    },
    "list": [
      { "id": "main", "model": "$expectedModel" }
    ]
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
"@
    Set-Content -Path $configPath -Value $config -Encoding utf8
    Write-OK "openclaw.json created with model $expectedModel"
} else {
    # Existing config — patch in any missing fields and enforce the model
    # without touching the auth token, secrets, or other user settings.
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

    # Enforce the agent model. OpenClaw stores it under agents.list[].model
    # post-onboarding; we update every entry to point at the model we just
    # pulled. If agents.list is missing entirely (rare), create it.
    if ($null -eq $cfg.agents) {
        $cfg | Add-Member -NotePropertyName "agents" -NotePropertyValue ([PSCustomObject]@{})
        $changed = $true
    }
    if ($null -eq $cfg.agents.list -or $cfg.agents.list.Count -eq 0) {
        $cfg.agents | Add-Member -NotePropertyName "list" -NotePropertyValue @(
            [PSCustomObject]@{ id = "main"; model = $expectedModel }
        ) -Force
        Write-OK "agents.list initialised with $expectedModel"
        $changed = $true
    } else {
        foreach ($agent in $cfg.agents.list) {
            if ($agent.model -ne $expectedModel) {
                $previous = $agent.model
                $agent.model = $expectedModel
                Write-OK "agents.list[$($agent.id)].model: $previous -> $expectedModel"
                $changed = $true
            }
        }
    }

    # Register qwen2.5:3b in the model provider list with its native 32K
    # context. OpenClaw warns and may truncate the prompt to nothing if
    # contextWindow < 32000 for this model (which produces stopReason=stop
    # with zero output tokens and surfaces as an "incomplete turn" error).
    $expectedCtx = 32000
    $expectedMaxTokens = 4096
    $modelId = "qwen2.5:3b"

    if ($null -eq $cfg.models) {
        $cfg | Add-Member -NotePropertyName "models" -NotePropertyValue ([PSCustomObject]@{ providers = [PSCustomObject]@{} })
        $changed = $true
    }
    if ($null -eq $cfg.models.providers) {
        $cfg.models | Add-Member -NotePropertyName "providers" -NotePropertyValue ([PSCustomObject]@{})
        $changed = $true
    }
    if ($null -eq $cfg.models.providers.ollama) {
        $cfg.models.providers | Add-Member -NotePropertyName "ollama" -NotePropertyValue ([PSCustomObject]@{
            baseUrl = "http://127.0.0.1:11434"
            api     = "ollama"
            models  = @()
        })
        $changed = $true
    }
    if ($null -eq $cfg.models.providers.ollama.models) {
        $cfg.models.providers.ollama | Add-Member -NotePropertyName "models" -NotePropertyValue @() -Force
        $changed = $true
    }

    $existing = $cfg.models.providers.ollama.models | Where-Object { $_.id -eq $modelId }
    if ($null -eq $existing) {
        $cfg.models.providers.ollama.models = @($cfg.models.providers.ollama.models) + ([PSCustomObject]@{
            id            = $modelId
            name          = $modelId
            reasoning     = $false
            input         = @("text")
            cost          = [PSCustomObject]@{ input = 0; output = 0; cacheRead = 0; cacheWrite = 0 }
            contextWindow = $expectedCtx
            maxTokens     = $expectedMaxTokens
        })
        Write-OK "registered model $modelId (ctx=$expectedCtx)"
        $changed = $true
    } else {
        if ($null -eq $existing.contextWindow -or $existing.contextWindow -lt $expectedCtx) {
            $previous = $existing.contextWindow
            $existing.contextWindow = $expectedCtx
            Write-OK "raised $modelId contextWindow $previous -> $expectedCtx"
            $changed = $true
        }
        if ($null -eq $existing.maxTokens) {
            $existing | Add-Member -NotePropertyName "maxTokens" -NotePropertyValue $expectedMaxTokens
            $changed = $true
        }
    }

    if ($changed) {
        $cfg | ConvertTo-Json -Depth 12 | Set-Content $configPath -Encoding utf8
        Write-OK "openclaw.json updated with required settings"
    } else {
        Write-OK "openclaw.json already configured correctly — skipped"
    }
}

# ── 7. Pre-create OpenClaw workspace to prevent bootstrap workflow ─────────────
# Step 8 deploys the real .agents\*.md files from this repo into the workspace.
# We only create the directory here and remove any stale BOOTSTRAP.md left
# behind by a previous onboarding run.
Write-Step "Setting up OpenClaw workspace..."
$workspaceDir = "$openclawDir\workspace"
if (!(Test-Path $workspaceDir)) {
    New-Item -ItemType Directory -Path $workspaceDir | Out-Null
    Write-OK "Workspace directory created"
} else {
    Write-OK "Workspace directory already exists — skipped"
}

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
