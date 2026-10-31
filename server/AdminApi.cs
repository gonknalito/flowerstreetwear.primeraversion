using Microsoft.Data.Sqlite;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Flowers;

using Row = Dictionary<string, object?>;

/// <summary>Panel privado. Cada ruta exige, en el servidor, sesión de administrador con segundo factor verificado.</summary>
public static class AdminApi
{
    const long MaxImage = 3 * 1024 * 1024;

    static string Slug(string s)
    {
        var n = s.Normalize(NormalizationForm.FormD); var sb = new StringBuilder();
        foreach (var ch in n) if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark) sb.Append(ch);
        return Regex.Replace(sb.ToString().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
    }
    static void Audit(SqliteConnection c, HttpContext ctx, string action, string detail = "") =>
        Db.Exec(c, "INSERT INTO audit_log(user_id,action,detail,created_at) VALUES(@p0,@p1,@p2,@p3)", Sec.Current(ctx)?.Id, action, detail, Db.Now());

    static string? ImageExt(byte[] b)
    {
        if (b.Length > 12 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "jpg";
        if (b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return "png";
        if (b.Length > 12 && Encoding.ASCII.GetString(b, 0, 4) == "RIFF" && Encoding.ASCII.GetString(b, 8, 4) == "WEBP") return "webp";
        if (b.Length > 12 && Encoding.ASCII.GetString(b, 4, 4) == "ftyp" && Encoding.ASCII.GetString(b, 8, 4) is "avif" or "avis") return "avif";
        return null;
    }

    static object ProductDetail(SqliteConnection c, Row p)
    {
        string id = Db.S(p, "id");
        return new
        {
            id, name = Db.S(p, "name"), description = Db.S(p, "description"), sub = Db.S(p, "sub_id"), status = Db.S(p, "status"), isNew = Db.L(p, "is_new") == 1, isSelection = Db.L(p, "is_selection") == 1, imageAlt = Db.S(p, "image_alt"),
            brands = Db.Rows(c, "SELECT b.name FROM product_brands pb JOIN brands b ON b.id=pb.brand_id WHERE pb.product_id=@p0 ORDER BY b.name", id).Select(r => Db.S(r, "name")).ToList(),
            variants = Db.Rows(c, "SELECT * FROM variants WHERE product_id=@p0 ORDER BY color,id", id).Select(v => new
            {
                id = Db.L(v, "id"), color = Db.S(v, "color"), size = Db.S(v, "size"), priceCents = Db.L(v, "price_cents"), stock = Db.NL(v, "stock_on_hand"), reserved = Orders.Reserved(c, Db.L(v, "id")), active = Db.L(v, "active") == 1
            }).ToList(),
            images = Db.Rows(c, "SELECT * FROM product_images WHERE product_id=@p0 ORDER BY is_primary DESC, position, id", id).Select(i => new { id = Db.L(i, "id"), url = Db.S(i, "url"), alt = Db.S(i, "alt"), color = Db.S(i, "color"), position = Db.L(i, "position"), isPrimary = Db.L(i, "is_primary") == 1 }).ToList()
        };
    }

    static List<string> Names(JsonElement b, string k) => b.TryGetProperty(k, out var a) && a.ValueKind == JsonValueKind.Array ? a.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!.Trim()).Where(x => x != "").Distinct(StringComparer.OrdinalIgnoreCase).ToList() : new();

    public static void Map(WebApplication app, string dataDir)
    {
        var g = app.MapGroup("/api/admin");
        g.AddEndpointFilter(async (fc, next) => Sec.Admin(fc.HttpContext) == null ? H.Err(Sec.Current(fc.HttpContext) == null ? 401 : 403, "Acceso restringido a administradores con verificación en dos pasos.") : await next(fc));
        string uploads = Path.Combine(dataDir, "uploads");

        g.MapGet("/summary", () =>
        {
            using var c = Db.Open(); int th = int.Parse(Db.Setting(c, "low_stock.threshold", "3"));
            return H.Ok(new
            {
                unreadOrders = Db.Scalar<long>(c, "SELECT COUNT(*) FROM orders WHERE admin_read=0"), needsReview = Db.Scalar<long>(c, "SELECT COUNT(*) FROM orders WHERE needs_review=1"),
                lowStock = Db.Scalar<long>(c, "SELECT COUNT(*) FROM variants WHERE active=1 AND stock_on_hand IS NOT NULL AND stock_on_hand<=@p0", th),
                failedNotifications = Db.Scalar<long>(c, "SELECT COUNT(*) FROM notification_outbox WHERE status IN ('pending','dead') AND attempts>0"),
                withoutPhotos = Db.Scalar<long>(c, "SELECT COUNT(*) FROM products p WHERE p.status='published' AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=p.id)"),
                unconfirmedStock = Db.Scalar<long>(c, "SELECT COUNT(*) FROM products p WHERE p.status='published' AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.stock_on_hand IS NOT NULL)"),
                products = Db.Scalar<long>(c, "SELECT COUNT(*) FROM products"), threshold = th
            });
        });

        // ---------- Productos ----------
        g.MapGet("/products", (HttpContext ctx) =>
        {
            using var c = Db.Open(); int th = int.Parse(Db.Setting(c, "low_stock.threshold", "3"));
            string q = ctx.Request.Query["q"].ToString().ToLowerInvariant();
            var rows = Db.Rows(c, @"SELECT p.*, (SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) AS photos,
                (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id AND v.active=1) AS nvar,
                (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id AND v.active=1 AND v.stock_on_hand IS NOT NULL) AS nconf,
                (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id AND v.active=1 AND v.stock_on_hand IS NOT NULL AND v.stock_on_hand<=@p0) AS nlow,
                (SELECT COALESCE(SUM(v.stock_on_hand),0) FROM variants v WHERE v.product_id=p.id AND v.active=1) AS units,
                (SELECT MIN(price_cents) FROM variants v WHERE v.product_id=p.id AND v.active=1) AS price FROM products p ORDER BY p.sort, p.name", th);
            return H.Ok(rows.Where(r => q == "" || Db.S(r, "name").ToLowerInvariant().Contains(q) || Db.S(r, "id").Contains(q)).Select(r => new
            {
                id = Db.S(r, "id"), name = Db.S(r, "name"), sub = Db.S(r, "sub_id"), status = Db.S(r, "status"), photos = Db.L(r, "photos"), variants = Db.L(r, "nvar"), confirmed = Db.L(r, "nconf"), low = Db.L(r, "nlow"), units = Db.L(r, "units"), priceCents = Db.NL(r, "price"), isNew = Db.L(r, "is_new") == 1, isSelection = Db.L(r, "is_selection") == 1
            }).ToList());
        });
        g.MapGet("/products/{id}", (string id) => { using var c = Db.Open(); var p = Db.One(c, "SELECT * FROM products WHERE id=@p0", id); return p == null ? H.Err(404, "No existe.") : H.Ok(ProductDetail(c, p)); });

        g.MapPost("/products", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string name = H.Str(b, "name", 160), sub = H.Str(b, "sub");
            if (name.Length < 2) return H.Err(400, "Escribe el nombre.");
            using var c = Db.Open();
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM subcategories WHERE id=@p0", sub) == 0) return H.Err(400, "Elige una subcategoría.");
            string id = Slug(name), baseId = id; for (int i = 2; Db.Scalar<long>(c, "SELECT COUNT(*) FROM products WHERE id=@p0", id) > 0; i++) id = baseId + "-" + i;
            long sort = Db.Scalar<long>(c, "SELECT COALESCE(MAX(sort),0)+1 FROM products");
            Db.Exec(c, "INSERT INTO products(id,name,description,sub_id,status,sort,created_at,updated_at) VALUES(@p0,@p1,'',@p2,'draft',@p3,@p4,@p4)", id, name, sub, sort, Db.Now());
            Audit(c, ctx, "product_create", id); return H.Ok(new { ok = true, id });
        });

        g.MapPut("/products/{id}", async (HttpContext ctx, string id) =>
        {
            var b = await H.Body(ctx); using var c = Db.Open();
            if (Db.One(c, "SELECT 1 FROM products WHERE id=@p0", id) == null) return H.Err(404, "No existe.");
            string name = H.Str(b, "name", 160), sub = H.Str(b, "sub"), status = H.Str(b, "status");
            if (name.Length < 2) return H.Err(400, "Escribe el nombre.");
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM subcategories WHERE id=@p0", sub) == 0) return H.Err(400, "Elige una subcategoría.");
            if (status is not ("draft" or "published")) return H.Err(400, "Estado inválido.");
            // variantes
            var vars = new List<(string color, string size, long price)>();
            if (b.TryGetProperty("variants", out var va) && va.ValueKind == JsonValueKind.Array)
                foreach (var v in va.EnumerateArray()) vars.Add((H.Str(v, "color", 60), H.Str(v, "size", 40), H.Num(v, "priceCents", -1)));
            if (vars.Any(v => v.price < 0 || v.price > 100_000_000)) return H.Err(400, "Revisa los precios de las variantes.");
            if (vars.GroupBy(v => (v.color.ToLowerInvariant(), v.size.ToLowerInvariant())).Any(x => x.Count() > 1)) return H.Err(400, "Hay variantes repetidas (mismo color y talla).");
            if (vars.GroupBy(v => v.color.ToLowerInvariant()).Any(x => x.Select(y => y.price).Distinct().Count() > 1)) return H.Err(400, "Todas las tallas de un mismo color deben tener el mismo precio.");
            if (status == "published" && vars.Count == 0) return H.Err(400, "Para publicar, agrega al menos una variante con precio.");
            Db.Exec(c, "BEGIN IMMEDIATE");
            try
            {
                Db.Exec(c, "UPDATE products SET name=@p1, description=@p2, sub_id=@p3, status=@p4, is_new=@p5, is_selection=@p6, image_alt=@p7, updated_at=@p8 WHERE id=@p0", id, name, H.Str(b, "description", 4000), sub, status,
                    H.Flag(b, "isNew") ? 1 : 0, H.Flag(b, "isSelection") ? 1 : 0, H.Str(b, "imageAlt", 200), Db.Now());
                Db.Exec(c, "DELETE FROM product_brands WHERE product_id=@p0", id);
                foreach (var bn in Names(b, "brands"))
                {
                    Db.Exec(c, "INSERT OR IGNORE INTO brands(name) VALUES(@p0)", bn);
                    Db.Exec(c, "INSERT OR IGNORE INTO product_brands(product_id,brand_id) SELECT @p0,id FROM brands WHERE name=@p1", id, bn);
                }
                var keep = new List<long>();
                foreach (var v in vars)
                {
                    var ex = Db.One(c, "SELECT id FROM variants WHERE product_id=@p0 AND color=@p1 AND size=@p2", id, v.color, v.size);
                    if (ex != null) { Db.Exec(c, "UPDATE variants SET price_cents=@p1, active=1 WHERE id=@p0", Db.L(ex, "id"), v.price); keep.Add(Db.L(ex, "id")); }
                    else keep.Add(Db.Insert(c, "INSERT INTO variants(product_id,color,size,price_cents,stock_on_hand,active) VALUES(@p0,@p1,@p2,@p3,NULL,1)", id, v.color, v.size, v.price));
                }
                // Las variantes retiradas se desactivan (no se borran: los pedidos conservan su historial).
                foreach (var old in Db.Rows(c, "SELECT id FROM variants WHERE product_id=@p0 AND active=1", id)) if (!keep.Contains(Db.L(old, "id"))) Db.Exec(c, "UPDATE variants SET active=0 WHERE id=@p0", Db.L(old, "id"));
                Audit(c, ctx, "product_update", id);
                Db.Exec(c, "COMMIT");
            }
            catch { Db.Exec(c, "ROLLBACK"); throw; }
            return H.Ok(ProductDetail(c, Db.One(c, "SELECT * FROM products WHERE id=@p0", id)!));
        });

        g.MapPost("/stock", async (HttpContext ctx) =>
        {   // Registra existencias CONFIRMADAS con un movimiento en el libro de inventario.
            var b = await H.Body(ctx); long vid = H.Num(b, "variantId"), qty = H.Num(b, "quantity", -1); string note = H.Str(b, "note", 200);
            if (qty < 0 || qty > 100000) return H.Err(400, "Escribe una cantidad válida (0 o más).");
            var u = Sec.Admin(ctx)!;
            return Db.Tx(c =>
            {
                var v = Db.One(c, "SELECT * FROM variants WHERE id=@p0", vid); if (v == null) return H.Err(404, "Variante no encontrada.");
                long? cur = Db.NL(v, "stock_on_hand"); long reserved = Orders.Reserved(c, vid);
                if (qty < reserved) return H.Err(400, $"Hay {reserved} unidades reservadas por compras en curso; la cantidad no puede ser menor.");
                Db.Exec(c, "INSERT INTO stock_movements(variant_id,delta,reason,user_id,note,created_at) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", vid, qty - (cur ?? 0), cur == null ? "initial" : "adjust", u.Id, note, Db.Now());
                Db.Exec(c, "UPDATE variants SET stock_on_hand=@p1 WHERE id=@p0", vid, qty);
                Audit(c, ctx, "stock_set", $"variant {vid}: {cur?.ToString() ?? "sin confirmar"} → {qty}");
                return H.Ok(new { ok = true });
            });
        });

        // ---------- Fotografías ----------
        g.MapPost("/products/{id}/images", async (HttpContext ctx, string id) =>
        {
            using var c = Db.Open(); if (Db.One(c, "SELECT 1 FROM products WHERE id=@p0", id) == null) return H.Err(404, "No existe.");
            var form = await ctx.Request.ReadFormAsync(); var file = form.Files.FirstOrDefault();
            if (file == null) return H.Err(400, "Elige una imagen.");
            if (file.Length > MaxImage) return H.Err(400, "La imagen pesa más de 3 MB. Redúcela antes de subirla.");
            using var ms = new MemoryStream(); await file.CopyToAsync(ms); var bytes = ms.ToArray();
            var ext = ImageExt(bytes); if (ext == null) return H.Err(400, "Formato no permitido. Usa JPG, PNG, WebP o AVIF.");
            string color = form["color"].ToString().Trim(); string alt = form["alt"].ToString().Trim();
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM product_images WHERE product_id=@p0", id) >= 12) return H.Err(400, "Máximo 12 fotos por producto.");
            string url = await Save(uploads, id, bytes, ext);
            var name = Db.S(Db.One(c, "SELECT name FROM products WHERE id=@p0", id)!, "name");
            long pos = Db.Scalar<long>(c, "SELECT COALESCE(MAX(position),-1)+1 FROM product_images WHERE product_id=@p0", id);
            bool first = Db.Scalar<long>(c, "SELECT COUNT(*) FROM product_images WHERE product_id=@p0 AND color=@p1", id, color) == 0 && color == "";
            long iid = Db.Insert(c, "INSERT INTO product_images(product_id,color,url,alt,position,is_primary) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", id, color, url, alt != "" ? alt : name, pos, first ? 1 : 0);
            Audit(c, ctx, "image_add", $"{id} #{iid}"); return H.Ok(new { ok = true, id = iid, url });
        });
        g.MapPut("/products/{id}/images", async (HttpContext ctx, string id) =>
        {   // orden, imagen principal, texto alternativo y color
            var b = await H.Body(ctx); using var c = Db.Open();
            if (b.TryGetProperty("images", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                int pos = 0; bool primarySet = false;
                foreach (var i in arr.EnumerateArray())
                {
                    long iid = H.Num(i, "id"); bool prim = H.Flag(i, "isPrimary") && !primarySet && H.Str(i, "color", 60) == "";
                    if (prim) primarySet = true;
                    Db.Exec(c, "UPDATE product_images SET position=@p1, is_primary=@p2, alt=@p3, color=@p4 WHERE id=@p0 AND product_id=@p5", iid, pos++, prim ? 1 : 0, H.Str(i, "alt", 200), H.Str(i, "color", 60), id);
                }
            }
            Audit(c, ctx, "image_update", id); return H.Ok(ProductDetail(c, Db.One(c, "SELECT * FROM products WHERE id=@p0", id)!));
        });
        g.MapDelete("/images/{iid:long}", (HttpContext ctx, long iid) =>
        {
            using var c = Db.Open(); var i = Db.One(c, "SELECT * FROM product_images WHERE id=@p0", iid); if (i == null) return H.Err(404, "No existe.");
            Db.Exec(c, "DELETE FROM product_images WHERE id=@p0", iid); TryDelete(uploads, Db.S(i, "url"));
            if (Db.L(i, "is_primary") == 1) Db.Exec(c, "UPDATE product_images SET is_primary=1 WHERE id=(SELECT id FROM product_images WHERE product_id=@p0 AND color='' ORDER BY position LIMIT 1)", Db.S(i, "product_id"));
            Audit(c, ctx, "image_delete", $"#{iid}"); return H.Ok();
        });
        g.MapPost("/images/{iid:long}/replace", async (HttpContext ctx, long iid) =>
        {
            using var c = Db.Open(); var i = Db.One(c, "SELECT * FROM product_images WHERE id=@p0", iid); if (i == null) return H.Err(404, "No existe.");
            var form = await ctx.Request.ReadFormAsync(); var file = form.Files.FirstOrDefault(); if (file == null) return H.Err(400, "Elige una imagen.");
            if (file.Length > MaxImage) return H.Err(400, "La imagen pesa más de 3 MB.");
            using var ms = new MemoryStream(); await file.CopyToAsync(ms); var bytes = ms.ToArray(); var ext = ImageExt(bytes); if (ext == null) return H.Err(400, "Formato no permitido. Usa JPG, PNG, WebP o AVIF.");
            string url = await Save(uploads, Db.S(i, "product_id"), bytes, ext);
            Db.Exec(c, "UPDATE product_images SET url=@p1 WHERE id=@p0", iid, url); TryDelete(uploads, Db.S(i, "url")); Audit(c, ctx, "image_replace", $"#{iid}"); return H.Ok(new { ok = true, url });
        });

        // ---------- Marcas, categorías, colores ----------
        g.MapGet("/taxonomy", () =>
        {
            using var c = Db.Open();
            return H.Ok(new
            {
                categories = Db.Rows(c, "SELECT * FROM categories ORDER BY sort").Select(ct => new { id = Db.S(ct, "id"), name = Db.S(ct, "name"), tagline = Db.S(ct, "tagline"),
                    subs = Db.Rows(c, "SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.sub_id=s.id AND p.status='published') AS pub FROM subcategories s WHERE category_id=@p0 ORDER BY sort,name", Db.S(ct, "id")).Select(s => new { id = Db.S(s, "id"), name = Db.S(s, "name"), published = Db.L(s, "pub") }).ToList() }).ToList(),
                brands = Db.Rows(c, "SELECT b.*, (SELECT COUNT(*) FROM product_brands pb WHERE pb.brand_id=b.id) AS n FROM brands b ORDER BY b.name").Select(r => new { id = Db.L(r, "id"), name = Db.S(r, "name"), products = Db.L(r, "n") }).ToList(),
                colors = Db.Rows(c, "SELECT * FROM colors ORDER BY name").Select(r => new { name = Db.S(r, "name"), hex = Db.S(r, "hex") }).ToList()
            });
        });
        g.MapPost("/brands", async (HttpContext ctx) => { var b = await H.Body(ctx); var n = H.Str(b, "name", 80); if (n.Length < 1) return H.Err(400, "Escribe la marca."); using var c = Db.Open(); Db.Exec(c, "INSERT OR IGNORE INTO brands(name) VALUES(@p0)", n); Audit(c, ctx, "brand_add", n); return H.Ok(); });
        g.MapPut("/brands/{id:long}", async (HttpContext ctx, long id) =>
        {
            var b = await H.Body(ctx); var n = H.Str(b, "name", 80); if (n.Length < 1) return H.Err(400, "Escribe la marca."); using var c = Db.Open();
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM brands WHERE name=@p0 AND id<>@p1", n, id) > 0) return H.Err(409, "Ya existe una marca con ese nombre."); Db.Exec(c, "UPDATE brands SET name=@p1 WHERE id=@p0", id, n); Audit(c, ctx, "brand_rename", n); return H.Ok();
        });
        g.MapDelete("/brands/{id:long}", (HttpContext ctx, long id) =>
        {
            using var c = Db.Open(); if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM product_brands WHERE brand_id=@p0", id) > 0) return H.Err(409, "La marca tiene productos. Quítala de ellos primero."); Db.Exec(c, "DELETE FROM brands WHERE id=@p0", id); return H.Ok();
        });
        g.MapPut("/categories/{id}", async (HttpContext ctx, string id) => { var b = await H.Body(ctx); using var c = Db.Open(); if (H.Str(b, "name").Length < 2) return H.Err(400, "Escribe el nombre."); Db.Exec(c, "UPDATE categories SET name=@p1, tagline=@p2 WHERE id=@p0", id, H.Str(b, "name", 80), H.Str(b, "tagline", 200)); Audit(c, ctx, "category_update", id); return H.Ok(); });
        g.MapPost("/subcategories", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string name = H.Str(b, "name", 80), cat = H.Str(b, "categoryId"); if (name.Length < 2) return H.Err(400, "Escribe el nombre."); using var c = Db.Open();
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM categories WHERE id=@p0", cat) == 0) return H.Err(400, "Categoría inválida.");
            string id = Slug(name); if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM subcategories WHERE id=@p0", id) > 0) return H.Err(409, "Ya existe esa subcategoría.");
            Db.Exec(c, "INSERT INTO subcategories(id,category_id,name,sort) VALUES(@p0,@p1,@p2,99)", id, cat, name); Audit(c, ctx, "subcategory_add", id); return H.Ok(new { ok = true, id });
        });
        g.MapPut("/subcategories/{id}", async (HttpContext ctx, string id) => { var b = await H.Body(ctx); using var c = Db.Open(); if (H.Str(b, "name").Length < 2) return H.Err(400, "Escribe el nombre."); Db.Exec(c, "UPDATE subcategories SET name=@p1 WHERE id=@p0", id, H.Str(b, "name", 80)); return H.Ok(); });
        g.MapPost("/colors", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string n = H.Str(b, "name", 40), hex = H.Str(b, "hex", 7);
            if (n.Length < 2 || !Regex.IsMatch(hex, "^#[0-9a-fA-F]{6}$")) return H.Err(400, "Escribe el nombre y un color válido (#RRGGBB).");
            using var c = Db.Open(); Db.Exec(c, "INSERT INTO colors(name,hex) VALUES(@p0,@p1) ON CONFLICT(name) DO UPDATE SET hex=excluded.hex", n, hex); return H.Ok();
        });

        // ---------- Pedidos ----------
        g.MapGet("/orders", (HttpContext ctx) =>
        {
            using var c = Db.Open(); string pay = ctx.Request.Query["pay"].ToString(), ful = ctx.Request.Query["ful"].ToString(), q = ctx.Request.Query["q"].ToString().Trim();
            var rows = Db.Rows(c, "SELECT * FROM orders ORDER BY id DESC LIMIT 300")
                .Where(o => (pay == "" || Db.S(o, "payment_status") == pay) && (ful == "" || Db.S(o, "fulfillment_status") == ful) && (ctx.Request.Query["unread"].ToString() != "1" || Db.L(o, "admin_read") == 0)
                    && (q == "" || Db.S(o, "number").Contains(q, StringComparison.OrdinalIgnoreCase) || Db.S(o, "email").Contains(q, StringComparison.OrdinalIgnoreCase) || Db.S(o, "customer_name").Contains(q, StringComparison.OrdinalIgnoreCase)));
            return H.Ok(rows.Select(o => PublicApi.OrderJson(c, o, true)).ToList());
        });
        g.MapGet("/orders/{number}", (string number) =>
        {
            using var c = Db.Open(); var o = Db.One(c, "SELECT * FROM orders WHERE number=@p0", number); if (o == null) return H.Err(404, "Pedido no encontrado.");
            long id = Db.L(o, "id");
            return H.Ok(new
            {
                order = PublicApi.OrderJson(c, o, true),
                events = Db.Rows(c, "SELECT * FROM order_events WHERE order_id=@p0 ORDER BY id DESC", id).Select(e => new { kind = Db.S(e, "kind"), detail = Db.S(e, "detail"), at = Db.S(e, "created_at") }).ToList(),
                payments = Db.Rows(c, "SELECT * FROM payments WHERE order_id=@p0", id).Select(p => new { id = Db.S(p, "id"), provider = Db.S(p, "provider"), status = Db.S(p, "status"), amountCents = Db.L(p, "amount_cents") }).ToList(),
                paymentEvents = Db.Rows(c, "SELECT e.* FROM payment_events e JOIN payments p ON p.id=e.payment_id WHERE p.order_id=@p0 ORDER BY e.id DESC", id).Select(e => new { eventId = Db.S(e, "event_id"), type = Db.S(e, "type"), outcome = Db.S(e, "outcome"), at = Db.S(e, "received_at") }).ToList(),
                notifications = Db.Rows(c, "SELECT * FROM notification_outbox WHERE order_id=@p0 ORDER BY id DESC", id).Select(NotifJson).ToList(),
                next = Orders.NextFulfillment(Db.S(o, "fulfillment_status"))
            });
        });
        g.MapPost("/orders/{number}/read", (string number) => { using var c = Db.Open(); Db.Exec(c, "UPDATE orders SET admin_read=1 WHERE number=@p0", number); return H.Ok(); });
        g.MapPost("/orders/{number}/fulfillment", async (HttpContext ctx, string number) =>
        {
            var b = await H.Body(ctx); long oid; using (var c = Db.Open()) { var o = Db.One(c, "SELECT id FROM orders WHERE number=@p0", number); if (o == null) return H.Err(404, "Pedido no encontrado."); oid = Db.L(o, "id"); }
            try { Orders.SetFulfillment(oid, H.Str(b, "to", 20), Sec.Admin(ctx)!.Id, H.Str(b, "carrier", 80), H.Str(b, "code", 80), H.Str(b, "url", 300), H.Str(b, "note", 300)); return H.Ok(); }
            catch (OrderException ex) { return H.Err(400, ex.Message); }
        });
        g.MapPost("/orders/{number}/resolve-review", async (HttpContext ctx, string number) =>
        {
            var b = await H.Body(ctx); using var c = Db.Open(); var o = Db.One(c, "SELECT id FROM orders WHERE number=@p0", number); if (o == null) return H.Err(404, "Pedido no encontrado.");
            Orders.ResolveReview(Db.L(o, "id"), Sec.Admin(ctx)!.Id, H.Str(b, "note", 300)); return H.Ok();
        });

        // ---------- Ajustes ----------
        string[] keys = { "contact.email", "contact.phone", "contact.address", "contact.hours", "whatsapp.number", "notify.admin_emails", "notify.admin_whatsapp", "notify.email.enabled", "notify.whatsapp.enabled", "low_stock.threshold", "reserve.minutes", "site.base_url", "sim.email_fail", "sim.whatsapp_fail" };
        g.MapGet("/settings", () => { using var c = Db.Open(); return H.Ok(keys.ToDictionary(k => k, k => Db.Setting(c, k))); });
        g.MapPut("/settings", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); using var c = Db.Open();
            foreach (var k in keys) if (b.TryGetProperty(k, out var v) && v.ValueKind is JsonValueKind.String)
            {
                var val = v.GetString()!.Trim(); if (val.Length > 500) return H.Err(400, "Valor demasiado largo.");
                if (k is "low_stock.threshold" && (!int.TryParse(val, out var t) || t < 0 || t > 1000)) return H.Err(400, "Umbral inválido.");
                if (k is "reserve.minutes" && (!int.TryParse(val, out var m) || m < 5 || m > 180)) return H.Err(400, "La reserva debe estar entre 5 y 180 minutos.");
                if (k is "notify.admin_emails" && val != "" && !val.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries).All(Sec.ValidEmail)) return H.Err(400, "Revisa los correos de los destinatarios.");
                if (k is "whatsapp.number" or "notify.admin_whatsapp") val = new string(val.Where(char.IsDigit).ToArray());
                Db.SetSetting(c, k, val);
            }
            Audit(c, ctx, "settings_update"); return H.Ok();
        });

        // ---------- Envíos ----------
        g.MapGet("/shipping", () =>
        {
            using var c = Db.Open();
            return H.Ok(Db.Rows(c, "SELECT * FROM shipping_methods ORDER BY sort,id").Select(m => new
            {
                id = Db.L(m, "id"), name = Db.S(m, "name"), kind = Db.S(m, "kind"), active = Db.L(m, "active") == 1, isTest = Db.L(m, "is_test") == 1,
                rates = Db.Rows(c, "SELECT * FROM shipping_rates WHERE method_id=@p0 ORDER BY id", Db.L(m, "id")).Select(r => new { id = Db.L(r, "id"), zone = Db.S(r, "zone"), priceCents = Db.L(r, "price_cents"), note = Db.S(r, "note"), active = Db.L(r, "active") == 1 }).ToList()
            }).ToList());
        });
        g.MapPut("/shipping", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); using var c = Db.Open();
            if (b.ValueKind != JsonValueKind.Object || !b.TryGetProperty("methods", out var ms)) return H.Err(400, "Datos inválidos.");
            Db.Exec(c, "BEGIN IMMEDIATE");
            try
            {
                Db.Exec(c, "UPDATE shipping_methods SET active=0"); Db.Exec(c, "UPDATE shipping_rates SET active=0");
                int s = 0;
                foreach (var m in ms.EnumerateArray())
                {
                    string kind = H.Str(m, "kind") == "pickup" ? "pickup" : "delivery"; long mid = H.Num(m, "id");
                    if (H.Str(m, "name").Length < 2) throw new OrderException("Cada modalidad necesita un nombre.");
                    bool keep = (!m.TryGetProperty("active", out var ma) || H.Flag(m, "active")); bool isTest = H.Str(m, "name").Contains("PRUEBA");
                    if (mid > 0 && Db.One(c, "SELECT 1 FROM shipping_methods WHERE id=@p0", mid) != null) Db.Exec(c, "UPDATE shipping_methods SET name=@p1, kind=@p2, active=@p3, sort=@p4, is_test=@p5 WHERE id=@p0", mid, H.Str(m, "name", 80), kind, keep ? 1 : 0, s++, isTest ? 1 : 0);
                    else mid = Db.Insert(c, "INSERT INTO shipping_methods(name,kind,active,sort,is_test) VALUES(@p0,@p1,@p2,@p3,@p4)", H.Str(m, "name", 80), kind, keep ? 1 : 0, s++, isTest ? 1 : 0);
                    if (m.TryGetProperty("rates", out var rs))
                        foreach (var r in rs.EnumerateArray())
                        {
                            long rid = H.Num(r, "id"), price = H.Num(r, "priceCents", -1); if (price < 0 || price > 10_000_000 || H.Str(r, "zone").Length < 1) throw new OrderException("Revisa zona y tarifa de envío.");
                            bool ra = (!r.TryGetProperty("active", out var rv) || H.Flag(r, "active"));
                            if (rid > 0 && Db.One(c, "SELECT 1 FROM shipping_rates WHERE id=@p0 AND method_id=@p1", rid, mid) != null) Db.Exec(c, "UPDATE shipping_rates SET zone=@p1, price_cents=@p2, note=@p3, active=@p4 WHERE id=@p0", rid, H.Str(r, "zone", 80), price, H.Str(r, "note", 200), ra ? 1 : 0);
                            else Db.Exec(c, "INSERT INTO shipping_rates(method_id,zone,price_cents,note,active) VALUES(@p0,@p1,@p2,@p3,@p4)", mid, H.Str(r, "zone", 80), price, H.Str(r, "note", 200), ra ? 1 : 0);
                        }
                }
                Audit(c, ctx, "shipping_update"); Db.Exec(c, "COMMIT");
            }
            catch (OrderException ex) { Db.Exec(c, "ROLLBACK"); return H.Err(400, ex.Message); }
            catch { Db.Exec(c, "ROLLBACK"); throw; }
            return H.Ok();
        });

        // ---------- Notificaciones ----------
        g.MapGet("/notifications", (HttpContext ctx) =>
        {
            using var c = Db.Open(); string st = ctx.Request.Query["status"].ToString();
            return H.Ok(Db.Rows(c, "SELECT * FROM notification_outbox WHERE (@p0='' OR status=@p0) ORDER BY id DESC LIMIT 200", st).Select(NotifJson).ToList());
        });
        g.MapPost("/notifications/{id:long}/retry", (long id) => { using var c = Db.Open(); Db.Exec(c, "UPDATE notification_outbox SET status='pending', attempts=0, next_attempt_at=@p1, last_error='' WHERE id=@p0 AND status IN ('dead','skipped','pending')", id, Db.Now()); return H.Ok(); });
        g.MapPost("/notifications/test", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string ch = H.Str(b, "channel") == "whatsapp" ? "whatsapp" : "email"; string to = H.Str(b, "recipient", 160);
            if (ch == "email" && !Sec.ValidEmail(to)) return H.Err(400, "Escribe un correo de prueba válido.");
            if (ch == "whatsapp" && to.Count(char.IsDigit) < 8) return H.Err(400, "Escribe un número con código de país.");
            using var c = Db.Open(); Notify.Enqueue(c, ch, "test", to, "Mensaje de prueba", "Este es un mensaje de PRUEBA del panel de Flowers. En desarrollo se guarda en la bandeja simulada.", null, "test:" + Guid.NewGuid().ToString("N")); return H.Ok();
        });

        // ---------- Administradores ----------
        g.MapPost("/invite", async (HttpContext ctx) =>
        {
            var b = await H.Body(ctx); string email = H.Str(b, "email", 160).ToLowerInvariant(); if (!Sec.ValidEmail(email)) return H.Err(400, "Escribe un correo válido.");
            using var c = Db.Open(); if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM users WHERE email=@p0", email) > 0) return H.Err(409, "Ese correo ya tiene una cuenta.");
            var tok = Sec.NewToken();
            Db.Exec(c, "INSERT INTO tokens(token_hash,user_id,kind,email,expires_at) VALUES(@p0,NULL,'invite',@p1,@p2)", Db.Sha256(tok), email, Db.In(TimeSpan.FromDays(3)));
            Notify.Enqueue(c, "email", "invite_admin", email, "Invitación al panel de Flowers", $"Te invitaron a administrar la tienda Flowers.\nCrea tu contraseña aquí (vence en 3 días):\n{Notify.BaseUrl(c)}/admin.html#/invitacion?token={tok}\n\nSe exigirá verificación en dos pasos.", null, null);
            Audit(c, ctx, "admin_invite", email); return H.Ok();
        });
        g.MapGet("/admins", () => { using var c = Db.Open(); return H.Ok(Db.Rows(c, "SELECT email,name,totp_enabled,created_at FROM users WHERE role='admin' ORDER BY id").Select(u => new { email = Db.S(u, "email"), name = Db.S(u, "name"), mfa = Db.L(u, "totp_enabled") == 1, createdAt = Db.S(u, "created_at") }).ToList()); });
        g.MapGet("/low-stock", () =>
        {
            using var c = Db.Open(); int th = int.Parse(Db.Setting(c, "low_stock.threshold", "3"));
            return H.Ok(Db.Rows(c, "SELECT v.*, p.name FROM variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND v.stock_on_hand IS NOT NULL AND v.stock_on_hand<=@p0 ORDER BY v.stock_on_hand, p.name", th)
                .Select(v => new { productId = Db.S(v, "product_id"), name = Db.S(v, "name"), color = Db.S(v, "color"), size = Db.S(v, "size"), stock = Db.L(v, "stock_on_hand") }).ToList());
        });
    }

    static object NotifJson(Row n) => new { id = Db.L(n, "id"), channel = Db.S(n, "channel"), kind = Db.S(n, "kind"), recipient = Db.S(n, "recipient"), subject = Db.S(n, "subject"), status = Db.S(n, "status"), attempts = Db.L(n, "attempts"), error = Db.S(n, "last_error"), at = Db.S(n, "created_at"), sentAt = Db.S(n, "sent_at"), nextAttempt = Db.S(n, "next_attempt_at") };

    static async Task<string> Save(string uploads, string productId, byte[] bytes, string ext)
    {
        string dir = Path.Combine(uploads, Slug(productId)); Directory.CreateDirectory(dir);
        string fn = Guid.NewGuid().ToString("N") + "." + ext;
        await File.WriteAllBytesAsync(Path.Combine(dir, fn), bytes);
        return $"/uploads/{Slug(productId)}/{fn}";
    }
    static void TryDelete(string uploads, string url)
    {
        if (!url.StartsWith("/uploads/")) return;
        try { var full = Path.GetFullPath(Path.Combine(uploads, url["/uploads/".Length..])); if (full.StartsWith(Path.GetFullPath(uploads)) && File.Exists(full)) File.Delete(full); } catch { }
    }
}
