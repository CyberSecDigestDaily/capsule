# Capsule on-time runs: one-off setup for Windows (about 3 minutes).
#
# What it does, in order:
#   1. Checks Node.js is installed (offers to install the LTS version with winget if not).
#   2. Asks for your GitHub token (hidden while you paste) and proves it works by
#      starting one price check straight away.
#   3. Logs you in to Cloudflare in your browser (first time only).
#   4. Deploys a tiny Cloudflare Worker called "capsule-cron" that starts the price
#      check at 07:15, 13:15 and 19:15 UK summer time (06:15, 12:15, 18:15 in winter).
#   5. Stores the token inside Cloudflare as an encrypted secret. Nothing is saved on this PC.
#
# How to run it (pick one):
#   - Double-click setup.cmd in this folder, or
#   - In any PowerShell window, paste:
#       irm https://raw.githubusercontent.com/CyberSecDigestDaily/capsule/main/cloudflare/setup.ps1 | iex
#
# Safe to run again any time (e.g. when the token expires): it just updates the Worker and token.

$ScriptDir = $PSScriptRoot

function Invoke-CapsuleSetup {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $Repo     = 'CyberSecDigestDaily/capsule'
    $Workflow = 'update.yml'
    $Raw      = "https://raw.githubusercontent.com/$Repo/main/cloudflare"
    $Wrangler = @('--yes', 'wrangler@4')

    function Step([string]$n, [string]$msg) { Write-Host ''; Write-Host "[$n/5] $msg" -ForegroundColor Cyan }
    function Ok([string]$msg) { Write-Host "      $msg" -ForegroundColor Green }
    function Info([string]$msg) { Write-Host "      $msg" }
    function Get-StatusCode($err) {
        $r = $err.Exception.Response
        if ($r -and $r.StatusCode) { return [int]$r.StatusCode }
        return 0
    }
    function Get-NativeText([scriptblock]$Block) {
        # Run a native command, capture stdout+stderr as text, never throw on stderr.
        $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { return ((& $Block 2>&1 | ForEach-Object { "$_" }) -join "`n") }
        finally { $ErrorActionPreference = $old }
    }

    Write-Host ''
    Write-Host 'Capsule on-time runs: setup' -ForegroundColor White
    Write-Host '---------------------------'

    # 1. Node.js -----------------------------------------------------------------------
    Step 1 'Checking Node.js'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            throw 'Node.js is not installed and winget is not available. Install the LTS version from https://nodejs.org, then run setup again.'
        }
        Info 'Node.js is not installed. Installing the LTS version with winget (Windows may ask you to approve)...'
        & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            throw 'Node.js was installed but this window cannot see it yet. Close this window and run setup again.'
        }
    }
    Ok ('Node.js ' + (Get-NativeText { node --version }))

    # Working folder with wrangler.toml + src/index.js ---------------------------------
    $work = $ScriptDir
    if (-not $work -or -not (Test-Path (Join-Path $work 'wrangler.toml'))) {
        $work = Join-Path $env:LOCALAPPDATA 'capsule-cron'
        New-Item -ItemType Directory -Force -Path (Join-Path $work 'src') | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri "$Raw/wrangler.toml" -OutFile (Join-Path $work 'wrangler.toml')
        Invoke-WebRequest -UseBasicParsing -Uri "$Raw/src/index.js" -OutFile (Join-Path $work 'src\index.js')
    }
    Set-Location $work

    # 2. GitHub token -------------------------------------------------------------------
    Step 2 'Checking your GitHub token'
    $secure = Read-Host '      Paste the token (it stays hidden) and press Enter' -AsSecureString
    $token = (New-Object System.Management.Automation.PSCredential('token', $secure)).GetNetworkCredential().Password.Trim()
    if ($token -notmatch '^(github_pat_|ghp_)[A-Za-z0-9_]+$') {
        throw 'That does not look like a GitHub token (they start with github_pat_). Copy it again from GitHub and re-run setup.'
    }
    $headers = @{
        'Authorization'        = "Bearer $token"
        'Accept'               = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
        'User-Agent'           = 'capsule-setup'
    }
    try {
        Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/actions/workflows/$Workflow/dispatches" `
            -Headers $headers -ContentType 'application/json' -Body '{"ref":"main"}' | Out-Null
    } catch {
        $err = $_
        switch (Get-StatusCode $err) {
            401 { throw 'GitHub says this token is invalid or expired. Create a new one and run setup again.' }
            403 { throw 'This token is not allowed to start workflows. On GitHub, edit the token: Permissions > Actions = Read and write.' }
            404 { throw 'This token cannot see the capsule repo. On GitHub, edit the token: Repository access > Only select repositories > capsule, and Permissions > Actions = Read and write.' }
            default { throw ('Could not reach GitHub: ' + $err.Exception.Message) }
        }
    }
    Ok 'Token works. A price check has just started: https://github.com/CyberSecDigestDaily/capsule/actions'

    # 3. Cloudflare login ---------------------------------------------------------------
    Step 3 'Checking your Cloudflare login'
    Info '(the first run downloads Cloudflare''s Wrangler tool, which can take a minute)'
    $who = Get-NativeText { npx @Wrangler whoami }
    if ($who -match 'not authenticated') {
        Info 'A browser tab will open. Log in to Cloudflare and click Allow, then come back to this window.'
        & npx @Wrangler login
        if ($LASTEXITCODE -ne 0) { throw 'Cloudflare login did not finish. Run setup again.' }
    }
    Ok 'Logged in to Cloudflare'

    # 4. Deploy the Worker --------------------------------------------------------------
    Step 4 'Deploying the capsule-cron Worker'
    & npx @Wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw 'Deploying the Worker failed: see the message above.' }
    Ok 'Worker deployed with schedule 15 6,12,18 * * * (UTC)'

    # 5. Store the token in Cloudflare --------------------------------------------------
    Step 5 'Saving the token in Cloudflare (encrypted)'
    $token | & npx @Wrangler secret put GITHUB_TOKEN
    if ($LASTEXITCODE -ne 0) { throw 'Saving the token in Cloudflare failed: see the message above.' }
    Remove-Variable token, secure, headers -ErrorAction SilentlyContinue
    Ok 'Token saved'

    Write-Host ''
    $hook = Read-Host '      Optional: paste a Discord webhook URL for failure alerts, or just press Enter to skip'
    if ($hook -and $hook.Trim() -match '^https://(discord|discordapp)\.com/api/webhooks/') {
        $hook.Trim() | & npx @Wrangler secret put DISCORD_WEBHOOK
        if ($LASTEXITCODE -eq 0) { Ok 'Discord alerts on' }
    } elseif ($hook) {
        Info 'That is not a Discord webhook URL, so alerts were skipped.'
    }

    Write-Host ''
    Write-Host 'All done.' -ForegroundColor Green
    Write-Host 'Price checks now start at 07:15, 13:15 and 19:15 UK time (an hour earlier in winter).'
    Write-Host 'Check runs at https://github.com/CyberSecDigestDaily/capsule/actions'
}

try {
    Invoke-CapsuleSetup
} catch {
    Write-Host ''
    Write-Host ('STOPPED: ' + $_.Exception.Message) -ForegroundColor Red
}
