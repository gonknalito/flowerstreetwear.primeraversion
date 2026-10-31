using Flowers;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.StaticFiles;
using System.Security.Cryptography;
using System.Text.Json;

// ---------- Configuración (variables de entorno; ver .env.example) ----------
string env = Environment.GetEnvironmentVariable("FLOWERS_ENV") ?? "development";
bool dev = env != "production";
string serverDir = Directory.GetCurrentDirectory();
string dataDir = Path.GetFullPath(Environment.GetEnvironmentVariable("FLOWERS_DATA_DIR") ?? Path.Combine(serverDir, "data"));
string siteDir = Path.GetFullPath(Environment.GetEnvironmentVariable("FLOWERS_SITE_DIR") ?? Path.Combine(serverDir, ".."));
string port = Environment.GetEnvironmentVariable("FLOWERS_PORT") ?? "5080";
Directory.CreateDirectory(dataDir); Directory.CreateDirectory(Path.Combine(dataDir, "uploads"));
Db.DataDir = dataDir; Db.DbPath = Path.Combine(dataDir, "flowers.db");

string secret = Environment.GetEnvironmentVariable("FLOWERS_WEBHOOK_SECRET") ?? "";
if (secret == "")
{   // En desarrollo se genera una vez y se guarda fuera del código (data/ no se sube a GitHub).
    var sf = Path.Combine(dataDir, "secrets.json");
    if (File.Exists(sf)) secret = JsonDocument.Parse(File.ReadAllText(sf)).RootElement.GetProperty("webhookSecret").GetString()!;
    else { secret = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(); File.WriteAllText(sf, JsonSerializer.Serialize(new { webhookSecret = secret })); }
}
if (!dev && Environment.GetEnvironmentVariable("FLOWERS_WEBHOOK_SECRET") == null) throw new InvalidOperationException("En producción define FLOWERS_WEBHOOK_SECRET.");

Catalog.Init(dev);

// ---------- Orden privada para crear el primer administrador ----------
if (args.Length >= 2 && args[0] == "create-admin")
{
    string email = args[1].Trim().ToLowerInvariant();
    string? pw = args.Length >= 4 && args[2] == "--password" ? args[3] : null;
    if (pw == null) { Console.Write("Contraseña (mín. 10 caracteres, con letras y números): "); pw = Console.ReadLine() ?? ""; }
    var prob = Sec.PasswordProblem(pw); if (!Sec.ValidEmail(email) || prob != "") { Console.Error.WriteLine(prob != "" ? prob : "Correo inválido."); return 1; }
    using var c = Db.Open();
    if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM users WHERE email=@p0", email) > 0) { Console.Error.WriteLine("Ese correo ya existe."); return 1; }
    Db.Exec(c, "INSERT INTO users(email,password_hash,role,name,email_verified,created_at) VALUES(@p0,@p1,'admin','Administrador',1,@p2)", email, Sec.HashPassword(pw), Db.Now());
    Console.WriteLine($"Administrador creado: {email}. Al iniciar sesión por primera vez se configurará el segundo factor.");
    return 0;
}

// ---------- Copia de seguridad: base de datos + fotos (ver README / PUBLICAR_Y_COBRAR) ----------
if (args.Length >= 1 && args[0] == "backup")
{
    string dest = Path.GetFullPath(args.Length >= 2 ? args[1] : Path.Combine(serverDir, "backups", DateTime.Now.ToString("yyyyMMdd-HHmmss")));
    Directory.CreateDirectory(dest);
    using (var c = Db.Open()) Db.Exec(c, $"VACUUM INTO '{Path.Combine(dest, "flowers.db").Replace("'", "''")}'");   // copia consistente aunque el servidor esté en uso
    void Copy(string from, string to) { Directory.CreateDirectory(to); foreach (var f in Directory.GetFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)), true); foreach (var d in Directory.GetDirectories(from)) Copy(d, Path.Combine(to, Path.GetFileName(d))); }
    var up = Path.Combine(dataDir, "uploads"); if (Directory.Exists(up)) Copy(up, Path.Combine(dest, "uploads"));
    Console.WriteLine($"Copia creada en: {dest}");
    return 0;
}

var builder = WebApplication.CreateBuilder(new[] { "--urls", $"http://localhost:{port}" });
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.Services.Configure<FormOptions>(o => { o.MultipartBodyLengthLimit = 4 * 1024 * 1024; o.ValueCountLimit = 20; });
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 5 * 1024 * 1024);
var app = builder.Build();

// ---------- Errores, cabeceras de seguridad y protección CSRF ----------
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff"; h["X-Frame-Options"] = "DENY"; h["Referrer-Policy"] = "same-origin";
    h["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'";
    if (ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Method is "POST" or "PUT" or "DELETE" or "PATCH" && !ctx.Request.Path.StartsWithSegments("/api/payments/webhook"))
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        if (ctx.Request.Headers["X-Flowers"] != "1" || (origin != "" && new Uri(origin).Authority != ctx.Request.Host.Value))
        { ctx.Response.StatusCode = 403; await ctx.Response.WriteAsJsonAsync(new { error = "Solicitud no permitida." }); return; }
    }
    try { await next(); }
    catch (OrderException ex) { if (!ctx.Response.HasStarted) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { error = ex.Message, extra = ex.Payload }); } }
    catch (Exception ex)
    {   // No se registran cuerpos de solicitud ni datos personales: solo el tipo de error.
        Console.Error.WriteLine($"[error] {ctx.Request.Method} {ctx.Request.Path}: {ex.GetType().Name} {ex.Message}");
        if (!ctx.Response.HasStarted) { ctx.Response.StatusCode = 500; await ctx.Response.WriteAsJsonAsync(new { error = "Ocurrió un error. Inténtalo de nuevo." }); }
    }
});

PublicApi.Map(app, dev, secret);
AdminApi.Map(app, dataDir);

// ---------- Archivos públicos: solo carpetas permitidas (nunca server/, _interno/ ni la base de datos) ----------
var types = new FileExtensionContentTypeProvider(); types.Mappings[".avif"] = "image/avif"; types.Mappings[".webp"] = "image/webp";
IResult Serve(string root, string rel, bool immutable)
{
    var full = Path.GetFullPath(Path.Combine(root, rel));
    if (!full.StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar) || !File.Exists(full)) return Results.NotFound();
    types.TryGetContentType(full, out var ct);
    return Results.File(full, ct ?? "application/octet-stream", enableRangeProcessing: false, lastModified: null, entityTag: null) is var r && immutable ? new CachedResult(r, "public, max-age=31536000, immutable") : new CachedResult(r, "no-cache");
}
app.MapGet("/uploads/{**path}", (string path) => Serve(Path.Combine(dataDir, "uploads"), path, true));
app.MapFallback("/{**path}", (HttpContext ctx) =>
{
    var p = ctx.Request.Path.Value ?? "/"; if (p == "/") p = "/index.html";
    var rel = p.TrimStart('/');
    bool allowed = rel is "index.html" or "admin.html" || rel.StartsWith("css/") || rel.StartsWith("assets/") || (rel.StartsWith("js/") && rel != "js/catalogo.js");
    return allowed ? Serve(siteDir, rel, false) : Results.NotFound();
});

_ = Task.Run(() => Notify.Loop(app.Lifetime.ApplicationStopping));
Console.WriteLine($"Flowers ({env}) → http://localhost:{port}   ·   datos: {dataDir}");
if (dev) Console.WriteLine("MODO DESARROLLO: pagos y notificaciones SIMULADOS. Bandeja de pruebas: /dev/bandeja");
await app.RunAsync();
return 0;

class CachedResult(IResult inner, string cache) : IResult
{
    public async Task ExecuteAsync(HttpContext ctx) { ctx.Response.Headers.CacheControl = cache; await inner.ExecuteAsync(ctx); }
}
