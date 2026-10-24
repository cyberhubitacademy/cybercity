# Cyber City offline launcher: serves the game folder on http://localhost:8642 and opens the browser.
# Uses only what ships with Windows (PowerShell + .NET HttpListener). Close this window to stop the game server.
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'game'
$port = 8642
$prefix = "http://localhost:$port/"
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.css' = 'text/css'; '.json' = 'application/json'
  '.glb' = 'model/gltf-binary'; '.hdr' = 'application/octet-stream'; '.mp3' = 'audio/mpeg'; '.jpg' = 'image/jpeg'
  '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.webp' = 'image/webp'; '.txt' = 'text/plain'; '.wasm' = 'application/wasm'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch { Write-Host "Port $port is busy. Close other Cyber City windows and try again."; Read-Host 'Press Enter to exit'; exit 1 }
Write-Host "Cyber City is running at $prefix  (keep this window open while you play; close it to stop)"
if (-not $env:CC_NOBROWSER) { Start-Process $prefix }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($path -eq '') { $path = 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  if (-not $file.StartsWith([IO.Path]::GetFullPath($root)) -or -not (Test-Path $file -PathType Leaf)) {
    $ctx.Response.StatusCode = 404
  } else {
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
    $bytes = [IO.File]::ReadAllBytes($file)
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  }
  $ctx.Response.Close()
}
