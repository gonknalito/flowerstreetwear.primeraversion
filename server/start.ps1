# Inicia la tienda en modo desarrollo (pagos y correos SIMULADOS). Requiere .NET 9 instalado.
#   powershell -ExecutionPolicy Bypass -File server\start.ps1
Set-Location $PSScriptRoot
dotnet run
