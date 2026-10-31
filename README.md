# Flowers Streetwear · Tienda online

Tienda con catálogo, cuentas de clientes, panel de administrador, inventario con reservas, pedidos, pagos y avisos.
**Estado actual: desarrollo local con pagos y correos SIMULADOS.** No cobra dinero ni envía mensajes reales.

## Qué hay aquí
| Carpeta / archivo | Contenido |
|---|---|
| `index.html`, `css/styles.css`, `js/app.js`, `js/art.js`, `js/data.js` | La tienda pública (diseño original conservado) |
| `admin.html`, `js/admin.js`, `css/admin.css` | Panel privado de administración |
| `server/` | Servidor (.NET 9 + SQLite): API, base de datos, reservas, pagos simulados, avisos |
| `server/seed/catalog.seed.json` | Catálogo inicial migrado desde `js/catalogo.js` (solo se usa si la base está vacía) |
| `server/tests/smoke.ps1` | Pruebas automáticas del servidor |
| `_interno/` | Documentos internos (no se suben a GitHub ni se publican) |

`js/catalogo.js` quedó como **respaldo histórico** del catálogo original; la tienda ya no lo carga (el servidor lo bloquea). El catálogo vigente vive en la base de datos y se edita desde el panel.

## Requisitos (todo gratuito)
- Windows con **.NET 9 SDK** (ya instalado en este equipo).
- Un navegador moderno.

## Iniciar la tienda en local
```bash
cd server
dotnet run
```
Abre http://localhost:5080 (tienda) y http://localhost:5080/admin.html (panel).

### Crear el primer administrador (orden privada, solo en el servidor)
```bash
cd server
dotnet run -- create-admin tu-correo@ejemplo.com
```
Pide la contraseña (mínimo 10 caracteres, con letras y números). En el primer ingreso al panel se configura el **doble factor** con una app autenticadora (la clave se muestra en pantalla). Otros administradores se agregan por **invitación** desde el panel.

### Herramientas de prueba (solo con `FLOWERS_ENV=development`, que es el valor por defecto)
- `/pago-simulado/…` : pantalla de pago **falsa** para aprobar, dejar pendiente, rechazar o cancelar.
- `/dev/bandeja` : bandeja con los correos y avisos de WhatsApp que el sistema *habría* enviado.

## Pruebas
```bash
powershell -ExecutionPolicy Bypass -File server/tests/smoke.ps1
```
Crea una base de datos descartable (`server/data-test/`), arranca el servidor en el puerto 5081 y comprueba permisos, precios, reservas, pagos duplicados, avisos, fotos y más.

## Copias de seguridad
```bash
cd server
dotnet run -- backup            # crea server/backups/AAAAMMDD-HHMMSS con flowers.db + uploads/
dotnet run -- backup D:\respaldos\hoy
```
**Restaurar:** detén el servidor, reemplaza `server/data/flowers.db` y `server/data/uploads/` con los de la copia y vuelve a iniciar. GitHub guarda el código; **los datos y las fotos se respaldan aparte** con este comando.

## Seguridad en breve
- Contraseñas con PBKDF2-SHA256 y sal aleatoria; sesiones en cookie `HttpOnly`.
- Los precios, el stock y los totales los calcula siempre el servidor.
- El rol de las cuentas nuevas es siempre «cliente»; el administrador se crea por orden privada o invitación y exige segundo factor.
- Los datos privados (`server/data/`, `.env`, `_interno/`, PDFs) están en `.gitignore`.
- Para publicar y cobrar de verdad: ver `_interno/PUBLICAR_Y_COBRAR.md`.
