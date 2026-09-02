# Noninteractive readiness gate. No curl. No browser.
$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.hamster\bin;" + $env:PATH

if (-not (Get-Command hamster -ErrorAction SilentlyContinue)) {
  Write-Output "SETUP_NEEDED"
  exit 1
}

try {
  $status = & hamster --no-tui status 2>$null | Out-String
} catch {
  Write-Output "SETUP_NEEDED"
  exit 1
}

if ($status -cnotmatch "Logged in") {
  Write-Output "SETUP_NEEDED"
  exit 1
}

# stdout stays exactly READY or SETUP_NEEDED so the caller can parse it, but the
# reason a sync failed goes to stderr instead of being discarded.
$syncOut = & hamster sync 2>&1
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine(($syncOut | Out-String).TrimEnd())
  Write-Output "SETUP_NEEDED"
  exit 1
}

Write-Output "READY"
