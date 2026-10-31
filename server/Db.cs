using Microsoft.Data.Sqlite;
using System.Security.Cryptography;
using System.Text;

namespace Flowers;

using Row = Dictionary<string, object?>;

/// <summary>Acceso a SQLite (archivo local). Todo el SQL usa parámetros @p0, @p1…</summary>
public static class Db
{
    public static string DataDir = "";
    public static string DbPath = "";

    public static SqliteConnection Open()
    {
        var c = new SqliteConnection($"Data Source={DbPath};Foreign Keys=True;Pooling=True");
        c.Open();
        Exec(c, "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; PRAGMA synchronous=NORMAL;");
        return c;
    }

    static SqliteCommand Cmd(SqliteConnection c, string sql, object?[] args)
    {
        var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        for (int i = 0; i < args.Length; i++) cmd.Parameters.AddWithValue("@p" + i, args[i] ?? DBNull.Value);
        return cmd;
    }

    public static int Exec(SqliteConnection c, string sql, params object?[] args)
    {
        using var cmd = Cmd(c, sql, args);
        return cmd.ExecuteNonQuery();
    }

    public static long Insert(SqliteConnection c, string sql, params object?[] args)
    {
        Exec(c, sql, args);
        return Scalar<long>(c, "SELECT last_insert_rowid()");
    }

    public static List<Row> Rows(SqliteConnection c, string sql, params object?[] args)
    {
        using var cmd = Cmd(c, sql, args);
        using var r = cmd.ExecuteReader();
        var list = new List<Row>();
        while (r.Read())
        {
            var row = new Row();
            for (int i = 0; i < r.FieldCount; i++) row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
            list.Add(row);
        }
        return list;
    }

    public static Row? One(SqliteConnection c, string sql, params object?[] args) => Rows(c, sql, args).FirstOrDefault();

    public static T Scalar<T>(SqliteConnection c, string sql, params object?[] args)
    {
        using var cmd = Cmd(c, sql, args);
        var v = cmd.ExecuteScalar();
        if (v == null || v is DBNull) return default!;
        return (T)Convert.ChangeType(v, Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T));
    }

    /// <summary>Transacción con bloqueo de escritura inmediato (evita que dos compradores reserven la misma unidad).</summary>
    public static T Tx<T>(Func<SqliteConnection, T> work)
    {
        using var c = Open();
        Exec(c, "BEGIN IMMEDIATE");
        try { var res = work(c); Exec(c, "COMMIT"); return res; }
        catch { try { Exec(c, "ROLLBACK"); } catch { } throw; }
    }

    public static string S(Row r, string k) => r.TryGetValue(k, out var v) && v != null ? Convert.ToString(v) ?? "" : "";
    public static long L(Row r, string k) => r.TryGetValue(k, out var v) && v != null ? Convert.ToInt64(v) : 0;
    public static long? NL(Row r, string k) => r.TryGetValue(k, out var v) && v != null ? Convert.ToInt64(v) : null;
    public static string Now() => DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");
    public static string In(TimeSpan t) => DateTime.UtcNow.Add(t).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");

    public static string Setting(SqliteConnection c, string key, string def = "")
    {
        var v = One(c, "SELECT value FROM settings WHERE key=@p0", key);
        return v == null ? def : S(v, "value");
    }
    public static void SetSetting(SqliteConnection c, string key, string value) =>
        Exec(c, "INSERT INTO settings(key,value) VALUES(@p0,@p1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);

    public static string Sha256(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

    public const string Schema = @"
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', filters TEXT NOT NULL DEFAULT '', size_type TEXT, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS subcategories(id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS brands(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS colors(name TEXT PRIMARY KEY COLLATE NOCASE, hex TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sub_id TEXT NOT NULL REFERENCES subcategories(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')), is_new INTEGER NOT NULL DEFAULT 0, is_selection INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0, image_alt TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_brands(product_id TEXT NOT NULL REFERENCES products(id), brand_id INTEGER NOT NULL REFERENCES brands(id), PRIMARY KEY(product_id, brand_id));
CREATE TABLE IF NOT EXISTS variants(
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES products(id), color TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0), stock_on_hand INTEGER CHECK(stock_on_hand IS NULL OR stock_on_hand >= 0), active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(product_id, color, size));
CREATE TABLE IF NOT EXISTS product_images(
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES products(id), color TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0, is_primary INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')), name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mfa_ok INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens(token_hash TEXT PRIMARY KEY, user_id INTEGER, kind TEXT NOT NULL, email TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS addresses(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  line1 TEXT NOT NULL, district TEXT NOT NULL DEFAULT '', city TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', is_default INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shipping_methods(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('delivery','pickup')), active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, is_test INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shipping_rates(id INTEGER PRIMARY KEY AUTOINCREMENT, method_id INTEGER NOT NULL REFERENCES shipping_methods(id), zone TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents >= 0), note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT NOT NULL UNIQUE, user_id INTEGER REFERENCES users(id), access_token TEXT NOT NULL,
  email TEXT NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, address_json TEXT NOT NULL DEFAULT '{}',
  shipping_method TEXT NOT NULL, shipping_kind TEXT NOT NULL, shipping_zone TEXT NOT NULL, shipping_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'awaiting', fulfillment_status TEXT NOT NULL DEFAULT 'none', needs_review INTEGER NOT NULL DEFAULT 0, review_note TEXT NOT NULL DEFAULT '',
  carrier TEXT NOT NULL DEFAULT '', tracking_code TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '',
  admin_read INTEGER NOT NULL DEFAULT 1, is_test INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, paid_at TEXT);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL, variant_id INTEGER NOT NULL,
  product_name TEXT NOT NULL, brands TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '', unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL CHECK(qty > 0), image_url TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), provider TEXT NOT NULL, status TEXT NOT NULL, amount_cents INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_events(id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, event_id TEXT NOT NULL, payment_id TEXT, type TEXT NOT NULL, received_at TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT '', UNIQUE(provider, event_id));
CREATE TABLE IF NOT EXISTS stock_reservations(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), variant_id INTEGER NOT NULL REFERENCES variants(id), qty INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_res_active ON stock_reservations(variant_id, status);
CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY AUTOINCREMENT, variant_id INTEGER NOT NULL REFERENCES variants(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, order_id INTEGER, user_id INTEGER, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mov_order ON stock_movements(order_id, variant_id, reason) WHERE order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', user_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notification_outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, kind TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, order_id INTEGER,
  dedupe_key TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, sent_at TEXT);
CREATE TABLE IF NOT EXISTS sent_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, outbox_id INTEGER, channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, sent_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
";
}
