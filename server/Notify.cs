using Microsoft.Data.Sqlite;
using System.Globalization;
using System.Text;

namespace Flowers;

using Row = Dictionary<string, object?>;

/// <summary>
/// Cola de notificaciones con reintentos. En desarrollo TODOS los envíos son SIMULADOS:
/// se guardan en la «bandeja de pruebas» (sent_messages) y no salen por ningún servicio externo.
/// </summary>
public static class Notify
{
    public const int MaxAttempts = 5;

    public static string Money(long cents) => "S/ " + (cents / 100m).ToString("0.00", CultureInfo.InvariantCulture);

    public static void Enqueue(SqliteConnection c, string channel, string kind, string recipient, string subject, string body, long? orderId, string? dedupe)
    {
        if (string.IsNullOrWhiteSpace(recipient)) return;
        Db.Exec(c, @"INSERT OR IGNORE INTO notification_outbox(channel,kind,recipient,subject,body,order_id,dedupe_key,status,attempts,next_attempt_at,created_at)
                     VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,'pending',0,@p7,@p7)", channel, kind, recipient.Trim(), subject, body, orderId, dedupe, Db.Now());
    }

    public static string BaseUrl(SqliteConnection c) => Db.Setting(c, "site.base_url", "http://localhost:5080").TrimEnd('/');

    public static string OrderLines(SqliteConnection c, long orderId)
    {
        var sb = new StringBuilder();
        foreach (var i in Db.Rows(c, "SELECT * FROM order_items WHERE order_id=@p0 ORDER BY id", orderId))
        {
            var variant = string.Join(" · ", new[] { Db.S(i, "color"), Db.S(i, "size") != "" ? "Talla " + Db.S(i, "size") : "" }.Where(x => x != ""));
            sb.AppendLine($"- {Db.L(i, "qty")} x {Db.S(i, "product_name")}{(variant != "" ? " (" + variant + ")" : "")} · {Money(Db.L(i, "unit_cents"))} c/u");
        }
        return sb.ToString();
    }

    /// <summary>Encola los avisos de un pedido cuyo pago fue CONFIRMADO por el proveedor.</summary>
    public static void QueuePaid(SqliteConnection c, Row order)
    {
        long id = Db.L(order, "id"); string num = Db.S(order, "number"); string b = BaseUrl(c);
        bool review = Db.L(order, "needs_review") == 1;
        string lines = OrderLines(c, id);
        string ship = $"{Db.S(order, "shipping_method")} ({Db.S(order, "shipping_zone")}) · {Money(Db.L(order, "shipping_cents"))}";
        string addr = Db.S(order, "shipping_kind") == "delivery" ? "\nDirección: " + AddressText(Db.S(order, "address_json")) : "";
        string date = Db.S(order, "created_at");
        string custLink = $"{b}/#/pedido/{num}?t={Db.S(order, "access_token")}";

        Enqueue(c, "email", "order_paid_customer", Db.S(order, "email"), $"Recibimos tu pedido {num}",
            $"Hola {Db.S(order, "customer_name")},\n\n" + (review
                ? "Recibimos tu pago. Estamos verificando la disponibilidad de algunos productos y te escribiremos pronto.\n\n"
                : "Tu pago fue confirmado. ¡Gracias por tu compra!\n\n") +
            $"Pedido: {num}\nFecha: {date}\n\n{lines}\nSubtotal: {Money(Db.L(order, "subtotal_cents"))}\nEnvío: {ship}\nTotal pagado: {Money(Db.L(order, "total_cents"))}{addr}\n\nSigue tu pedido: {custLink}\n\nFlowers Streetwear",
            id, $"paid:{id}:customer");

        string subject = review ? $"[PAGADO – REQUIERE REVISIÓN] Pedido {num} · {Money(Db.L(order, "total_cents"))}" : $"[VENTA PAGADA] Pedido {num} · {Money(Db.L(order, "total_cents"))}";
        string adminBody = (review ? $"ATENCIÓN: el pago llegó pero no había stock suficiente. {Db.S(order, "review_note")}\n\n" : "") +
            $"Pedido: {num}\nFecha: {date}\nCliente: {Db.S(order, "customer_name")} · {Db.S(order, "email")} · {Db.S(order, "phone")}\n\n{lines}\nTotal pagado: {Money(Db.L(order, "total_cents"))}\nEntrega: {ship}{addr}\n\nAbrir en el panel (requiere iniciar sesión y verificación en dos pasos): {b}/admin.html#/pedido/{num}";
        foreach (var to in Db.Setting(c, "notify.admin_emails").Split(new[] { ',', ';', ' ', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            Enqueue(c, "email", review ? "order_review_admin" : "order_paid_admin", to, subject, adminBody, id, $"paid:{id}:admin:{to.ToLowerInvariant()}");

        var wa = Db.Setting(c, "notify.admin_whatsapp");
        if (Db.Setting(c, "notify.whatsapp.enabled", "0") == "1" && wa != "")
            Enqueue(c, "whatsapp", "order_paid_whatsapp", wa, "Pedido pagado", $"Pedido {num} pagado ({Money(Db.L(order, "total_cents"))}). Revisa: {b}/admin.html#/pedido/{num}", id, $"paid:{id}:wa");
        Db.Exec(c, "INSERT INTO order_events(order_id,kind,detail,created_at) VALUES(@p0,'notificaciones',@p1,@p2)", id, "Avisos encolados (cliente y administrador).", Db.Now());
    }

    /// <summary>Aviso DISTINTO para pagos pendientes: no es una venta confirmada.</summary>
    public static void QueuePending(SqliteConnection c, Row order)
    {
        long id = Db.L(order, "id"); string num = Db.S(order, "number");
        foreach (var to in Db.Setting(c, "notify.admin_emails").Split(new[] { ',', ';', ' ', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            Enqueue(c, "email", "order_pending_admin", to, $"[PAGO PENDIENTE – no es una venta confirmada] Pedido {num}",
                $"El pedido {num} tiene el pago pendiente. NO prepares el pedido hasta recibir la confirmación de pago.\n\n{OrderLines(c, id)}\nTotal: {Money(Db.L(order, "total_cents"))}\n{BaseUrl(c)}/admin.html#/pedido/{num}", id, $"pending:{id}:{to.ToLowerInvariant()}");
    }

    public static string AddressText(string json)
    {
        try
        {
            var d = System.Text.Json.JsonDocument.Parse(json).RootElement; string g(string k) => d.TryGetProperty(k, out var v) ? v.GetString() ?? "" : "";
            return string.Join(", ", new[] { g("line1"), g("district"), g("city"), g("reference") }.Where(x => x != ""));
        }
        catch { return ""; }
    }

    // ---------- Envío (simulado) con reintentos ----------
    public static int Dispatch()
    {
        using var c = Db.Open();
        var due = Db.Rows(c, "SELECT * FROM notification_outbox WHERE status='pending' AND next_attempt_at<=@p0 ORDER BY id LIMIT 25", Db.Now());
        foreach (var m in due)
        {
            long id = Db.L(m, "id"); string ch = Db.S(m, "channel"); int attempts = (int)Db.L(m, "attempts");
            if (Db.Setting(c, $"notify.{ch}.enabled", ch == "email" ? "1" : "0") != "1")
            { Db.Exec(c, "UPDATE notification_outbox SET status='skipped', last_error='Canal desactivado en el panel' WHERE id=@p0", id); continue; }
            try
            {
                if (Db.Setting(c, $"sim.{ch}_fail", "0") == "1") throw new InvalidOperationException("Fallo SIMULADO del servicio de envío (prueba).");
                Db.Exec(c, "INSERT INTO sent_messages(outbox_id,channel,recipient,subject,body,sent_at) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", id, ch, Db.S(m, "recipient"), Db.S(m, "subject"), Db.S(m, "body"), Db.Now());
                Db.Exec(c, "UPDATE notification_outbox SET status='sent', attempts=@p1, sent_at=@p2, last_error='' WHERE id=@p0", id, attempts + 1, Db.Now());
            }
            catch (Exception ex)
            {
                attempts++;
                bool dead = attempts >= MaxAttempts;
                Db.Exec(c, "UPDATE notification_outbox SET attempts=@p1, status=@p2, last_error=@p3, next_attempt_at=@p4 WHERE id=@p0",
                    id, attempts, dead ? "dead" : "pending", ex.Message, Db.In(TimeSpan.FromSeconds(Math.Min(900, 15 * Math.Pow(2, attempts)))));
                Console.Error.WriteLine($"[notif] fallo #{id} (intento {attempts}): {ex.Message}");
            }
        }
        return due.Count;
    }

    public static async Task Loop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { Dispatch(); Orders.ExpireStale(); }
            catch (Exception e) { Console.Error.WriteLine("[tareas] " + e.Message); }
            try { await Task.Delay(3000, ct); } catch (TaskCanceledException) { }
        }
    }
}
