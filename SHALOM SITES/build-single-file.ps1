# Packs the whole system into ONE file: SHALOM-STORE.html
# Send that file to a phone (WhatsApp, USB, Bluetooth, email) and open it in Chrome.
# Re-run this script after any change:  right-click > Run with PowerShell
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding $false
$read = { param($n) [IO.File]::ReadAllText((Join-Path $dir $n), $enc) }
$html = & $read 'index.html'
$html = $html.Replace('<link rel="stylesheet" href="styles.css">', "<style>`n" + (& $read 'styles.css') + "`n</style>")
foreach ($js in 'config.js', 'core.js', 'app.js') {
  $html = $html.Replace("<script src=""$js""></script>", "<script>`n" + (& $read $js) + "`n</script>")
}
$out = Join-Path $dir 'SHALOM-STORE.html'
[IO.File]::WriteAllText($out, $html, $enc)
"Created $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
