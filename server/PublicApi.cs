using System.Net;
using System.Text;
using System.Text.Json;
using System.Collections.Concurrent;

namespace Flowers;

using Row = Dictionary<string, object?>;

public static class H
{
    public static async Task<JsonElement> Body(HttpContext ctx)
    {
        if (ctx.Request.ContentLength > 262_144) throw new OrderException("Solicitud demasiado grande.");
        using var ms = new MemoryStream(); await ctx.Request.Body.CopyToAsync(ms);
        if (ms.Length > 262_144) throw new OrderException("Solicitud demasiado grande.");
        if (ms.Length == 0) return JsonDocument.Parse("{}").RootElement;
        try { return JsonDocument.Parse(ms.ToArray()).RootElement; } catch { throw new OrderException("Datos inválidos."); }
    }
    public static string Str(JsonElement e, string k, int max = 200)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(k, out var v) || v.ValueKind != JsonValueKind.String) return "";
        var s = v.GetString()!.Trim(); return s.Length > max ? s[..max] : s;
    }
    public static bool Flag(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && (v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) && n == 1));
    public static long Num(JsonElement e, string k, long def = 0) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) ? n : def;
    public static IResult Err(int code, string msg, object? extra = null) => Results.Json(new { error = msg, extra }, statusCode: code);
    public static IResult Ok(object? data = null) => Results.Json(data ?? new { ok = true });
    public static string Esc(string s) => WebUtility.HtmlEncode(s);
    public static CartItem[] Items(JsonElement b)
    {
        var list = new List<CartItem>();
        if (b.ValueKind == JsonValueKind.Object && b.TryGetProperty("items", out var arr) && arr.ValueKind == JsonValueKind.Array)
            foreach (var i in arr.EnumerateArray().Take(60))
                list.Add(new CartItem(Str(i, "id"), Str(i, "color"), Str(i, "size"), (int)Math.Clamp(Num(i, "qty", 1), 1, 20), i.TryGetProperty("expected", out var ex) && ex.ValueKind == JsonValueKind.Number ? ex.GetInt64() : null));
        return list.ToArray();
    }
}

public static class PublicApi
{
    public static readonly ConcurrentDictionary<string, string> LastEvent = new();

    public static object UserJson(CurUser u) => new { email = u.Email, name = u.Name, phone = u.Phone, role = u.Role, verified = u.EmailVerified, mfaOk = u.MfaOk, totpEnabled = u.TotpEnabled };

    public static object OrderJson(Microsoft.Data.Sqlite.SqliteConnection c, Row o, bool admin = false)
    {
        long id = Db.L(o, "id");
        var items = Db.Rows(c, "SELECT * FROM order_items WHERE order_id=@p0 ORDER BY id", id).Select(i => new
        {
            productId = Db.S(i, "product_id"), name = Db.S(i, "product_name"), brands = Db.S(i, "brands"), color = Db.S(i, "color"), size = Db.S(i, "size"), qty = Db.L(i, "qty"), unitCents = Db.L(i, "unit_cents"), image = Db.S(i, "image_url")
        }).ToList();
        return new
        {
            number = Db.S(o, "number"), createdAt = Db.S(o, "created_at"), paidAt = Db.S(o, "paid_at"), email = Db.S(o, "email"), name = Db.S(o, "customer_name"), phone = Db.S(o, "phone"),
            address = JsonSerializer.Deserialize<JsonElement>(Db.S(o, "address_json")), shippingMethod = Db.S(o, "shipping_method"), shippingKind = Db.S(o, "shipping_kind"), shippingZone = Db.S(o, "shipping_zone"),
            shippingCents = Db.L(o, "shipping_cents"), subtotalCents = Db.L(o, "subtotal_cents"), totalCents = Db.L(o, "total_cents"),
            paymentStatus = Db.S(o, "payment_status"), fulfillmentStatus = Db.S(o, "fulfillment_status"), needsReview = Db.L(o, "needs_review") == 1,
            carrier = Db.S(o, "carrier"), trackingCode = Db.S(o, "tracking_code"), trackingUrl = Db.S(o, "tracking_url"), isTest = Db.L(o, "is_test") == 1, items,
            id = admin ? id : (long?)null, reviewNote = admin ? Db.S(o, "review_note") : null, adminRead = admin ? Db.L(o, "admin_read") == 1 : (bool?)null
        };
    }

    public static void Map(WebApplication app, bool dev, string webhookSecret)
    {
        // ---------- Catálogo y configuración ----------
        app.MapGet("/api/catalog.js", () => Results.Text(Catalog.BuildCatalogJs(), "application/javascript; charset=utf-8"));
        app.MapGet("/api/config", () => Results.Json(Catalog.PublicConfig(dev)));

        // ---------- Autenticación ----------
        app.MapGet("/api/auth/me", (HttpContext ctx) => { var u = Sec.Current(ctx); return Results.Json(new { user = u == null ? null : UserJson(u) }); });

        app.MapPost("/api/auth/register", async (HttpContext ctx) =>
        {
            if (Sec.RateLimited("reg:" + Sec.Ip(ctx), 10, TimeSpan.FromHours(1))) return H.Err(429, "Demasiados intentos. Prueba más tarde.");
            var b = await H.Body(ctx); string email = H.Str(b, "email", 160).ToLowerInvariant(), pw = H.Str(b, "password", 120), name = H.Str(b, "name", 100), phone = H.Str(b, "phone", 30);
            if (!Sec.ValidEmail(email)) return H.Err(400, "Escribe un correo válido.");
            if (name.Length < 2) return H.Err(400, "Escribe tu nombre.");
            var prob = Sec.PasswordProblem(pw); if (prob != "") return H.Err(400, prob);
            using var c = Db.Open();
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM users WHERE email=@p0", email) == 0)
            {
                // El rol SIEMPRE es «customer»: nadie puede elegir otro desde el registro.
                long uid = Db.Insert(c, "INSERT INTO users(email,password_hash,role,name,phone,email_verified,created_at) VALUES(@p0,@p1,'customer',@p2,@p3,0,@p4)", email, Sec.HashPassword(pw), name, phone, Db.Now());
                QueueVerify(c, uid, email, name);
            }
            return H.Ok(new { ok = true, message = "Te enviamos un correo para verificar tu cuenta." });   // respuesta igual exista o no el correo
        });

        app.MapPost("/api/auth/resend", async (HttpContext ctx) =>
        {
            if (Sec.RateLimited("resend:" + Sec.Ip(ctx), 5, TimeSpan.FromHours(1))) return H.Err(429, "Demasiados intentos.");
            var b = await H.Body(ctx); string email = H.Str(b, "email", 160).ToLowerInvariant();
            using var c = Db.Open(); var u = Db.One(c, "SELECT * FROM users WHERE email=@p0 AND email_verified=0", email);
            if (u != null) QueueVerify(c, Db.L(u, "id"), email, Db.S(u, "name"), true);
            return H.Ok();
        });

        app.MapPost("/api/auth/verify", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string tok = H.Str(b, "token", 100);
            using var c = Db.Open();
            var t = Db.One(c, "SELECT * FROM tokens WHERE token_hash=@p0 AND kind='verify' AND used_at IS NULL AND expires_at>@p1", Db.Sha256(tok), Db.Now());
            if (t == null) return H.Err(400, "El enlace no es válido o ya venció.");
            Db.Exec(c, "UPDATE users SET email_verified=1 WHERE id=@p0", Db.L(t, "user_id"));
            Db.Exec(c, "UPDATE tokens SET used_at=@p1 WHERE token_hash=@p0", Db.Sha256(tok), Db.Now());
            return H.Ok();
        });

        app.MapPost("/api/auth/login", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string email = H.Str(b, "email", 160).ToLowerInvariant(), pw = H.Str(b, "password", 120);
            if (Sec.RateLimited("login-ip:" + Sec.Ip(ctx), 25, TimeSpan.FromMinutes(10)) || Sec.RateLimited("login:" + email, 8, TimeSpan.FromMinutes(10))) return H.Err(429, "Demasiados intentos. Espera unos minutos.");
            using var c = Db.Open();
            var u = Db.One(c, "SELECT * FROM users WHERE email=@p0", email);
            bool ok = Sec.VerifyPassword(pw, u == null ? "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" : Db.S(u, "password_hash"));
            if (u == null || !ok) return H.Err(401, "Correo o contraseña incorrectos.");
            if (Db.L(u, "email_verified") != 1) return H.Err(403, "Verifica tu correo antes de iniciar sesión.", new { code = "unverified" });
            bool admin = Db.S(u, "role") == "admin";
            var tok = Sec.CreateSession(c, Db.L(u, "id"), !admin, admin);
            Sec.SetCookie(ctx, tok, admin);
            object? mfa = null;
            if (admin)
            {
                if (Db.L(u, "totp_enabled") == 1) mfa = new { required = true };
                else
                {
                    var secret = Db.S(u, "totp_secret"); if (secret == "") { secret = Sec.NewTotpSecret(); Db.Exec(c, "UPDATE users SET totp_secret=@p1 WHERE id=@p0", Db.L(u, "id"), secret); }
                    mfa = new { setup = true, secret, uri = $"otpauth://totp/Flowers:{Uri.EscapeDataString(email)}?secret={secret}&issuer=Flowers" };
                }
            }
            return H.Ok(new { ok = true, role = Db.S(u, "role"), mfa });
        });

        app.MapPost("/api/auth/mfa", async (HttpContext ctx) =>
        {
            var u = Sec.Current(ctx); if (u is not { IsAdmin: true }) return H.Err(401, "Inicia sesión.");
            if (Sec.RateLimited("mfa:" + u.Id, 10, TimeSpan.FromMinutes(10))) return H.Err(429, "Demasiados intentos.");
            var b = await H.Body(ctx); string code = H.Str(b, "code", 10);
            using var c = Db.Open(); var row = Db.One(c, "SELECT totp_secret FROM users WHERE id=@p0", u.Id);
            var secret = row == null ? "" : Db.S(row, "totp_secret");
            if (secret == "" || !Sec.TotpVerify(secret, code)) return H.Err(401, "Código incorrecto.");
            Db.Exec(c, "UPDATE users SET totp_enabled=1 WHERE id=@p0", u.Id);
            Db.Exec(c, "UPDATE sessions SET mfa_ok=1 WHERE token_hash=@p0", Db.Sha256(ctx.Request.Cookies[Sec.Cookie]!));
            Db.Exec(c, "INSERT INTO audit_log(user_id,action,created_at) VALUES(@p0,'admin_mfa_ok',@p1)", u.Id, Db.Now());
            return H.Ok();
        });

        app.MapPost("/api/auth/logout", (HttpContext ctx) =>
        {
            if (ctx.Request.Cookies.TryGetValue(Sec.Cookie, out var t)) { using var c = Db.Open(); Db.Exec(c, "DELETE FROM sessions WHERE token_hash=@p0", Db.Sha256(t)); }
            ctx.Response.Cookies.Delete(Sec.Cookie); return H.Ok();
        });

        app.MapPost("/api/auth/forgot", async (HttpContext ctx) =>
        {
            if (Sec.RateLimited("forgot:" + Sec.Ip(ctx), 6, TimeSpan.FromHours(1))) return H.Err(429, "Demasiados intentos.");
            var b = await H.Body(ctx); string email = H.Str(b, "email", 160).ToLowerInvariant();
            using var c = Db.Open(); var u = Db.One(c, "SELECT * FROM users WHERE email=@p0", email);
            if (u != null)
            {
                var tok = Sec.NewToken();
                Db.Exec(c, "INSERT INTO tokens(token_hash,user_id,kind,email,expires_at) VALUES(@p0,@p1,'reset',@p2,@p3)", Db.Sha256(tok), Db.L(u, "id"), email, Db.In(TimeSpan.FromHours(1)));
                Notify.Enqueue(c, "email", "reset_password", email, "Restablece tu contraseña", $"Hola {Db.S(u, "name")},\n\nPara crear una nueva contraseña entra aquí (vence en 1 hora):\n{Notify.BaseUrl(c)}/#/restablecer?token={tok}\n\nSi no fuiste tú, ignora este mensaje.", null, null);
            }
            return H.Ok(new { ok = true, message = "Si el correo existe, te enviamos un enlace." });
        });

        app.MapPost("/api/auth/reset", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string tok = H.Str(b, "token", 100), pw = H.Str(b, "password", 120);
            var prob = Sec.PasswordProblem(pw); if (prob != "") return H.Err(400, prob);
            using var c = Db.Open();
            var t = Db.One(c, "SELECT * FROM tokens WHERE token_hash=@p0 AND kind='reset' AND used_at IS NULL AND expires_at>@p1", Db.Sha256(tok), Db.Now());
            if (t == null) return H.Err(400, "El enlace no es válido o ya venció.");
            Db.Exec(c, "UPDATE users SET password_hash=@p1, email_verified=1 WHERE id=@p0", Db.L(t, "user_id"), Sec.HashPassword(pw));
            Db.Exec(c, "DELETE FROM sessions WHERE user_id=@p0", Db.L(t, "user_id"));
            Db.Exec(c, "UPDATE tokens SET used_at=@p1 WHERE token_hash=@p0", Db.Sha256(tok), Db.Now());
            return H.Ok();
        });

        // Invitación de administrador: la única vía para crear cuentas con rol admin (además de la orden privada por consola).
        app.MapPost("/api/auth/accept-invite", async (HttpContext ctx) =>
        {
            if (Sec.RateLimited("invite:" + Sec.Ip(ctx), 10, TimeSpan.FromHours(1))) return H.Err(429, "Demasiados intentos.");
            var b = await H.Body(ctx); string tok = H.Str(b, "token", 100), pw = H.Str(b, "password", 120), name = H.Str(b, "name", 100);
            var prob = Sec.PasswordProblem(pw); if (prob != "") return H.Err(400, prob);
            if (name.Length < 2) return H.Err(400, "Escribe tu nombre.");
            using var c = Db.Open();
            var t = Db.One(c, "SELECT * FROM tokens WHERE token_hash=@p0 AND kind='invite' AND used_at IS NULL AND expires_at>@p1", Db.Sha256(tok), Db.Now());
            if (t == null) return H.Err(400, "La invitación no es válida o ya venció.");
            string email = Db.S(t, "email");
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM users WHERE email=@p0", email) > 0) return H.Err(400, "Ese correo ya tiene una cuenta.");
            long uid = Db.Insert(c, "INSERT INTO users(email,password_hash,role,name,email_verified,created_at) VALUES(@p0,@p1,'admin',@p2,1,@p3)", email, Sec.HashPassword(pw), name, Db.Now());
            Db.Exec(c, "UPDATE tokens SET used_at=@p1 WHERE token_hash=@p0", Db.Sha256(tok), Db.Now());
            Db.Exec(c, "INSERT INTO audit_log(user_id,action,detail,created_at) VALUES(@p0,'admin_invite_accepted',@p1,@p2)", uid, email, Db.Now());
            return H.Ok();
        });

        // ---------- Cuenta del cliente (solo sus propios datos) ----------
        app.MapGet("/api/account", (HttpContext ctx) =>
        {
            var u = Sec.Current(ctx); if (u == null) return H.Err(401, "Inicia sesión.");
            using var c = Db.Open();
            return H.Ok(new { user = UserJson(u), addresses = Db.Rows(c, "SELECT * FROM addresses WHERE user_id=@p0 ORDER BY is_default DESC, id", u.Id).Select(AddrJson).ToList() });
        });
        app.MapPut("/api/account", async (HttpContext ctx) =>
        {
            var u = Sec.Current(ctx); if (u == null) return H.Err(401, "Inicia sesión.");
            var b = await H.Body(ctx); string name = H.Str(b, "name", 100);
            if (name.Length < 2) return H.Err(400, "Escribe tu nombre.");
            using var c = Db.Open(); Db.Exec(c, "UPDATE users SET name=@p1, phone=@p2 WHERE id=@p0", u.Id, name, H.Str(b, "phone", 30)); return H.Ok();
        });
        app.MapPost("/api/account/addresses", async (HttpContext ctx) =>
        {
            var u = Sec.Current(ctx); if (u == null) return H.Err(401, "Inicia sesión.");
            var b = await H.Body(ctx);
            if (H.Str(b, "name").Length < 2 || H.Str(b, "line1").Length < 4 || H.Str(b, "city").Length < 2) return H.Err(400, "Completa nombre, dirección y ciudad.");
            using var c = Db.Open();
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM addresses WHERE user_id=@p0", u.Id) >= 10) return H.Err(400, "Máximo 10 direcciones.");
            bool def = H.Flag(b, "isDefault") || Db.Scalar<long>(c, "SELECT COUNT(*) FROM addresses WHERE user_id=@p0", u.Id) == 0;
            if (def) Db.Exec(c, "UPDATE addresses SET is_default=0 WHERE user_id=@p0", u.Id);
            long id = Db.Insert(c, "INSERT INTO addresses(user_id,label,name,phone,line1,district,city,reference,is_default) VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)", u.Id, H.Str(b, "label", 40), H.Str(b, "name", 100), H.Str(b, "phone", 30), H.Str(b, "line1"), H.Str(b, "district", 100), H.Str(b, "city", 100), H.Str(b, "reference"), def ? 1 : 0);
            return H.Ok(new { ok = true, id });
        });
        app.MapDelete("/api/account/addresses/{id:long}", (HttpContext ctx, long id) =>
        {
            var u = Sec.Current(ctx); if (u == null) return H.Err(401, "Inicia sesión.");
            using var c = Db.Open(); Db.Exec(c, "DELETE FROM addresses WHERE id=@p0 AND user_id=@p1", id, u.Id); return H.Ok();   // filtra por dueño
        });
        app.MapGet("/api/account/orders", (HttpContext ctx) =>
        {
            var u = Sec.Current(ctx); if (u == null) return H.Err(401, "Inicia sesión.");
            using var c = Db.Open();
            return H.Ok(Db.Rows(c, "SELECT * FROM orders WHERE user_id=@p0 ORDER BY id DESC LIMIT 100", u.Id).Select(o => OrderJson(c, o)).ToList());
        });

        // Estado de un pedido: dueño con sesión, o invitado con su código privado.
        app.MapGet("/api/orders/{number}", (HttpContext ctx, string number) =>
        {
            using var c = Db.Open();
            var o = Db.One(c, "SELECT * FROM orders WHERE number=@p0", number);
            var u = Sec.Current(ctx); string t = ctx.Request.Query["t"].ToString();
            bool owner = o != null && u != null && Db.NL(o, "user_id") == u.Id;
            bool token = o != null && t != "" && System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(Db.S(o, "access_token")), Encoding.UTF8.GetBytes(t));
            if (o == null || !(owner || token)) return H.Err(404, "Pedido no encontrado.");
            return H.Ok(OrderJson(c, o));
        });

        // ---------- Checkout ----------
        app.MapPost("/api/checkout/quote", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); using var c = Db.Open();
            var lines = Orders.Quote(c, H.Items(b));
            long sub = lines.Where(l => l.Issue == null).Sum(l => l.UnitCents * l.Qty);
            var sr = Orders.ShippingRate(c, H.Num(b, "rateId"));
            return H.Ok(new { lines = lines.Select(Orders.LineJson).ToList(), subtotalCents = sub, shippingCents = sr == null ? (long?)null : Db.L(sr.Value.rate, "price_cents"), totalCents = sr == null ? (long?)null : sub + Db.L(sr.Value.rate, "price_cents"), blocked = lines.Any(l => l.Issue != null) });
        });

        app.MapPost("/api/checkout/create", async (HttpContext ctx) =>
        {
            if (!dev) return H.Err(503, "Los pagos aún no están habilitados en la tienda.");
            if (Sec.RateLimited("co:" + Sec.Ip(ctx), 30, TimeSpan.FromHours(1))) return H.Err(429, "Demasiados intentos. Prueba más tarde.");
            var b = await H.Body(ctx); var u = Sec.Current(ctx);
            JsonElement? addr = b.TryGetProperty("address", out var a) && a.ValueKind == JsonValueKind.Object ? a : null;
            try
            {
                var r = Orders.Create(H.Items(b), H.Num(b, "rateId"), H.Str(b, "name", 100), H.Str(b, "email", 160), H.Str(b, "phone", 30), addr, u?.Id);
                return H.Ok(new { ok = true, number = r.number, token = r.token, payUrl = "/pago-simulado/" + r.paymentId });
            }
            catch (OrderException ex) { return H.Err(409, ex.Message, ex.Payload); }
        });

        // ---------- Webhook del proveedor (firmado). El proveedor SIMULADO usa esta misma ruta y verificación. ----------
        app.MapPost("/api/payments/webhook/simulado", async (HttpContext ctx) =>
        {
            using var sr = new StreamReader(ctx.Request.Body); var body = await sr.ReadToEndAsync();
            try { return H.Ok(new { ok = true, outcome = Orders.ReceiveWebhook(webhookSecret, ctx.Request.Headers["X-Signature"].ToString(), body) }); }
            catch (UnauthorizedAccessException) { return H.Err(401, "Firma inválida."); }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException) { return H.Err(400, "Evento inválido."); }
        });

        if (!dev) return;

        // ---------- SOLO DESARROLLO: pasarela y bandeja de correos SIMULADAS ----------
        app.MapGet("/pago-simulado/{id}", (string id) =>
        {
            using var c = Db.Open();
            var p = Db.One(c, "SELECT * FROM payments WHERE id=@p0", id); if (p == null) return Results.NotFound();
            var o = Db.One(c, "SELECT * FROM orders WHERE id=@p0", Db.L(p, "order_id"))!;
            string html = $@"<!doctype html><html lang=""es""><head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width, initial-scale=1""><title>Pago simulado · Flowers</title>
<link rel=""stylesheet"" href=""/css/styles.css""></head><body><div class=""wrap"" style=""max-width:620px;padding-top:24px;padding-bottom:48px"">
<div class=""banner""><b>DEMOSTRACIÓN.</b> Esta pantalla simula una pasarela de pago. No se procesa ninguna tarjeta ni se cobra dinero real.</div>
<h1 style=""font-size:1.8rem;margin:22px 0 8px"">Pago del pedido {H.Esc(Db.S(o, "number"))}</h1>
<p>Total a pagar (simulado): <b>{Notify.Money(Db.L(o, "total_cents"))}</b> · Estado actual: <b>{H.Esc(Db.S(o, "payment_status"))}</b></p>
<p class=""sum-note"">Elige el resultado que quieres simular. El servidor recibirá una notificación firmada, igual que ocurriría con una pasarela real.</p>
<div id=""pay"" data-id=""{H.Esc(id)}"" data-order=""{H.Esc(Db.S(o, "number"))}"" data-token=""{H.Esc(Db.S(o, "access_token"))}"" style=""display:grid;gap:10px;margin-top:16px"">
<button class=""btn btn-primary"" data-r=""approved"">Simular pago APROBADO</button><button class=""btn btn-ghost"" data-r=""pending"">Simular pago PENDIENTE</button>
<button class=""btn btn-ghost"" data-r=""rejected"">Simular pago RECHAZADO</button><button class=""btn btn-ghost"" data-r=""cancelled"">Simular pago CANCELADO</button>
<a class=""link-arrow"" href=""/#/pedido/{H.Esc(Db.S(o, "number"))}?t={H.Esc(Db.S(o, "access_token"))}"">Volver sin pagar</a></div>
<p id=""msg"" class=""form-msg"" role=""status""></p></div><script src=""/dev/pago.js""></script></body></html>";
            return Results.Content(html, "text/html; charset=utf-8");
        });
        app.MapGet("/dev/pago.js", () => Results.Text(@"document.querySelectorAll('[data-r]').forEach(function(b){b.addEventListener('click',async function(){
 var box=document.getElementById('pay'),msg=document.getElementById('msg');box.querySelectorAll('button').forEach(function(x){x.disabled=true});
 var r=await fetch('/api/dev/pay/'+box.dataset.id,{method:'POST',headers:{'Content-Type':'application/json','X-Flowers':'1'},body:JSON.stringify({result:b.dataset.r})});
 var d=await r.json();msg.textContent='Resultado del servidor: '+(d.outcome||d.error);
 setTimeout(function(){location.href='/#/pedido/'+box.dataset.order+'?t='+box.dataset.token},700);});});", "application/javascript; charset=utf-8"));

        app.MapPost("/api/dev/pay/{id}", async (string id, HttpContext ctx) =>
        {
            var b = await H.Body(ctx);
            string type = H.Str(b, "result") switch { "approved" => "payment.approved", "pending" => "payment.pending", "rejected" => "payment.rejected", "cancelled" => "payment.cancelled", "refunded" => "payment.refunded", _ => "" };
            if (type == "") return H.Err(400, "Resultado inválido.");
            string body = JsonSerializer.Serialize(new { eventId = Guid.NewGuid().ToString("N"), paymentId = id, type });
            LastEvent[id] = body;
            return H.Ok(new { ok = true, outcome = Orders.ReceiveWebhook(webhookSecret, Orders.Sign(webhookSecret, body), body) });
        });
        app.MapPost("/api/dev/replay/{id}", (string id) =>
        {   // Reenvía EXACTAMENTE el mismo evento: no debe duplicar pedidos, stock ni correos.
            if (!LastEvent.TryGetValue(id, out var body)) return H.Err(404, "No hay evento previo.");
            return H.Ok(new { ok = true, outcome = Orders.ReceiveWebhook(webhookSecret, Orders.Sign(webhookSecret, body), body) });
        });
        app.MapGet("/api/dev/secret", (HttpContext ctx) => ctx.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip) ? H.Ok(new { webhookSecret }) : H.Err(403, "Solo local."));

        app.MapPost("/api/dev/expire/{number}", (string number) =>
        {   // Fuerza el vencimiento de la reserva de un pedido (solo pruebas).
            using (var c = Db.Open()) Db.Exec(c, "UPDATE stock_reservations SET expires_at='2000-01-01T00:00:00Z' WHERE order_id=(SELECT id FROM orders WHERE number=@p0) AND status='active'", number);
            Orders.ExpireStale(); return H.Ok();
        });
        app.MapGet("/api/dev/inbox", () => { using var c = Db.Open(); return H.Ok(Db.Rows(c, "SELECT * FROM sent_messages ORDER BY id DESC LIMIT 200")); });
        app.MapGet("/dev/bandeja", () =>
        {
            using var c = Db.Open();
            var sb = new StringBuilder("<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Bandeja de pruebas</title><link rel=stylesheet href=/css/styles.css><div class=wrap style='max-width:820px;padding-top:24px;padding-bottom:48px'>");
            sb.Append("<div class=banner><b>BANDEJA DE PRUEBAS (SIMULADA).</b> Aquí aparecen los correos y avisos de WhatsApp que el sistema <b>habría enviado</b>. No sale nada por internet.</div><h1 style='font-size:1.6rem;margin:18px 0'>Mensajes simulados</h1>");
            foreach (var m in Db.Rows(c, "SELECT * FROM sent_messages ORDER BY id DESC LIMIT 100"))
            {
                var body = System.Text.RegularExpressions.Regex.Replace(H.Esc(Db.S(m, "body")), @"(https?://[^\s&]+(?:&amp;[^\s&]+)*)", "<a href=\"$1\">$1</a>");
                sb.Append($"<article style='border:1px solid var(--line);border-radius:6px;padding:14px;margin-bottom:12px'><div><span class=demo-flag>{H.Esc(Db.S(m, "channel"))} · SIMULADO</span> <small>{H.Esc(Db.S(m, "sent_at"))}</small></div><div><b>Para:</b> {H.Esc(Db.S(m, "recipient"))}</div><div><b>Asunto:</b> {H.Esc(Db.S(m, "subject"))}</div><pre style='white-space:pre-wrap;font-family:inherit;margin:8px 0 0'>{body}</pre></article>");
            }
            return Results.Content(sb.Append("</div>").ToString(), "text/html; charset=utf-8");
        });
    }

    static object AddrJson(Row a) => new { id = Db.L(a, "id"), label = Db.S(a, "label"), name = Db.S(a, "name"), phone = Db.S(a, "phone"), line1 = Db.S(a, "line1"), district = Db.S(a, "district"), city = Db.S(a, "city"), reference = Db.S(a, "reference"), isDefault = Db.L(a, "is_default") == 1 };

    static void QueueVerify(Microsoft.Data.Sqlite.SqliteConnection c, long uid, string email, string name, bool resend = false)
    {
        var tok = Sec.NewToken();
        Db.Exec(c, "INSERT INTO tokens(token_hash,user_id,kind,email,expires_at) VALUES(@p0,@p1,'verify',@p2,@p3)", Db.Sha256(tok), uid, email, Db.In(TimeSpan.FromHours(48)));
        Notify.Enqueue(c, "email", "verify_email", email, "Verifica tu correo", $"Hola {name},\n\nConfirma tu correo para activar tu cuenta (vence en 48 horas):\n{Notify.BaseUrl(c)}/#/verificar?token={tok}\n\nFlowers Streetwear", null, null);
    }
}
