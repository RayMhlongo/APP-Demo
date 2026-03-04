param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectName = "cathel-creamy-pwa"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying current folder to Cloudflare Pages project: $ProjectName"
Write-Host "If this is your first deploy, run: npx wrangler login"

cmd /c npx wrangler pages deploy . --project-name $ProjectName
