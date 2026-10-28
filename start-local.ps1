$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$runtimePath = if ($env:AGENT_STORYBOARD_RUNTIME) { $env:AGENT_STORYBOARD_RUNTIME } else { Join-Path $PSScriptRoot '.runtime-voice' }
$ffmpegBin = Join-Path $runtimePath 'ffmpeg\bin'
if (Test-Path -LiteralPath $ffmpegBin) {
    $env:PATH = "$ffmpegBin;$env:PATH"
}
foreach ($tool in @('ffmpeg')) {
    $variable = "AGENT_STORYBOARD_$($tool.ToUpperInvariant())"
    $configured = [Environment]::GetEnvironmentVariable($variable, 'Process')
    $toolPath = if ($configured) { $configured } else { (Get-Command $tool -ErrorAction Stop).Source }
    & $toolPath -version *> $null
    if ($LASTEXITCODE -ne 0) { throw "$tool could not start: $toolPath" }
    [Environment]::SetEnvironmentVariable($variable, $toolPath, 'Process')
    Write-Host "${tool}: $toolPath"
}
$dataPath = Join-Path $PSScriptRoot 'data'
Write-Host 'Agent Storyboard: http://127.0.0.1:43218'
Write-Host 'Press Ctrl+C to stop. Project data is saved in ./data.'
& $nodePath (Join-Path $PSScriptRoot 'server.mjs') --data-dir $dataPath --port 43218
exit $LASTEXITCODE
