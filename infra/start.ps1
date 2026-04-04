# Y-AIP Infrastructure — Startup Script (PowerShell)
# Run from the infra/ directory

param(
    [string]$Profile = "",
    [switch]$Down,
    [switch]$Logs,
    [switch]$Status
)

Set-Location $PSScriptRoot

# Copy .env if it doesn't exist
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env from .env.example — review and update secrets before production use" -ForegroundColor Yellow
}

if ($Down) {
    Write-Host "⏹  Stopping Y-AIP services..." -ForegroundColor Red
    docker compose down
    exit 0
}

if ($Status) {
    docker compose ps
    exit 0
}

if ($Logs) {
    docker compose logs -f --tail=50
    exit 0
}

# Build compose command
$composeCmd = "docker compose"
if ($Profile -ne "") {
    $composeCmd += " --profile $Profile"
}

Write-Host "🚀 Starting Y-AIP Infrastructure..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Services starting:" -ForegroundColor White
Write-Host "  📦 Postgres       → localhost:5432"
Write-Host "  🔵 Neo4j          → localhost:7474 (browser), 7687 (bolt)"
Write-Host "  📊 ClickHouse     → localhost:8123"
Write-Host "  📨 Kafka          → localhost:29092"
Write-Host "  📋 Schema Registry→ localhost:8081"
Write-Host "  🪣  MinIO          → localhost:9000 (S3), 9001 (console)"
Write-Host "  ⏱  Temporal       → localhost:7233, UI: localhost:8088"
Write-Host "  🔐 OPA            → localhost:8181"
Write-Host "  🔑 Keycloak       → localhost:8080"
Write-Host "  🔒 OpenBao        → localhost:8200"
Write-Host "  🌐 Traefik        → localhost:80, dashboard: localhost:8090"
if ($Profile -eq "monitoring") {
    Write-Host "  📡 Jaeger         → localhost:16686"
    Write-Host "  📈 Prometheus     → localhost:9090"
}
Write-Host ""

Invoke-Expression "$composeCmd up -d"

Write-Host ""
Write-Host "✅ Y-AIP Infrastructure started!" -ForegroundColor Green
Write-Host ""
Write-Host "Quick links:" -ForegroundColor White
Write-Host "  Neo4j Browser:    http://localhost:7474"
Write-Host "  MinIO Console:    http://localhost:9001  (yaip_minio / yaip_minio_secret)"
Write-Host "  Temporal UI:      http://localhost:8088"
Write-Host "  Keycloak Admin:   http://localhost:8080  (admin / admin)"
Write-Host "  OpenBao UI:       http://localhost:8200"
Write-Host "  Traefik Dash:     http://localhost:8090"
Write-Host ""
Write-Host "To check status:  .\start.ps1 -Status"
Write-Host "To view logs:     .\start.ps1 -Logs"
Write-Host "To stop:          .\start.ps1 -Down"
