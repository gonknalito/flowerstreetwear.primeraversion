using Microsoft.Data.Sqlite;
using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Flowers;

using Row = Dictionary<string, object?>;

public static class Catalog
{
    static readonly JsonSerializerOptions Js = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ---------- Arranque: tablas, categorías, ajustes iniciales ----------
    public static void Init(bool dev)
    {
        using var c = Db.Open();
        Db.Exec(c, Db.Schema);
        void Def(string k, string v) => Db.Exec(c, "INSERT OR IGNORE INTO settings(key,value) VALUES(@p0,@p1)", k, v);
        Def("reserve.minutes", "20"); Def("order.seq", "1000"); Def("low_stock.threshold", "3"); Def("site.base_url", "http://localhost:5080");
        Def("notify.email.enabled", "1"); Def("notify.whatsapp.enabled", "0"); Def("notify.admin_emails", ""); Def("notify.admin_whatsapp", "");
        Def("sim.email_fail", "0"); Def("sim.whatsapp_fail", "0");
        foreach (var k in new[] { "contact.email", "contact.phone", "contact.address", "contact.hours", "whatsapp.number" }) Def(k, "");

        if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM categories") == 0)
        {
            void Cat(string id, string name, string tag, string filters, string? st, int sort, params (string id, string name)[] subs)
            {
                Db.Exec(c, "INSERT INTO categories(id,name,tagline,filters,size_type,sort) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", id, name, tag, filters, st, sort);
                int i = 0; foreach (var s in subs) Db.Exec(c, "INSERT INTO subcategories(id,category_id,name,sort) VALUES(@p0,@p1,@p2,@p3)", s.id, id, s.name, i++);
            }
            Cat("ropa", "Ropa", "Prendas con actitud para el día a día.", "brand,size,color,price,availability", "ropa", 0, ("polos", "Polos"), ("poleras", "Poleras"), ("casacas", "Casacas"), ("pantalones", "Pantalones"), ("shorts", "Shorts"));
            Cat("calzado", "Calzado", "Pisa fuerte, a tu ritmo.", "brand,size,color,price,availability", "calzado", 1, ("zapatillas", "Zapatillas"), ("crocs", "Crocs"));
            Cat("accesorios", "Accesorios", "Los detalles que completan el outfit.", "type,brand,color,price,availability,size", "otro", 2, ("gorros", "Gorros"), ("medias", "Medias"), ("bolsos", "Bolsos"), ("llaveros", "Llaveros de Ted x Supreme"));
            Cat("tecnologia", "Tecnología", "Energía para seguir en la calle.", "capacity,price,availability", null, 3, ("baterias", "Baterías portátiles"));
            foreach (var (n, h) in new[] { ("Negro", "#1d1d22"), ("Blanco", "#f4f4f6"), ("Morado", "#5C509C"), ("Celeste", "#68ACDC"), ("Fucsia", "#E50373"), ("Gris", "#8b8d94"), ("Crema", "#e9e2d0"), ("Verde oliva", "#6b7050"),
                ("Azul marino", "#26335c"), ("Azul", "#2f5fa8"), ("Marrón", "#6b4a32"), ("White", "#f4f4f6"), ("Black", "#1d1d22"), ("Triple Black", "#1d1d22"), ("Red", "#c8202f"), ("Royal Blue", "#2b4fb8") })
                Db.Exec(c, "INSERT OR IGNORE INTO colors(name,hex) VALUES(@p0,@p1)", n, h);
        }
        if (dev && Db.Scalar<long>(c, "SELECT COUNT(*) FROM shipping_methods") == 0)
        {   // Datos de PRUEBA: reemplazar por las condiciones reales de Flowers desde el panel.
            long m1 = Db.Insert(c, "INSERT INTO shipping_methods(name,kind,active,sort,is_test) VALUES('Retiro en tienda (PRUEBA)','pickup',1,0,1)");
            Db.Exec(c, "INSERT INTO shipping_rates(method_id,zone,price_cents,note) VALUES(@p0,'Tienda',0,'Dato de prueba')", m1);
            long m2 = Db.Insert(c, "INSERT INTO shipping_methods(name,kind,active,sort,is_test) VALUES('Envío a domicilio (PRUEBA)','delivery',1,1,1)");
            Db.Exec(c, "INSERT INTO shipping_rates(method_id,zone,price_cents,note) VALUES(@p0,'Lima (PRUEBA)',1000,'Tarifa de prueba, no real')", m2);
        }
        var seed = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "seed", "catalog.seed.json");
        seed = File.Exists(seed) ? seed : Path.Combine(Directory.GetCurrentDirectory(), "seed", "catalog.seed.json");
        if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM products") == 0 && File.Exists(seed))
            Console.WriteLine($"[catálogo] migrados {Import(c, JsonDocument.Parse(File.ReadAllText(seed)).RootElement)} productos desde seed/catalog.seed.json");
    }

    // ---------- Migración desde js/catalogo.js (mismo formato) ----------
    public static int Import(SqliteConnection c, JsonElement arr)
    {
        int n = 0, sort = 0; var now = Db.Now();
        foreach (var p in arr.EnumerateArray())
        {
            string id = p.GetProperty("id").GetString()!;
            string sub = p.GetProperty("sub").GetString()!;
            if (Db.Scalar<long>(c, "SELECT COUNT(*) FROM subcategories WHERE id=@p0", sub) == 0) continue;
            long added = Db.Exec(c, @"INSERT OR IGNORE INTO products(id,name,description,sub_id,status,is_new,is_selection,sort,image_alt,created_at,updated_at)
                VALUES(@p0,@p1,'',@p2,'published',@p3,@p4,@p5,@p6,@p7,@p7)", id, p.GetProperty("name").GetString(), sub,
                p.TryGetProperty("isNew", out var nw) && nw.ValueKind == JsonValueKind.True ? 1 : 0, p.TryGetProperty("selection", out var se) && se.ValueKind == JsonValueKind.True ? 1 : 0,
                sort++, p.TryGetProperty("imageAlt", out var ia) ? ia.GetString() : "", now);
            if (added == 0) continue;
            n++;
            if (p.TryGetProperty("brands", out var bs))
                foreach (var b in bs.EnumerateArray())
                {
                    var name = b.GetString()!.Trim();
                    Db.Exec(c, "INSERT OR IGNORE INTO brands(name) VALUES(@p0)", name);
                    Db.Exec(c, "INSERT OR IGNORE INTO product_brands(product_id,brand_id) SELECT @p0, id FROM brands WHERE name=@p1", id, name);
                }
            long basePrice = (long)Math.Round(p.GetProperty("price").GetDecimal() * 100);
            long? stock = p.TryGetProperty("stock", out var st) && st.ValueKind == JsonValueKind.Number ? st.GetInt64() : null;   // solo cantidades EXPLÍCITAS
            var variants = p.TryGetProperty("variants", out var vs) ? vs.EnumerateArray().ToList() : new List<JsonElement>();
            if (variants.Count == 0)
            {
                var sizes = p.TryGetProperty("sizes", out var sz) ? sz.EnumerateArray().Select(x => x.GetString()!).ToList() : new List<string>();
                if (sizes.Count == 0) sizes.Add("");
                foreach (var s in sizes) Db.Exec(c, "INSERT OR IGNORE INTO variants(product_id,color,size,price_cents,stock_on_hand) VALUES(@p0,'',@p1,@p2,@p3)", id, s, basePrice, stock);
            }
            else foreach (var v in variants)
            {
                string color = v.TryGetProperty("color", out var cl) ? cl.GetString() ?? "" : "";
                long price = v.TryGetProperty("price", out var pr) && pr.ValueKind == JsonValueKind.Number ? (long)Math.Round(pr.GetDecimal() * 100) : basePrice;
                var sizes = v.TryGetProperty("sizes", out var sz) ? sz.EnumerateArray().Select(x => x.GetString()!).ToList() : new List<string>();
                if (sizes.Count == 0) sizes.Add("");
                foreach (var s in sizes) Db.Exec(c, "INSERT OR IGNORE INTO variants(product_id,color,size,price_cents,stock_on_hand) VALUES(@p0,@p1,@p2,@p3,@p4)", id, color, s, price, stock);
            }
            if (stock != null)
                foreach (var v in Db.Rows(c, "SELECT id FROM variants WHERE product_id=@p0", id))
                    Db.Exec(c, "INSERT INTO stock_movements(variant_id,delta,reason,note,created_at) VALUES(@p0,@p1,'initial','Cantidad explícita del inventario original',@p2)", Db.L(v, "id"), stock, now);
            if (p.TryGetProperty("images", out var im))
            {
                int pos = 0; string alt = p.TryGetProperty("imageAlt", out var a2) ? a2.GetString() ?? "" : p.GetProperty("name").GetString()!;
                foreach (var u in im.EnumerateArray())
                    Db.Exec(c, "INSERT INTO product_images(product_id,color,url,alt,position,is_primary) VALUES(@p0,'',@p1,@p2,@p3,@p4)", id, u.GetString(), alt, pos, pos++ == 0 ? 1 : 0);
            }
        }
        return n;
    }

    // ---------- Catálogo público: mismo formato que usaba js/catalogo.js ----------
    static decimal Soles(long cents) => cents / 100m;

    public static string BuildCatalogJs()
    {
        using var c = Db.Open();
        var now = Db.Now();
        var cats = Db.Rows(c, "SELECT * FROM categories ORDER BY sort,name");
        var subs = Db.Rows(c, "SELECT * FROM subcategories ORDER BY sort,name");
        var categories = cats.Select(ct => new
        {
            id = Db.S(ct, "id"), name = Db.S(ct, "name"), tagline = Db.S(ct, "tagline"),
            filters = Db.S(ct, "filters").Split(',', StringSplitOptions.RemoveEmptyEntries), sizeType = Db.S(ct, "size_type") == "" ? null : Db.S(ct, "size_type"),
            subs = subs.Where(s => Db.S(s, "category_id") == Db.S(ct, "id")).Select(s => new { id = Db.S(s, "id"), name = Db.S(s, "name") }).ToList()
        }).ToList();

        var vars = Db.Rows(c, @"SELECT v.*, v.stock_on_hand - COALESCE((SELECT SUM(r.qty) FROM stock_reservations r WHERE r.variant_id=v.id AND r.status='active' AND r.expires_at>@p0),0) AS avail
                                FROM variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND p.status='published' ORDER BY v.id", now).GroupBy(r => Db.S(r, "product_id")).ToDictionary(g => g.Key, g => g.ToList());
        var brands = Db.Rows(c, "SELECT pb.product_id, b.name FROM product_brands pb JOIN brands b ON b.id=pb.brand_id ORDER BY b.name").GroupBy(r => Db.S(r, "product_id")).ToDictionary(g => g.Key, g => g.Select(r => Db.S(r, "name")).ToList());
        var images = Db.Rows(c, "SELECT * FROM product_images ORDER BY is_primary DESC, position, id").GroupBy(r => Db.S(r, "product_id")).ToDictionary(g => g.Key, g => g.ToList());

        var products = new List<object>();
        foreach (var p in Db.Rows(c, "SELECT * FROM products WHERE status='published' ORDER BY sort, name"))
        {
            string id = Db.S(p, "id");
            var vlist = vars.TryGetValue(id, out var vv) ? vv : new List<Row>();
            if (vlist.Count == 0) continue;
            var imgs = images.TryGetValue(id, out var ii) ? ii : new List<Row>();
            bool buyable(Row r) => Db.NL(r, "stock_on_hand") != null && Db.L(r, "avail") > 0;
            var groups = vlist.GroupBy(r => Db.S(r, "color")).Select(g => new
            {
                color = g.Key,
                sizes = g.Select(r => Db.S(r, "size")).Where(s => s != "").ToList(),
                soldOut = g.Where(r => Db.S(r, "size") != "" && !buyable(r)).Select(r => Db.S(r, "size")).ToList(),
                @out = g.All(r => !buyable(r)),
                price = Soles(g.Min(r => Db.L(r, "price_cents"))),
                images = g.Key == "" ? new List<string>() : imgs.Where(r => Db.S(r, "color") == g.Key).Select(r => Db.S(r, "url")).ToList()
            }).ToList();
            bool anyBuy = vlist.Any(buyable), anyConfirmed = vlist.Any(r => Db.NL(r, "stock_on_hand") != null);
            long? lowStock = vlist.Count == 1 && anyConfirmed && Db.L(vlist[0], "avail") <= 5 ? Math.Max(0, Db.L(vlist[0], "avail")) : null;
            products.Add(new
            {
                id, name = Db.S(p, "name"), sub = Db.S(p, "sub_id"), brands = brands.TryGetValue(id, out var bl) ? bl : new List<string>(),
                description = Db.S(p, "description"), price = Soles(vlist.Min(r => Db.L(r, "price_cents"))),
                isNew = Db.L(p, "is_new") == 1 ? true : (bool?)null, selection = Db.L(p, "is_selection") == 1 ? true : (bool?)null,
                images = imgs.Where(r => Db.S(r, "color") == "").Select(r => Db.S(r, "url")).ToList(), imageAlt = Db.S(p, "image_alt") != "" ? Db.S(p, "image_alt") : (imgs.FirstOrDefault()?.GetValueOrDefault("alt") as string ?? ""),
                available = anyBuy, unconfirmed = !anyConfirmed, stock = lowStock,
                variants = groups
            });
        }
        var colors = Db.Rows(c, "SELECT name,hex FROM colors").ToDictionary(r => Db.S(r, "name"), r => Db.S(r, "hex"));
        return "/* Generado por el servidor desde la base de datos. No editar. */\n" +
            "window.FLOWERS_CATEGORIES = " + JsonSerializer.Serialize(categories, Js) + ";\n" +
            "window.FLOWERS_COLORS = Object.assign(window.FLOWERS_COLORS || {}, " + JsonSerializer.Serialize(colors, Js) + ");\n" +
            "window.FLOWERS_PRODUCTS = " + JsonSerializer.Serialize(products, Js) + ";\n";
    }

    // ---------- Configuración pública (sin datos internos) ----------
    public static object PublicConfig(bool dev)
    {
        using var c = Db.Open();
        var methods = Db.Rows(c, "SELECT * FROM shipping_methods WHERE active=1 ORDER BY sort,id").Select(m => new
        {
            id = Db.L(m, "id"), name = Db.S(m, "name"), kind = Db.S(m, "kind"), isTest = Db.L(m, "is_test") == 1,
            rates = Db.Rows(c, "SELECT * FROM shipping_rates WHERE method_id=@p0 AND active=1 ORDER BY id", Db.L(m, "id")).Select(r => new { id = Db.L(r, "id"), zone = Db.S(r, "zone"), priceCents = Db.L(r, "price_cents"), note = Db.S(r, "note") }).ToList()
        }).Where(m => m.rates.Count > 0).ToList();
        return new
        {
            contact = new { email = Db.Setting(c, "contact.email"), phone = Db.Setting(c, "contact.phone"), address = Db.Setting(c, "contact.address"), hours = Db.Setting(c, "contact.hours") },
            whatsapp = new string(Db.Setting(c, "whatsapp.number").Where(char.IsDigit).ToArray()),
            payments = new { mode = "simulated", simulated = true },
            reserveMinutes = int.Parse(Db.Setting(c, "reserve.minutes", "20")),
            shipping = methods, dev
        };
    }
}
