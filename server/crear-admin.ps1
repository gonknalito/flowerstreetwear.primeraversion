# Crea una cuenta de administrador (solo en tu computadora).
# Este archivo usa solo caracteres simples para que Windows PowerShell lo lea sin errores.
try {
    Set-Location -LiteralPath $PSScriptRoot
    Write-Host ''
    Write-Host '=== Crear administrador de Flowers ===' -ForegroundColor Magenta
    if (-not (Test-Path 'bin\Debug\net9.0\FlowersServer.dll')) {
        Write-Host 'Preparando el programa (solo la primera vez)...'
        dotnet build | Out-Null
    }
    $correo = Read-Host 'Escribe el correo del administrador'
    Write-Host 'Ahora te pedira la contrasena (minimo 10 caracteres, con letras y numeros).'
    dotnet bin\Debug\net9.0\FlowersServer.dll create-admin $correo
}
catch {
    Write-Host ''
    Write-Host 'Ocurrio un error:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
Write-Host ''
Read-Host 'Pulsa Enter para cerrar esta ventana'
