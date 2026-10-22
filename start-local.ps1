$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$dataPath = Join-Path $PSScriptRoot 'data'
Write-Host 'Agent Storyboard: http://127.0.0.1:43218'
Write-Host 'Press Ctrl+C to stop. Project data is saved in ./data.'
& $nodePath (Join-Path $PSScriptRoot 'server.mjs') --data-dir $dataPath --port 43218
exit $LASTEXITCODE
