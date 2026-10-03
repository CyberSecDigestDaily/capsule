# Capsule on-time runs: one-off setup (Windows PowerShell). Takes about 2 minutes.
#
# Before running: create the GitHub token (the link is in the README's "On-time runs" section),
# with Repository access set to "Only select repositories" -> capsule, and copy it.
#
# Run from this folder:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js isn't installed (npx not found). Install the LTS from https://nodejs.org and run this again." -ForegroundColor Red
    exit 1
}

Write-Host "`n1/3  Deploying the capsule-cron Worker to your Cloudflare account" -ForegroundColor Cyan
Write-Host "     (a browser window opens if Wrangler needs you to log in to Cloudflare)"
npx --yes wrangler@4 deploy
if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed: see the message above." -ForegroundColor Red; exit 1 }

Write-Host "`n2/3  Paste your GitHub token and press Enter (nothing shows while you paste)" -ForegroundColor Cyan
npx --yes wrangler@4 secret put GITHUB_TOKEN
if ($LASTEXITCODE -ne 0) { Write-Host "Saving the token failed: see the message above." -ForegroundColor Red; exit 1 }

Write-Host "`n3/3  Optional: Discord webhook URL for failure alerts (press Enter to skip)" -ForegroundColor Cyan
$hook = Read-Host "Webhook URL"
if ($hook) {
    $hook | npx --yes wrangler@4 secret put DISCORD_WEBHOOK
}

Write-Host "`nDone. The price check now starts at 07:15, 13:15 and 19:15 UK time (an hour earlier in winter)." -ForegroundColor Green
Write-Host "Check it any time: https://github.com/CyberSecDigestDaily/capsule/actions"
