using Microsoft.Data.Sqlite;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Flowers;

using Row = Dictionary<string, object?>;

public record CartItem(string Id, string Color, string Size, int Qty, long? ExpectedCents);
public class Line
{
    public string ProductId = "", Name = "", Brands = "", Color = "", Size = "", Image = "";
    public long VariantId, UnitCents; public int Qty, Available; public string? Issue; public bool PriceChanged;
}
public class OrderException(string message, object? payload = null) : Exception(message) { public object? Payload = payload; }

public static class Orders
{
    public static readonly string[] PaymentStates = { "awaiting", "pending", "paid", "rejected", "cancelled", "expired", "refunded" };
    static readonly Dictionary<string, string[]> PayTransitions = new()
    {
        ["awaiting"] = new[] { "pending", "paid", "rejected", "cancelled", "expired" },
        ["pending"] = new[] { "paid", "rejected", "cancelled", "expired" },
        ["expired"] = new[] { "paid" },            // pago que llega tarde: se revisa si aún hay stock
        ["paid"] = new[] { "refunded" },
        ["rejected"] = Array.Empty<string>(), ["cancelled"] = Array.Empty<string>(), ["refunded"] = Array.Empty<string>()
    };
    static readonly Dictionary<string, string[]> FulfillTransitions = new()
    {
        ["new"] = new[] { "preparing", "cancelled" }, ["preparing"] = new[] { "shipped", "cancelled" },
        ["shipped"] = new[] { "delivered" }, ["delivered"] = Array.Empty<string>(), ["cancelled"] = Array.Empty<string>(), ["none"] = new[] { "cancelled" }
    };
    public static string[] NextFulfillment(string from) => FulfillTransitions.TryGetValue(from, out var n) ? n : Array.Empty<string>();

    // ---------- Disponibilidad ----------
    public static long Reserved(SqliteConnection c, long variantId) =>
        Db.Scalar<long>(c, "SELECT COALESCE(SUM(qty),0) FROM stock_reservations WHERE variant_id=@p0 AND status='active' AND expires_at>@p1", variantId, Db.Now());

    /// <summary>Unidades disponibles. null = existencias sin confirmar (no se puede comprar).</summary>
    public static long? Available(SqliteConnection c, long variantId)
    {
        var v = Db.One(c, "SELECT stock_on_hand FROM variants WHERE id=@p0", variantId);
        var oh = v == null ? null : Db.NL(v, "stock_on_hand");
        return oh == null ? null : Math.Max(0, oh.Value - Reserved(c, variantId));
    }

    // ---------- Presupuesto (precios y stock SIEMPRE desde el servidor) ----------
    public static List<Line> Quote(SqliteConnection c, IEnumerable<CartItem> items)
    {
        var merged = new Dictionary<string, CartItem>();
        foreach (var i in items)
        {
            if (i.Qty < 1) continue;
            var k = $"{i.Id}|{i.Color}|{i.Size}";
            merged[k] = merged.TryGetValue(k, out var e) ? e with { Qty = Math.Min(20, e.Qty + i.Qty) } : i with { Qty = Math.Min(20, i.Qty) };
        }
        var lines = new List<Line>();
        foreach (var i in merged.Values)
        {
            var l = new Line { ProductId = i.Id, Color = i.Color ?? "", Size = i.Size ?? "", Qty = i.Qty };
            var p = Db.One(c, "SELECT * FROM products WHERE id=@p0 AND status='published'", i.Id);
            var v = p == null ? null : Db.One(c, "SELECT * FROM variants WHERE product_id=@p0 AND color=@p1 AND size=@p2 AND active=1", i.Id, l.Color, l.Size);
            if (p == null || v == null) { l.Name = i.Id; l.Issue = "Este producto o variante ya no está disponible."; lines.Add(l); continue; }
            l.Name = Db.S(p, "name"); l.VariantId = Db.L(v, "id"); l.UnitCents = Db.L(v, "price_cents");
            l.Brands = string.Join(" x ", Db.Rows(c, "SELECT b.name FROM product_brands pb JOIN brands b ON b.id=pb.brand_id WHERE pb.product_id=@p0 ORDER BY b.name", i.Id).Select(r => Db.S(r, "name")));
            var img = Db.One(c, "SELECT url FROM product_images WHERE product_id=@p0 AND (color=@p1 OR color='') ORDER BY (color=@p1) DESC, is_primary DESC, position LIMIT 1", i.Id, l.Color);
            l.Image = img == null ? "" : Db.S(img, "url");
            var av = Available(c, l.VariantId);
            l.Available = (int)(av ?? 0);
            if (av == null) l.Issue = "Este producto aún no está disponible para la venta.";
            else if (av <= 0) l.Issue = "Sin stock.";
            else if (i.Qty > av) l.Issue = $"Solo quedan {av} unidades.";
            if (i.ExpectedCents != null && i.ExpectedCents != l.UnitCents) { l.PriceChanged = true; }
            lines.Add(l);
        }
        return lines;
    }

    public static (Row method, Row rate)? ShippingRate(SqliteConnection c, long rateId)
    {
        var r = Db.One(c, "SELECT * FROM shipping_rates WHERE id=@p0 AND active=1", rateId);
        if (r == null) return null;
        var m = Db.One(c, "SELECT * FROM shipping_methods WHERE id=@p0 AND active=1", Db.L(r, "method_id"));
        return m == null ? null : (m, r);
    }

    // ---------- Crear pedido + reservar stock + solicitud de pago ----------
    public static (string number, string token, string paymentId) Create(CartItem[] items, long rateId, string name, string email, string phone, JsonElement? address, long? userId)
    {
        if (name.Trim().Length < 2 || name.Length > 100) throw new OrderException("Escribe tu nombre.");
        if (!Sec.ValidEmail(email)) throw new OrderException("Escribe un correo válido.");
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length < 6 || digits.Length > 15) throw new OrderException("Escribe un teléfono válido.");
        if (items.Length == 0 || items.Length > 40) throw new OrderException("Tu carrito está vacío.");

        return Db.Tx(c =>
        {
            ExpireStaleIn(c);
            var lines = Quote(c, items);
            var issues = lines.Where(l => l.Issue != null || l.PriceChanged).ToList();
            if (issues.Count > 0) throw new OrderException("Hay cambios en tu carrito. Revísalos antes de pagar.", new { lines = lines.Select(LineJson).ToList() });

            var sr = ShippingRate(c, rateId) ?? throw new OrderException("Elige una modalidad de entrega válida.");
            bool delivery = Db.S(sr.method, "kind") == "delivery";
            string addrJson = "{}";
            if (delivery)
            {
                if (address == null) throw new OrderException("Escribe la dirección de entrega.");
                string g(string k) => address.Value.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()!.Trim() : "";
                if (g("line1").Length < 4 || g("city").Length < 2) throw new OrderException("Completa la dirección y la ciudad.");
                addrJson = JsonSerializer.Serialize(new { line1 = Cap(g("line1"), 200), district = Cap(g("district"), 100), city = Cap(g("city"), 100), reference = Cap(g("reference"), 200) });
            }
            long subtotal = lines.Sum(l => l.UnitCents * l.Qty), ship = Db.L(sr.rate, "price_cents");
            long seq = long.Parse(Db.Setting(c, "order.seq", "1000")) + 1; Db.SetSetting(c, "order.seq", seq.ToString());
            string number = "FL-" + seq, token = Sec.NewToken();
            int mins = int.Parse(Db.Setting(c, "reserve.minutes", "20"));
            long orderId = Db.Insert(c, @"INSERT INTO orders(number,user_id,access_token,email,customer_name,phone,address_json,shipping_method,shipping_kind,shipping_zone,shipping_cents,subtotal_cents,total_cents,payment_status,fulfillment_status,is_test,created_at)
                VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,'awaiting','none',1,@p13)",
                number, userId, token, email.Trim(), Cap(name.Trim(), 100), Cap(phone.Trim(), 30), addrJson, Db.S(sr.method, "name"), Db.S(sr.method, "kind"), Db.S(sr.rate, "zone"), ship, subtotal, subtotal + ship, Db.Now());
            foreach (var l in lines)
            {
                Db.Exec(c, "INSERT INTO order_items(order_id,product_id,variant_id,product_name,brands,color,size,unit_cents,qty,image_url) VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9)",
                    orderId, l.ProductId, l.VariantId, l.Name, l.Brands, l.Color, l.Size, l.UnitCents, l.Qty, l.Image);
                Db.Exec(c, "INSERT INTO stock_reservations(order_id,variant_id,qty,status,expires_at) VALUES(@p0,@p1,@p2,'active',@p3)", orderId, l.VariantId, l.Qty, Db.In(TimeSpan.FromMinutes(mins)));
            }
            string payId = Guid.NewGuid().ToString("N");
            Db.Exec(c, "INSERT INTO payments(id,order_id,provider,status,amount_cents,created_at) VALUES(@p0,@p1,'simulado','awaiting',@p2,@p3)", payId, orderId, subtotal + ship, Db.Now());
            Event(c, orderId, "pedido", "Pedido creado; stock reservado por " + mins + " min. Pago SIMULADO.", null);
            return (number, token, payId);
        });
    }
    static string Cap(string s, int n) => s.Length > n ? s[..n] : s;
    public static object LineJson(Line l) => new { id = l.ProductId, name = l.Name, brands = l.Brands, color = l.Color, size = l.Size, qty = l.Qty, unitCents = l.UnitCents, image = l.Image, available = l.Available, issue = l.Issue, priceChanged = l.PriceChanged };
    public static void Event(SqliteConnection c, long orderId, string kind, string detail, long? userId) =>
        Db.Exec(c, "INSERT INTO order_events(order_id,kind,detail,user_id,created_at) VALUES(@p0,@p1,@p2,@p3,@p4)", orderId, kind, detail, userId, Db.Now());

    // ---------- Caducidad de reservas ----------
    public static void ExpireStaleIn(SqliteConnection c)
    {
        Db.Exec(c, "UPDATE stock_reservations SET status='expired' WHERE status='active' AND expires_at<=@p0", Db.Now());
        foreach (var o in Db.Rows(c, @"SELECT id FROM orders WHERE payment_status IN ('awaiting','pending') AND NOT EXISTS
                                       (SELECT 1 FROM stock_reservations r WHERE r.order_id=orders.id AND r.status='active')"))
        {
            Db.Exec(c, "UPDATE orders SET payment_status='expired' WHERE id=@p0", Db.L(o, "id"));
            Db.Exec(c, "UPDATE payments SET status='expired' WHERE order_id=@p0 AND status IN ('awaiting','pending')", Db.L(o, "id"));
            Event(c, Db.L(o, "id"), "pago", "La reserva venció sin pago confirmado.", null);
        }
    }
    public static void ExpireStale() => Db.Tx(c => { ExpireStaleIn(c); return 0; });

    // ---------- Notificaciones del proveedor de pago (idempotentes) ----------
    public const string SimProvider = "simulado";
    public static string Sign(string secret, string body) => Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(body))).ToLowerInvariant();

    /// <summary>Verifica la firma y procesa el evento. Repetir el mismo evento no duplica nada.</summary>
    public static string ReceiveWebhook(string secret, string signature, string body)
    {
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(secret, body)), Encoding.ASCII.GetBytes((signature ?? "").ToLowerInvariant().PadRight(64).Substring(0, 64))))
            throw new UnauthorizedAccessException("Firma inválida");
        var d = JsonDocument.Parse(body).RootElement;
        return HandleEvent(SimProvider, d.GetProperty("eventId").GetString()!, d.GetProperty("paymentId").GetString()!, d.GetProperty("type").GetString()!);
    }

    public static string HandleEvent(string provider, string eventId, string paymentId, string type) => Db.Tx(c =>
    {
        ExpireStaleIn(c);
        long added = Db.Exec(c, "INSERT OR IGNORE INTO payment_events(provider,event_id,payment_id,type,received_at) VALUES(@p0,@p1,@p2,@p3,@p4)", provider, eventId, paymentId, type, Db.Now());
        if (added == 0) return "duplicado";
        var pay = Db.One(c, "SELECT * FROM payments WHERE id=@p0", paymentId);
        if (pay == null) { Db.Exec(c, "UPDATE payment_events SET outcome='pago desconocido' WHERE provider=@p0 AND event_id=@p1", provider, eventId); return "desconocido"; }
        long orderId = Db.L(pay, "order_id");
        var order = Db.One(c, "SELECT * FROM orders WHERE id=@p0", orderId)!;
        string cur = Db.S(order, "payment_status");
        string target = type switch { "payment.approved" => "paid", "payment.pending" => "pending", "payment.rejected" => "rejected", "payment.cancelled" => "cancelled", "payment.refunded" => "refunded", _ => "" };
        string outcome;
        if (target == "" ) outcome = "tipo ignorado";
        else if (!PayTransitions[cur].Contains(target)) outcome = $"transición no permitida {cur}→{target}";
        else
        {
            switch (target)
            {
                case "paid": outcome = ConfirmPaid(c, order, cur == "expired"); break;
                case "pending":
                    SetPay(c, order, "pending"); Event(c, orderId, "pago", "Pago pendiente de confirmación (proveedor).", null);
                    Notify.QueuePending(c, Db.One(c, "SELECT * FROM orders WHERE id=@p0", orderId)!); outcome = "pendiente"; break;
                case "refunded": SetPay(c, order, "refunded"); Event(c, orderId, "pago", "Pago reembolsado (proveedor). Revisa si debes reponer stock manualmente.", null); outcome = "reembolsado"; break;
                default:
                    SetPay(c, order, target); Db.Exec(c, "UPDATE stock_reservations SET status='released' WHERE order_id=@p0 AND status='active'", orderId);
                    Event(c, orderId, "pago", $"Pago {target}. Reserva liberada.", null); outcome = target; break;
            }
        }
        Db.Exec(c, "UPDATE payment_events SET outcome=@p2 WHERE provider=@p0 AND event_id=@p1", provider, eventId, outcome);
        return outcome;
    });

    static void SetPay(SqliteConnection c, Row order, string status)
    {
        Db.Exec(c, "UPDATE orders SET payment_status=@p1 WHERE id=@p0", Db.L(order, "id"), status);
        Db.Exec(c, "UPDATE payments SET status=@p1 WHERE order_id=@p0", Db.L(order, "id"), status);
    }

    static string ConfirmPaid(SqliteConnection c, Row order, bool late)
    {
        long id = Db.L(order, "id");
        var items = Db.Rows(c, "SELECT * FROM order_items WHERE order_id=@p0", id);
        bool ok = true; string note = "";
        if (late)
        {   // Reserva vencida: se vuelve a reservar solo si todavía hay stock.
            foreach (var i in items)
            {
                var av = Available(c, Db.L(i, "variant_id"));
                if (av == null || av < Db.L(i, "qty")) { ok = false; note = $"Sin stock suficiente de «{Db.S(i, "product_name")}» al llegar el pago tardío."; break; }
            }
        }
        if (ok)
            foreach (var i in items)
            {
                long vid = Db.L(i, "variant_id"), qty = Db.L(i, "qty");
                long n = Db.Exec(c, "INSERT OR IGNORE INTO stock_movements(variant_id,delta,reason,order_id,note,created_at) VALUES(@p0,@p1,'sale',@p2,'Venta pagada',@p3)", vid, -qty, id, Db.Now());
                if (n == 1) Db.Exec(c, "UPDATE variants SET stock_on_hand = stock_on_hand - @p1 WHERE id=@p0 AND stock_on_hand >= @p1", vid, qty);
            }
        Db.Exec(c, "UPDATE stock_reservations SET status='consumed' WHERE order_id=@p0 AND status='active'", id);
        Db.Exec(c, "UPDATE orders SET payment_status='paid', fulfillment_status='new', needs_review=@p1, review_note=@p2, paid_at=@p3, admin_read=0 WHERE id=@p0", id, ok ? 0 : 1, note, Db.Now());
        Db.Exec(c, "UPDATE payments SET status='paid' WHERE order_id=@p0", id);
        Event(c, id, "pago", ok ? "Pago confirmado por el proveedor; stock descontado." : "Pago confirmado pero REQUIERE REVISIÓN: " + note, null);
        Notify.QueuePaid(c, Db.One(c, "SELECT * FROM orders WHERE id=@p0", id)!);
        return ok ? "pagado" : "pagado-revisar";
    }

    // ---------- Preparación y envío (el administrador no modifica el pago) ----------
    public static void SetFulfillment(long orderId, string to, long adminId, string carrier, string code, string url, string note) => Db.Tx(c =>
    {
        var o = Db.One(c, "SELECT * FROM orders WHERE id=@p0", orderId) ?? throw new OrderException("Pedido no encontrado.");
        string from = Db.S(o, "fulfillment_status"), pay = Db.S(o, "payment_status");
        if (!NextFulfillment(from).Contains(to)) throw new OrderException($"No se puede pasar de «{from}» a «{to}».");
        if (to != "cancelled" && pay != "paid") throw new OrderException("Solo se prepara un pedido con pago confirmado.");
        if (to != "cancelled" && Db.L(o, "needs_review") == 1) throw new OrderException("Resuelve primero la revisión pendiente del pedido.");
        if (to == "shipped" && Db.S(o, "shipping_kind") == "delivery" && carrier.Trim() == "" && code.Trim() == "") throw new OrderException("Indica el transportista o el código de seguimiento.");
        Db.Exec(c, "UPDATE orders SET fulfillment_status=@p1, carrier=CASE WHEN @p2<>'' THEN @p2 ELSE carrier END, tracking_code=CASE WHEN @p3<>'' THEN @p3 ELSE tracking_code END, tracking_url=CASE WHEN @p4<>'' THEN @p4 ELSE tracking_url END WHERE id=@p0",
            orderId, to, carrier.Trim(), code.Trim(), url.Trim());
        if (to == "cancelled")
        {
            Db.Exec(c, "UPDATE stock_reservations SET status='released' WHERE order_id=@p0 AND status='active'", orderId);
            foreach (var m in Db.Rows(c, "SELECT * FROM stock_movements WHERE order_id=@p0 AND reason='sale'", orderId))
                if (Db.Exec(c, "INSERT OR IGNORE INTO stock_movements(variant_id,delta,reason,order_id,user_id,note,created_at) VALUES(@p0,@p1,'cancel_return',@p2,@p3,'Pedido cancelado',@p4)", Db.L(m, "variant_id"), -Db.L(m, "delta"), orderId, adminId, Db.Now()) == 1)
                    Db.Exec(c, "UPDATE variants SET stock_on_hand = stock_on_hand + @p1 WHERE id=@p0", Db.L(m, "variant_id"), -Db.L(m, "delta"));
        }
        Event(c, orderId, "envio", $"Estado: {from} → {to}" + (note.Trim() != "" ? " · " + note.Trim() : "") + (code.Trim() != "" ? $" · seguimiento {carrier} {code}".TrimEnd() : ""), adminId);
        if (to == "shipped")
        {
            var fresh = Db.One(c, "SELECT * FROM orders WHERE id=@p0", orderId)!;
            Notify.Enqueue(c, "email", "order_shipped_customer", Db.S(fresh, "email"), $"Tu pedido {Db.S(fresh, "number")} fue enviado",
                $"Hola {Db.S(fresh, "customer_name")},\n\nTu pedido {Db.S(fresh, "number")} ya fue enviado.\n" + (Db.S(fresh, "carrier") != "" ? $"Transportista: {Db.S(fresh, "carrier")}\n" : "") + (Db.S(fresh, "tracking_code") != "" ? $"Seguimiento: {Db.S(fresh, "tracking_code")} {Db.S(fresh, "tracking_url")}\n" : "") + "\nFlowers Streetwear", orderId, $"shipped:{orderId}");
        }
        return 0;
    });

    public static void ResolveReview(long orderId, long adminId, string note) => Db.Tx(c =>
    {
        Db.Exec(c, "UPDATE orders SET needs_review=0 WHERE id=@p0 AND payment_status='paid'", orderId);
        Event(c, orderId, "revision", "Revisión resuelta por el administrador. " + note, adminId); return 0;
    });
}
