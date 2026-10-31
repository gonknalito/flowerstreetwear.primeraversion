# Pruebas de humo del servidor (SIMULADAS: sin pagos ni envíos reales). Usa una base de datos propia en data-test/.
#   powershell -ExecutionPolicy Bypass -File server\tests\smoke.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = 5081; $base = "http://localhost:$port"
$testData = Join-Path $root 'data-test'
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*FlowersServer.dll*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
if (Test-Path $testData) { Remove-Item $testData -Recurse -Force }
New-Item -ItemType Directory $testData | Out-Null
$env:FLOWERS_DATA_DIR = $testData; $env:FLOWERS_PORT = "$port"
# Credenciales SOLO de prueba para la base descartable data-test/
$adminEmail = 'admin.prueba@example.com'; $adminPw = 'ClavePrueba2026x'
Push-Location $root
& dotnet build --nologo -v q | Out-Null
& dotnet bin/Debug/net9.0/FlowersServer.dll create-admin $adminEmail --password $adminPw | Out-Null
$srv = Start-Process dotnet -ArgumentList 'bin/Debug/net9.0/FlowersServer.dll' -PassThru -WindowStyle Hidden -RedirectStandardOutput "$testData\out.log" -RedirectStandardError "$testData\err.log"
Pop-Location
for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest "$base/api/config" -UseBasicParsing | Out-Null; break } catch { Start-Sleep -Milliseconds 300 } }

$script:pass = 0; $script:fail = 0
function Check($name, $cond, $detail = '') { if ($cond) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green } else { $script:fail++; Write-Host "  FAIL  $name  $detail" -ForegroundColor Red } }
function Api($method, $path, $body = $null, $sess = $null) {
  $a = @{ Uri = "$base$path"; Method = $method; Headers = @{ 'X-Flowers' = '1' }; UseBasicParsing = $true }
  if ($sess) { $a.WebSession = $sess }
  if ($null -ne $body) { $a.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 8 -Compress)); $a.ContentType = 'application/json; charset=utf-8' }
  try { $r = Invoke-WebRequest @a; $code = [int]$r.StatusCode; $txt = $r.Content }
  catch { $resp = $_.Exception.Response; if (-not $resp) { throw }; $code = [int]$resp.StatusCode; $txt = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() }
  $j = $null; try { $j = $txt | ConvertFrom-Json } catch {}
  [pscustomobject]@{ Code = $code; Json = $j; Text = $txt }
}
function GetCat { $x = ((Invoke-WebRequest "$base/api/catalog.js" -UseBasicParsing).Content -split "window.FLOWERS_PRODUCTS = ")[1].TrimEnd().TrimEnd(';') | ConvertFrom-Json; $x }
function NewSess { New-Object Microsoft.PowerShell.Commands.WebRequestSession }
function Inbox { (Api GET '/api/dev/inbox').Json }
function WaitMail($pred, $sec = 12) { for ($i = 0; $i -lt $sec * 2; $i++) { $m = @(Inbox | Where-Object $pred); if ($m.Count) { return ,$m }; Start-Sleep -Milliseconds 500 }; return ,@() }
function Totp($secret) {
  $al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; foreach ($ch in $secret.ToCharArray()) { $bits += [Convert]::ToString($al.IndexOf($ch), 2).PadLeft(5, '0') }
  $bytes = for ($i = 0; $i + 8 -le $bits.Length; $i += 8) { [Convert]::ToByte($bits.Substring($i, 8), 2) }
  $step = [long][Math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / 30); $msg = [BitConverter]::GetBytes($step); [Array]::Reverse($msg)
  $h = (New-Object Security.Cryptography.HMACSHA1(, [byte[]]$bytes)).ComputeHash($msg); $o = [int]$h[-1] -band 0xf
  $n = (([int]$h[$o] -band 0x7f) -shl 24) -bor ([int]$h[$o + 1] -shl 16) -bor ([int]$h[$o + 2] -shl 8) -bor [int]$h[$o + 3]; '{0:D6}' -f ($n % 1000000)
}
function Pay($payId, $result) { (Api POST "/api/dev/pay/$payId" @{ result = $result }).Json }
function NewOrder($items, $rate = 1, $email = 'cliente@example.com', $sess = $null) {
  Api POST '/api/checkout/create' @{ items = $items; rateId = $rate; name = 'Cliente Prueba'; email = $email; phone = '999888777'; address = @{ line1 = 'Av. Prueba 123'; city = 'Lima'; district = 'Miraflores' } } $sess
}
function PayId($r) { ($r.Json.payUrl -split '/')[-1] }

Write-Host "`n== 1. Catálogo migrado ==" -ForegroundColor Cyan
$js = (Invoke-WebRequest "$base/api/catalog.js" -UseBasicParsing).Content
$prods = ($js -split "window.FLOWERS_PRODUCTS = ")[1].TrimEnd().TrimEnd(';') | ConvertFrom-Json
Check '59 productos publicados' ($prods.Count -eq 59) "hay $($prods.Count)"
$jort = $prods | Where-Object id -eq 'valley-dreams-jort'
Check 'Jort: precios por color (Negro 800 / Azul 950)' ((($jort.variants | Where-Object color -eq 'Negro').price -eq 800) -and (($jort.variants | Where-Object color -eq 'Azul').price -eq 950))
$af1 = $prods | Where-Object id -eq 'nike-air-force-1-x-supreme'
Check 'Colaboración con varias marcas (Nike, Supreme)' (($af1.brands -contains 'Nike') -and ($af1.brands -contains 'Supreme') -and $af1.brands.Count -eq 2)
Check 'Foto existente conservada' ((($prods | Where-Object id -eq 'off-white-ooo-reverse-panda').images[0]) -like '*.avif')
Check 'Sin stock confirmado = no comprable' (-not ($prods | Where-Object id -eq 'ovo-nyc-tee').available -and ($prods | Where-Object id -eq 'ovo-nyc-tee').unconfirmed)
Check 'Cantidad explícita (sombreros = 1) sí es comprable' (($prods | Where-Object id -eq 'sombreros-bad-bunny').available)
Check 'catalog.js no expone costos ni existencias exactas' (($js -notmatch 'cost') -and ($js -notmatch 'stock_on_hand'))
Check 'Tienda, panel, estilos y scripts se sirven (200)' (((Api GET '/').Code -eq 200) -and ((Api GET '/admin.html').Code -eq 200) -and ((Api GET '/css/styles.css').Code -eq 200) -and ((Api GET '/js/app.js').Code -eq 200) -and ((Api GET '/js/admin.js').Code -eq 200) -and ((Api GET '/assets/logo.png').Code -eq 200))
Check 'Archivos internos NO se sirven' ((Api GET '/_interno/PENDIENTES.md').Code -eq 404 -and (Api GET '/server/data-test/flowers.db').Code -eq 404 -and (Api GET '/server/Program.cs').Code -eq 404 -and (Api GET '/_interno/PENDIENTES.md').Code -eq 404 -and (Api GET '/README.md').Code -eq 404 -and (Api GET '/js/catalogo.js').Code -eq 404 -and (Api GET '/Program.cs').Code -eq 404)

Write-Host "`n== 2. Cuentas y permisos ==" -ForegroundColor Cyan
$A = NewSess; $B = NewSess
$r = Api POST '/api/auth/register' @{ email = 'ana@example.com'; password = 'corta'; name = 'Ana' }
Check 'Contraseña débil rechazada' ($r.Code -eq 400)
$r = Api POST '/api/auth/register' @{ email = 'ana@example.com'; password = 'Clave12345ana'; name = 'Ana'; role = 'admin' }
Check 'Registro OK (se ignora cualquier rol enviado)' ($r.Code -eq 200)
Api POST '/api/auth/register' @{ email = 'beto@example.com'; password = 'Clave12345beto'; name = 'Beto' } | Out-Null
$r = Api POST '/api/auth/login' @{ email = 'ana@example.com'; password = 'Clave12345ana' } $A
Check 'No inicia sesión sin verificar el correo' ($r.Code -eq 403)
$mail = WaitMail { $_.recipient -eq 'ana@example.com' -and $_.subject -like 'Verifica*' }
Check 'Correo de verificación llegó a la bandeja simulada' ($mail.Count -ge 1)
$tok = [regex]::Match($mail[0].body, 'token=([\w-]+)').Groups[1].Value
Check 'Verificar con token' ((Api POST '/api/auth/verify' @{ token = $tok }).Code -eq 200)
Check 'Token de verificación no se reutiliza' ((Api POST '/api/auth/verify' @{ token = $tok }).Code -eq 400)
$m2 = WaitMail { $_.recipient -eq 'beto@example.com' }; Api POST '/api/auth/verify' @{ token = [regex]::Match($m2[0].body, 'token=([\w-]+)').Groups[1].Value } | Out-Null
Check 'Login de cliente' ((Api POST '/api/auth/login' @{ email = 'ana@example.com'; password = 'Clave12345ana' } $A).Code -eq 200)
Api POST '/api/auth/login' @{ email = 'beto@example.com'; password = 'Clave12345beto' } $B | Out-Null
Check 'El rol es customer' ((Api GET '/api/auth/me' $null $A).Json.user.role -eq 'customer')
Check 'Cliente NO accede al panel (403)' ((Api GET '/api/admin/summary' $null $A).Code -eq 403)
Check 'Anónimo NO accede al panel (401)' ((Api GET '/api/admin/summary').Code -eq 401)
$csrf = 0; try { Invoke-WebRequest "$base/api/auth/logout" -Method POST -UseBasicParsing | Out-Null } catch { $csrf = [int]$_.Exception.Response.StatusCode }
Check 'Sin cabecera anti-CSRF se rechaza (403)' ($csrf -eq 403)
# recuperación de contraseña
Api POST '/api/auth/forgot' @{ email = 'ana@example.com' } | Out-Null
$rm = WaitMail { $_.recipient -eq 'ana@example.com' -and $_.subject -like 'Restablece*' }
$rt = [regex]::Match($rm[0].body, 'token=([\w-]+)').Groups[1].Value
Check 'Restablecer contraseña' ((Api POST '/api/auth/reset' @{ token = $rt; password = 'NuevaClave2026ana' }).Code -eq 200)
Check 'La clave vieja ya no sirve' ((Api POST '/api/auth/login' @{ email = 'ana@example.com'; password = 'Clave12345ana' } (NewSess)).Code -eq 401)
Check 'La clave nueva sí' ((Api POST '/api/auth/login' @{ email = 'ana@example.com'; password = 'NuevaClave2026ana' } $A).Code -eq 200)
$bad = 0; 1..10 | ForEach-Object { if ((Api POST '/api/auth/login' @{ email = 'ana@example.com'; password = 'x' } (NewSess)).Code -eq 429) { $bad++ } }
Check 'Límite de intentos de login (429)' ($bad -ge 1)

Write-Host "`n== 3. Administrador con doble factor ==" -ForegroundColor Cyan
$AD = NewSess
$r = Api POST '/api/auth/login' @{ email = $adminEmail; password = $adminPw } $AD
Check 'Admin: primer acceso exige configurar 2FA' ($r.Json.mfa.setup -eq $true -and $r.Json.mfa.secret)
Check 'Admin sin 2FA completado NO entra al panel' ((Api GET '/api/admin/summary' $null $AD).Code -eq 403)
Check 'Código 2FA incorrecto rechazado' ((Api POST '/api/auth/mfa' @{ code = '000000' } $AD).Code -eq 401)
Check 'Código 2FA correcto' ((Api POST '/api/auth/mfa' @{ code = (Totp $r.Json.mfa.secret) } $AD).Code -eq 200)
Check 'Admin con 2FA entra al panel' ((Api GET '/api/admin/summary' $null $AD).Code -eq 200)
$AD2 = NewSess; $r2 = Api POST '/api/auth/login' @{ email = $adminEmail; password = $adminPw } $AD2
Check 'Siguiente login: pide código (ya configurado)' ($r2.Json.mfa.required -eq $true -and (Api GET '/api/admin/orders' $null $AD2).Code -eq 403)
Api POST '/api/auth/mfa' @{ code = (Totp $r.Json.mfa.secret) } $AD2 | Out-Null

Write-Host "`n== 4. Inventario desde el panel ==" -ForegroundColor Cyan
function VarId($prod, $color, $size) { ((Api GET "/api/admin/products/$prod" $null $AD).Json.variants | Where-Object { $_.color -eq $color -and $_.size -eq $size }).id }
$vL = VarId 'ovo-nyc-tee' '' 'L'; $vXL = VarId 'ovo-nyc-tee' '' 'XL'
Check 'Cantidad negativa rechazada' ((Api POST '/api/admin/stock' @{ variantId = $vL; quantity = -1 } $AD).Code -eq 400)
Check 'Cargar stock confirmado (L=3, XL=0)' (((Api POST '/api/admin/stock' @{ variantId = $vL; quantity = 3; note = 'Conteo de prueba' } $AD).Code -eq 200) -and ((Api POST '/api/admin/stock' @{ variantId = $vXL; quantity = 0 } $AD).Code -eq 200))
$prods = ((Invoke-WebRequest "$base/api/catalog.js" -UseBasicParsing).Content -split "window.FLOWERS_PRODUCTS = ")[1].TrimEnd().TrimEnd(';') | ConvertFrom-Json
$ovo = $prods | Where-Object id -eq 'ovo-nyc-tee'
Check 'La tienda refleja el cambio (XL agotada, L disponible)' ($ovo.available -and ($ovo.variants[0].soldOut -contains 'XL') -and -not ($ovo.variants[0].soldOut -contains 'L'))
$sx = Api POST '/api/admin/settings'  # método inválido para forzar 405/404 no relevante
Api PUT '/api/admin/settings' @{ 'notify.admin_emails' = 'amigo@example.com'; 'whatsapp.number' = '51999999999' } $AD | Out-Null
Check 'Destinatarios de avisos configurados' ((Api GET '/api/admin/settings' $null $AD).Json.'notify.admin_emails' -eq 'amigo@example.com')
Check 'Correo de destinatario inválido rechazado' ((Api PUT '/api/admin/settings' @{ 'notify.admin_emails' = 'no-es-correo' } $AD).Code -eq 400)

Write-Host "`n== 5. Carrito, precios y reservas ==" -ForegroundColor Cyan
$q = Api POST '/api/checkout/quote' @{ items = @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 2; expected = 100 }); rateId = 2 }
Check 'Precio calculado por el servidor (S/ 450 x2 + envío prueba 10 = 910)' ($q.Json.subtotalCents -eq 90000 -and $q.Json.totalCents -eq 91000)
$r = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 100 })
Check 'Precio manipulado en el cliente → se avisa y NO se crea el pedido' ($r.Code -eq 409 -and $r.Json.extra.lines[0].priceChanged -eq $true)
$r = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'XL'; qty = 1; expected = 45000 })
Check 'Talla agotada no se vende' ($r.Code -eq 409)
$r = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 4; expected = 45000 })
Check 'Más cantidad que stock no se vende' ($r.Code -eq 409)
$r = NewOrder @(@{ id = 'bape-x-adidas-tee'; color = ''; size = 'M'; qty = 1; expected = 35000 })
Check 'Producto sin existencias confirmadas no se vende' ($r.Code -eq 409)

# última unidad: dos compradores a la vez
$jobs = 1..2 | ForEach-Object { Start-Job -ScriptBlock { param($b, $i)
  $body = @{ items = @(@{ id = 'sombreros-bad-bunny'; color = ''; size = ''; qty = 1; expected = 35000 }); rateId = 1; name = "Comprador $i"; email = "c$i@example.com"; phone = '999888777' } | ConvertTo-Json -Depth 6 -Compress
  try { (Invoke-WebRequest "$b/api/checkout/create" -Method POST -Body $body -ContentType 'application/json' -Headers @{ 'X-Flowers' = '1' } -UseBasicParsing).StatusCode } catch { [int]$_.Exception.Response.StatusCode } } -ArgumentList $base, $_ }
$codes = $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job
Check 'Última unidad: solo UN comprador la obtiene' ((@($codes | Where-Object { $_ -eq 200 }).Count -eq 1) -and (@($codes | Where-Object { $_ -eq 409 }).Count -eq 1)) ($codes -join ',')

Write-Host "`n== 6. Pago simulado, webhook e idempotencia ==" -ForegroundColor Cyan
$o1 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 2 'cliente1@example.com'
Check 'Pedido creado con reserva' ($o1.Code -eq 200 -and $o1.Json.number -like 'FL-*')
$st = (Api GET "/api/orders/$($o1.Json.number)?t=$($o1.Json.token)").Json
Check 'Antes del pago: NO figura como pagado' ($st.paymentStatus -eq 'awaiting' -and $st.fulfillmentStatus -eq 'none')
$pid1 = PayId $o1
$wh = (Api POST '/api/payments/webhook/simulado' @{ eventId = 'x'; paymentId = $pid1; type = 'payment.approved' })
Check 'Webhook sin firma válida se rechaza (401)' ($wh.Code -eq 401)
$res = Pay $pid1 'approved'
Check 'Pago aprobado → pagado' ($res.outcome -eq 'pagado')
$st = (Api GET "/api/orders/$($o1.Json.number)?t=$($o1.Json.token)").Json
Check 'Estados separados: pago=paid, preparación=new' ($st.paymentStatus -eq 'paid' -and $st.fulfillmentStatus -eq 'new')
$rep1 = (Api POST "/api/dev/replay/$pid1").Json; $rep2 = (Api POST "/api/dev/replay/$pid1").Json
Check 'Notificación repetida no duplica nada (duplicado)' ($rep1.outcome -eq 'duplicado' -and $rep2.outcome -eq 'duplicado')
$ovo = ((Invoke-WebRequest "$base/api/catalog.js" -UseBasicParsing).Content -split "window.FLOWERS_PRODUCTS = ")[1].TrimEnd().TrimEnd(';') | ConvertFrom-Json | Where-Object id -eq 'ovo-nyc-tee'
Check 'Stock descontado una sola vez (3 → 2)' ((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L').stock -eq 2
Check 'Otro evento "aprobado" nuevo sobre pedido ya pagado no descuenta de nuevo' ((Pay $pid1 'approved').outcome -like 'transición no permitida*' -and ((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L').stock -eq 2)
Start-Sleep -Seconds 4
$cm = @(Inbox | Where-Object { $_.recipient -eq 'cliente1@example.com' -and $_.subject -like "*$($o1.Json.number)*" }); $am = @(Inbox | Where-Object { $_.recipient -eq 'amigo@example.com' -and $_.subject -like "*VENTA PAGADA*$($o1.Json.number)*" })
Check 'Un solo correo al cliente y uno al administrador' ($cm.Count -eq 1 -and $am.Count -eq 1) "cliente=$($cm.Count) admin=$($am.Count)"
Check 'Correo admin: número, total, entrega y enlace al panel' ($am[0].body -match $o1.Json.number -and $am[0].body -match 'S/ 460.00' -and $am[0].body -match 'admin.html#/pedido/' -and $am[0].body -match 'Envío a domicilio')
$ad1 = (Api GET "/api/admin/orders/$($o1.Json.number)" $null $AD).Json
Check 'Panel: pedido nuevo sin leer + marcar leído' ($ad1.order.adminRead -eq $false -and (Api POST "/api/admin/orders/$($o1.Json.number)/read" $null $AD).Code -eq 200 -and (Api GET "/api/admin/orders/$($o1.Json.number)" $null $AD).Json.order.adminRead -eq $true)

# pago pendiente → aviso distinto
$o2 = NewOrder @(@{ id = 'sombreros-bad-bunny'; color = ''; size = ''; qty = 1; expected = 35000 }) 1 'cliente2@example.com'
if ($o2.Code -ne 200) { $o2 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 1 'cliente2@example.com' }
$pid2 = PayId $o2; Pay $pid2 'pending' | Out-Null; Start-Sleep -Seconds 4
Check 'Pago pendiente: aviso "PAGO PENDIENTE" (no venta) y SIN correo de venta pagada' ((@(Inbox | Where-Object { $_.subject -like "*PAGO PENDIENTE*$($o2.Json.number)*" }).Count -eq 1) -and (@(Inbox | Where-Object { $_.subject -like "*VENTA PAGADA*$($o2.Json.number)*" }).Count -eq 0))
Check 'Pendiente → aprobado' ((Pay $pid2 'approved').outcome -eq 'pagado')
# rechazado libera reserva
$st0 = ((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L')
$o3 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 })
if ($o3.Code -eq 200) { Check 'Pago rechazado libera la reserva' ((Pay (PayId $o3) 'rejected').outcome -eq 'rejected' -and ((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L').reserved -eq 0) }

Write-Host "`n== 7. Reserva vencida y pago tardío ==" -ForegroundColor Cyan
Api POST '/api/admin/stock' @{ variantId = $vL; quantity = 1; note = 'ajuste prueba' } $AD | Out-Null
$e1 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 1 'tarde1@example.com'
Api POST "/api/dev/expire/$($e1.Json.number)" | Out-Null
Check 'Reserva vencida → pedido expirado' ((Api GET "/api/orders/$($e1.Json.number)?t=$($e1.Json.token)").Json.paymentStatus -eq 'expired')
$late = (Pay (PayId $e1) 'approved').outcome
Check 'Pago tardío con stock disponible → se confirma' ($late -eq 'pagado')
Api POST '/api/admin/stock' @{ variantId = $vL; quantity = 1; note = 'reponer' } $AD | Out-Null
$e2 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 1 'tarde2@example.com'
Api POST "/api/dev/expire/$($e2.Json.number)" | Out-Null
$e3 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 1 'otro@example.com'
Pay (PayId $e3) 'approved' | Out-Null
$late2 = (Pay (PayId $e2) 'approved').outcome
Check 'Pago tardío SIN stock → pagado pero REQUIERE REVISIÓN (no vende lo que no hay)' ($late2 -eq 'pagado-revisar' -and ((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L').stock -eq 0)
Start-Sleep -Seconds 4
Check 'Aviso al admin de pedido a revisar' (@(Inbox | Where-Object { $_.subject -like "*REQUIERE REVISIÓN*$($e2.Json.number)*" }).Count -eq 1)
Check 'Pedido en revisión no se puede preparar' ((Api POST "/api/admin/orders/$($e2.Json.number)/fulfillment" @{ to = 'preparing' } $AD).Code -eq 400)

Write-Host "`n== 8. Fallos de correo no afectan al pedido ==" -ForegroundColor Cyan
Api PUT '/api/admin/settings' @{ 'sim.email_fail' = '1' } $AD | Out-Null
Api POST '/api/admin/stock' @{ variantId = $vL; quantity = 5; note = 'reponer' } $AD | Out-Null
$f1 = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 1 'falla@example.com'
$fr = Pay (PayId $f1) 'approved'
Check 'Con el correo caído el pago igual se registra' ($fr.outcome -eq 'pagado' -and (Api GET "/api/orders/$($f1.Json.number)?t=$($f1.Json.token)").Json.paymentStatus -eq 'paid')
Start-Sleep -Seconds 5
$ns = (Api GET '/api/admin/notifications' $null $AD).Json | Where-Object { $_.status -eq 'pending' -and $_.attempts -ge 1 -and $_.recipient -eq 'falla@example.com' }
Write-Host (((Api GET '/api/admin/notifications' $null $AD).Json | Select-Object id,recipient,status,attempts | Format-Table | Out-String))
Check 'El fallo queda registrado con reintentos programados' (@($ns).Count -eq 1 -and $ns.error -like '*SIMULADO*') ((Api GET '/api/admin/notifications' $null $AD).Json | Where-Object recipient -eq 'falla@example.com' | ConvertTo-Json -Compress)
Api PUT '/api/admin/settings' @{ 'sim.email_fail' = '0' } $AD | Out-Null
Api POST "/api/admin/notifications/$($ns.id)/retry" $null $AD | Out-Null
$ok = WaitMail { $_.recipient -eq 'falla@example.com' } 10
Check 'Reintento manual desde el panel entrega el correo' ($ok.Count -eq 1)
Check 'Correo de prueba desde el panel' ((Api POST '/api/admin/notifications/test' @{ channel = 'email'; recipient = 'prueba@example.com' } $AD).Code -eq 200)
Api PUT '/api/admin/settings' @{ 'notify.whatsapp.enabled' = '0' } $AD | Out-Null

Write-Host "`n== 9. Pedidos ajenos y estados de envío ==" -ForegroundColor Cyan
$ao = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 2 'ana@example.com' $A
Pay (PayId $ao) 'approved' | Out-Null
Check 'La dueña ve su pedido en su historial' (@((Api GET '/api/account/orders' $null $A).Json | Where-Object number -eq $ao.Json.number).Count -eq 1)
Check 'Otro cliente NO ve pedidos ajenos (historial)' (@((Api GET '/api/account/orders' $null $B).Json).Count -eq 0)
Check 'Otro cliente NO abre el pedido sin código (404)' ((Api GET "/api/orders/$($ao.Json.number)" $null $B).Code -eq 404)
Check 'Invitado con su código sí lo ve' ((Api GET "/api/orders/$($ao.Json.number)?t=$($ao.Json.token)" $null (NewSess)).Code -eq 200)
Check 'Código incorrecto → 404' ((Api GET "/api/orders/$($ao.Json.number)?t=xxxx" $null (NewSess)).Code -eq 404)
Check 'Cliente no puede cambiar estado de pedido' ((Api POST "/api/admin/orders/$($ao.Json.number)/fulfillment" @{ to = 'shipped' } $A).Code -eq 403)
$n = $ao.Json.number
Check 'Transición inválida (nuevo → entregado)' ((Api POST "/api/admin/orders/$n/fulfillment" @{ to = 'delivered' } $AD).Code -eq 400)
Check 'Preparando' ((Api POST "/api/admin/orders/$n/fulfillment" @{ to = 'preparing' } $AD).Code -eq 200)
Check 'Enviar exige seguimiento en entregas a domicilio' ((Api POST "/api/admin/orders/$n/fulfillment" @{ to = 'shipped' } $AD).Code -eq 400)
Check 'Enviado con seguimiento' ((Api POST "/api/admin/orders/$n/fulfillment" @{ to = 'shipped'; carrier = 'Courier Prueba'; code = 'TRK123' } $AD).Code -eq 200)
Check 'Cliente ve el seguimiento' ((Api GET "/api/orders/${n}?t=$($ao.Json.token)").Json.trackingCode -eq 'TRK123')
Check 'Entregado' ((Api POST "/api/admin/orders/$n/fulfillment" @{ to = 'delivered' } $AD).Code -eq 200)
Check 'No se cancela un pedido entregado' ((Api POST "/api/admin/orders/$n/fulfillment" @{ to = 'cancelled' } $AD).Code -eq 400)
# cancelar repone stock
$sBefore = ((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L').stock
$cOrd = NewOrder @(@{ id = 'ovo-nyc-tee'; color = ''; size = 'L'; qty = 1; expected = 45000 }) 1 'cancela@example.com'; Pay (PayId $cOrd) 'approved' | Out-Null
Api POST "/api/admin/orders/$($cOrd.Json.number)/fulfillment" @{ to = 'cancelled'; note = 'prueba' } $AD | Out-Null
Check 'Cancelar un pedido pagado repone el stock una sola vez' (((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'L').stock -eq $sBefore)
$snap = (Api GET "/api/orders/${n}?t=$($ao.Json.token)").Json.items[0]
Api PUT '/api/admin/products/ovo-nyc-tee' @{ name = 'OVO NYC TEE (renombrado)'; sub = 'polos'; status = 'published'; brands = @('OVO'); variants = @(@{ color = ''; size = 'L'; priceCents = 99900 }) } $AD | Out-Null
$snap2 = (Api GET "/api/orders/${n}?t=$($ao.Json.token)").Json.items[0]
Check 'Pedido conserva nombre y precio de cuando se compró' ($snap2.name -eq 'OVO NYC TEE' -and $snap2.unitCents -eq 45000)
Check 'La tienda ya muestra el cambio (nombre y precio)' ((GetCat | Where-Object id -eq 'ovo-nyc-tee').price -eq 999)
Check 'Variante retirada (XL) se oculta, no se borra' (((Api GET '/api/admin/products/ovo-nyc-tee' $null $AD).Json.variants | Where-Object size -eq 'XL').active -eq $false)
Check 'Mismo color con precios distintos se rechaza' ((Api PUT '/api/admin/products/ovo-nyc-tee' @{ name = 'X'; sub = 'polos'; status = 'draft'; brands = @(); variants = @(@{ color = ''; size = 'L'; priceCents = 1000 }, @{ color = ''; size = 'M'; priceCents = 2000 }) } $AD).Code -eq 400)

Write-Host "`n== 10. Fotografías ==" -ForegroundColor Cyan
Add-Type -AssemblyName System.Net.Http
function Upload($path, [byte[]]$bytes, $fname, $fields = @{}) {
  $hc = New-Object System.Net.Http.HttpClient; $ch = New-Object System.Net.Http.HttpClientHandler; $ch.CookieContainer = New-Object Net.CookieContainer
  foreach ($c in $AD.Cookies.GetCookies($base)) { $ch.CookieContainer.Add($c) }; $hc = New-Object System.Net.Http.HttpClient($ch)
  $hc.DefaultRequestHeaders.Add('X-Flowers', '1'); $mp = New-Object System.Net.Http.MultipartFormDataContent
  $fc = New-Object System.Net.Http.ByteArrayContent(, $bytes); $mp.Add($fc, 'file', $fname); foreach ($k in $fields.Keys) { $mp.Add((New-Object System.Net.Http.StringContent($fields[$k])), $k) }
  $resp = $hc.PostAsync("$base$path", $mp).Result; [pscustomobject]@{ Code = [int]$resp.StatusCode; Text = $resp.Content.ReadAsStringAsync().Result }
}
$png = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
$u = Upload '/api/admin/products/stussy-nyc-tee/images' $png 'foto.png' @{ alt = 'Polo Stüssy NYC' }
Check 'Subir foto válida' ($u.Code -eq 200)
$u2 = Upload '/api/admin/products/stussy-nyc-tee/images' $png 'foto2.png' @{ color = '' }
$exe = [Text.Encoding]::ASCII.GetBytes('MZ' + ('A' * 200))
Check 'Archivo no-imagen (renombrado a .png) rechazado' ((Upload '/api/admin/products/stussy-nyc-tee/images' $exe 'virus.png').Code -eq 400)
Check 'Imagen de más de 3 MB rechazada' ((Upload '/api/admin/products/stussy-nyc-tee/images' ([byte[]](@(0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10) + (New-Object byte[] 3300000))) 'grande.png').Code -eq 400)
$pd = (Api GET '/api/admin/products/stussy-nyc-tee' $null $AD).Json
Check 'Dos fotos, la primera es la principal' ($pd.images.Count -eq 2 -and $pd.images[0].isPrimary)
$imgs = @($pd.images | ForEach-Object { @{ id = $_.id; alt = $_.alt; color = ''; isPrimary = ($_.id -eq $pd.images[1].id) } })
$pd2 = (Api PUT '/api/admin/products/stussy-nyc-tee/images' @{ images = $imgs } $AD).Json
Check 'Elegir otra principal y reordenar' ($pd2.images[0].id -eq $pd.images[1].id -and $pd2.images[0].isPrimary)
$file = (Api GET (($pd2.images[0].url)) ).Code
Check 'La foto se sirve desde el almacenamiento persistente' ($file -eq 200)
Check 'Aparece en la tienda con su texto alternativo' ((GetCat | Where-Object id -eq 'stussy-nyc-tee').images.Count -eq 2)
Check 'Eliminar foto' ((Api DELETE "/api/admin/images/$($pd2.images[1].id)" $null $AD).Code -eq 200)

Write-Host "`n== 11. Invitación de administradores ==" -ForegroundColor Cyan
Check 'Cliente no puede invitar admins' ((Api POST '/api/admin/invite' @{ email = 'x@example.com' } $A).Code -eq 403)
Check 'Admin invita' ((Api POST '/api/admin/invite' @{ email = 'socio@example.com' } $AD).Code -eq 200)
$im = WaitMail { $_.recipient -eq 'socio@example.com' }; $it = [regex]::Match($im[0].body, 'token=([\w-]+)').Groups[1].Value
Check 'Aceptar invitación crea admin (con 2FA obligatorio)' ((Api POST '/api/auth/accept-invite' @{ token = $it; password = 'ClaveSocio2026'; name = 'Socio' }).Code -eq 200 -and (Api POST '/api/auth/login' @{ email = 'socio@example.com'; password = 'ClaveSocio2026' } (NewSess)).Json.mfa.setup -eq $true)

Write-Host "`n== Resumen ==" -ForegroundColor Cyan
Write-Host "Aprobadas: $script:pass   Fallidas: $script:fail"
Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
if ($script:fail -gt 0) { Write-Host (Get-Content "$testData\err.log" -ErrorAction SilentlyContinue | Select-Object -Last 15 | Out-String); exit 1 }
