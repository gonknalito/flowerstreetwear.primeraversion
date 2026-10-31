using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace Flowers;

public record CurUser(long Id, string Email, string Role, string Name, string Phone, bool EmailVerified, bool MfaOk, bool TotpEnabled)
{
    public bool IsAdmin => Role == "admin";
}

public static class Sec
{
    // ---- Contraseñas: PBKDF2-SHA256 con sal aleatoria (nunca texto plano) ----
    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 210_000, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2$210000${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }
    public static bool VerifyPassword(string password, string stored)
    {
        var p = stored.Split('$');
        if (p.Length != 4 || p[0] != "pbkdf2") return false;
        var salt = Convert.FromBase64String(p[2]);
        var expected = Convert.FromBase64String(p[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, int.Parse(p[1]), HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
    public static string PasswordProblem(string pw) =>
        pw.Length < 10 ? "La contraseña debe tener al menos 10 caracteres." :
        pw.Length > 100 ? "La contraseña es demasiado larga." :
        !pw.Any(char.IsLetter) || !pw.Any(char.IsDigit) ? "Usa letras y números en la contraseña." : "";

    public static string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    public static bool ValidEmail(string e) => e.Length is > 5 and < 160 && System.Text.RegularExpressions.Regex.IsMatch(e, @"^[^\s@]+@[^\s@]+\.[^\s@]+$");

    // ---- TOTP (RFC 6238) para el doble factor del administrador ----
    const string B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    public static string NewTotpSecret()
    {
        var b = RandomNumberGenerator.GetBytes(20);
        var sb = new StringBuilder(); int buffer = 0, bits = 0;
        foreach (var x in b) { buffer = (buffer << 8) | x; bits += 8; while (bits >= 5) { sb.Append(B32[(buffer >> (bits - 5)) & 31]); bits -= 5; } }
        if (bits > 0) sb.Append(B32[(buffer << (5 - bits)) & 31]);
        return sb.ToString();
    }
    static byte[] FromB32(string s)
    {
        var o = new List<byte>(); int buffer = 0, bits = 0;
        foreach (var ch in s.ToUpperInvariant().Where(c => B32.Contains(c)))
        { buffer = (buffer << 5) | B32.IndexOf(ch); bits += 5; if (bits >= 8) { o.Add((byte)((buffer >> (bits - 8)) & 255)); bits -= 8; } }
        return o.ToArray();
    }
    public static string TotpCode(string secret, long step)
    {
        var key = FromB32(secret); var msg = BitConverter.GetBytes(step); if (BitConverter.IsLittleEndian) Array.Reverse(msg);
        var h = HMACSHA1.HashData(key, msg); int off = h[^1] & 0xf;
        int bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
        return (bin % 1_000_000).ToString("D6");
    }
    public static bool TotpVerify(string secret, string code)
    {
        code = (code ?? "").Replace(" ", "");
        long step = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30;
        for (long d = -1; d <= 1; d++) if (CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(TotpCode(secret, step + d)), Encoding.ASCII.GetBytes(code.PadRight(6)))) return true;
        return false;
    }

    // ---- Límite de intentos (en memoria; protege login, registro y formularios) ----
    static readonly ConcurrentDictionary<string, List<DateTime>> Hits = new();
    public static bool RateLimited(string key, int max, TimeSpan window)
    {
        var now = DateTime.UtcNow;
        var list = Hits.GetOrAdd(key, _ => new List<DateTime>());
        lock (list) { list.RemoveAll(t => now - t > window); if (list.Count >= max) return true; list.Add(now); return false; }
    }

    // ---- Sesiones ----
    public const string Cookie = "fl_session";
    public static string CreateSession(Microsoft.Data.Sqlite.SqliteConnection c, long userId, bool mfaOk, bool admin)
    {
        var token = NewToken();
        Db.Exec(c, "INSERT INTO sessions(token_hash,user_id,mfa_ok,created_at,expires_at) VALUES(@p0,@p1,@p2,@p3,@p4)",
            Db.Sha256(token), userId, mfaOk ? 1 : 0, Db.Now(), Db.In(admin ? TimeSpan.FromHours(8) : TimeSpan.FromDays(14)));
        return token;
    }
    public static void SetCookie(HttpContext ctx, string token, bool admin) =>
        ctx.Response.Cookies.Append(Cookie, token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax, Secure = ctx.Request.IsHttps, Path = "/", MaxAge = admin ? TimeSpan.FromHours(8) : TimeSpan.FromDays(14) });

    public static CurUser? Current(HttpContext ctx)
    {
        if (ctx.Items.TryGetValue("user", out var cached)) return cached as CurUser;
        CurUser? u = null;
        if (ctx.Request.Cookies.TryGetValue(Cookie, out var tok) && !string.IsNullOrEmpty(tok))
        {
            using var c = Db.Open();
            var r = Db.One(c, "SELECT u.*, s.mfa_ok FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=@p0 AND s.expires_at>@p1", Db.Sha256(tok), Db.Now());
            if (r != null) u = new CurUser(Db.L(r, "id"), Db.S(r, "email"), Db.S(r, "role"), Db.S(r, "name"), Db.S(r, "phone"), Db.L(r, "email_verified") == 1, Db.L(r, "mfa_ok") == 1, Db.L(r, "totp_enabled") == 1);
        }
        ctx.Items["user"] = u;
        return u;
    }
    /// <summary>Administrador con sesión completa (contraseña + segundo factor). Se verifica en el servidor en cada llamada.</summary>
    public static CurUser? Admin(HttpContext ctx) { var u = Current(ctx); return u is { IsAdmin: true, MfaOk: true } ? u : null; }
    public static string Ip(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "?";
}
