/* ==========================================================================
   FLOWERS · PANEL PRIVADO
   Toda la seguridad se verifica en el servidor; este archivo solo muestra pantallas.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (c) => "S/ " + (c / 100).toFixed(2);
  const fdate = (s) => { try { return new Date(s).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return s || ""; } };
  const app = $("#app");
  const PAY = { awaiting: "Por pagar", pending: "Pago pendiente", paid: "Pagado", rejected: "Rechazado", cancelled: "Cancelado", expired: "Vencido", refunded: "Reembolsado" };
  const FUL = { none: "—", new: "Nuevo", preparing: "En preparación", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado" };
  const NOTIF = { pending: "Pendiente / reintentando", sent: "Enviado (simulado)", dead: "Falló", skipped: "Canal desactivado" };
  let ME = null, TAX = null, SUM = null, toastT;

  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200); }
  async function api(path, opts = {}) {
    const o = { method: opts.method || "GET", credentials: "same-origin", headers: { "X-Flowers": "1" } };
    if (opts.form) o.body = opts.form;
    else if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers["Content-Type"] = "application/json"; }
    try { const r = await fetch(path, o); let d = null; try { d = await r.json(); } catch (e) { /* vacío */ } return { ok: r.ok, status: r.status, data: d }; }
    catch (e) { return { ok: false, status: 0, data: { error: "Sin conexión con el servidor." } }; }
  }
  const err = (r, def) => (r.data && r.data.error) || def || "Ocurrió un error.";
  const fd = (f) => Object.fromEntries(new FormData(f).entries());
  const hashParts = () => { const raw = location.hash.replace(/^#\/?/, ""); const [p, qs] = raw.split("?"); const q = {}; new URLSearchParams(qs || "").forEach((v, k) => (q[k] = v)); return { parts: p.split("/").filter(Boolean).map(decodeURIComponent), q }; };
  const subName = (id) => { for (const c of TAX.categories) for (const s of c.subs) if (s.id === id) return `${c.name} · ${s.name}`; return id; };

  /* ---------- Acceso: contraseña → segundo factor ---------- */
  function shellLogin(inner) { app.innerHTML = `<div class="login-box"><img src="assets/logo.png" alt="Flowers Streetwear"><div class="ad-card">${inner}</div><p class="sum-note" style="text-align:center">Acceso privado para administradores</p></div>`; }
  function loginView(msg) {
    shellLogin(`<h1 style="font-size:1.5rem;margin-bottom:12px">Panel de Flowers</h1>
      <form id="lg" class="checkout-form" novalidate><div class="field"><label for="e">Correo</label><input id="e" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="p">Contraseña</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
      <div class="err-box" id="m" role="alert">${esc(msg || "")}</div><button class="btn btn-primary" type="submit">Entrar</button></form>`);
    $("#lg").addEventListener("submit", async (e) => {
      e.preventDefault(); const r = await api("/api/auth/login", { method: "POST", body: fd(e.target) });
      if (!r.ok) { $("#m").textContent = err(r, "No se pudo iniciar sesión."); return; }
      if (r.data.role !== "admin") { await api("/api/auth/logout", { method: "POST" }); $("#m").textContent = "Esta cuenta no tiene acceso al panel."; return; }
      mfaView(r.data.mfa);
    });
  }
  function mfaView(mfa) {
    shellLogin(`<h1 style="font-size:1.4rem;margin-bottom:8px">Verificación en dos pasos</h1>
      ${mfa.setup ? `<p>Es tu primer ingreso. Agrega esta clave en una app autenticadora (Google Authenticator, Microsoft Authenticator, Authy…) como cuenta «Flowers» (tipo: basada en tiempo):</p><code class="mono">${esc(mfa.secret)}</code><p class="sum-note">Guárdala en un lugar seguro. Luego escribe el código de 6 dígitos que muestra la app.</p>` : `<p>Escribe el código de 6 dígitos de tu app autenticadora.</p>`}
      <form id="mf" class="checkout-form" novalidate><div class="field"><label for="c">Código</label><input id="c" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></div>
      <div class="err-box" id="m" role="alert"></div><button class="btn btn-primary" type="submit">Verificar</button></form>`);
    $("#c").focus();
    $("#mf").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/auth/mfa", { method: "POST", body: fd(e.target) }); if (r.ok) start(); else $("#m").textContent = err(r, "Código incorrecto."); });
  }
  function inviteView(token) {
    shellLogin(`<h1 style="font-size:1.4rem;margin-bottom:8px">Aceptar invitación</h1><p>Crea tu contraseña de administrador. Después deberás activar la verificación en dos pasos.</p>
      <form id="iv" class="checkout-form" novalidate><div class="field"><label for="n">Nombre</label><input id="n" name="name" required></div><div class="field"><label for="pw">Contraseña</label><input id="pw" name="password" type="password" autocomplete="new-password" required><small class="sum-note">Mínimo 10 caracteres, con letras y números.</small></div>
      <div class="err-box" id="m" role="alert"></div><button class="btn btn-primary" type="submit">Crear cuenta</button></form>`);
    $("#iv").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/auth/accept-invite", { method: "POST", body: { ...fd(e.target), token } }); if (r.ok) { location.hash = ""; loginView("Cuenta creada. Inicia sesión."); } else $("#m").textContent = err(r); });
  }

  /* ---------- Estructura ---------- */
  const NAV = [["", "Resumen"], ["productos", "Productos"], ["pedidos", "Pedidos"], ["stock", "Stock bajo"], ["marcas", "Marcas y categorías"], ["envios", "Envíos"], ["notificaciones", "Notificaciones"], ["ajustes", "Ajustes"], ["admins", "Administradores"]];
  async function refreshSummary() { const r = await api("/api/admin/summary"); if (r.ok) SUM = r.data; }
  function shell(active, title, html) {
    const badge = (k) => (SUM ? ({ pedidos: SUM.unreadOrders, stock: SUM.lowStock, notificaciones: SUM.failedNotifications }[k] || 0) : 0);
    app.innerHTML = `<header class="ad-top"><button class="ad-menu-btn" id="menuBtn" aria-expanded="false" aria-controls="nav">Menú</button><img src="assets/logo.png" alt="Flowers"><span style="font-weight:700">Panel</span><span class="sp"></span><span class="who">${esc(ME.email)}</span><a class="btn btn-outline-light sm" href="/" target="_blank" rel="noopener">Ver tienda</a><button class="btn btn-outline-light sm" id="outBtn" type="button">Salir</button></header>
      <div class="ad-shell"><nav class="ad-nav" id="nav" aria-label="Panel">${NAV.map(([k, n]) => `<a href="#/${k}" class="${k === active ? "on" : ""}">${n}${badge(k) ? `<span class="ad-badge">${badge(k)}</span>` : ""}</a>`).join("")}</nav>
      <main class="ad-main" id="main" tabindex="-1"><h1>${esc(title)}</h1>${html}</main></div>`;
    $("#menuBtn").addEventListener("click", () => { const n = $("#nav"); const o = n.classList.toggle("open"); $("#menuBtn").setAttribute("aria-expanded", String(o)); });
    $("#outBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); ME = null; loginView(); });
  }

  async function route() {
    if (!ME) return;
    const { parts, q } = hashParts(); const [a, b] = parts;
    await refreshSummary();
    if (!a) return viewHome();
    if (a === "productos") return b ? viewProduct(b) : viewProducts(q);
    if (a === "pedidos") return viewOrders(q);
    if (a === "pedido" && b) return viewOrder(b);
    if (a === "stock") return viewLowStock();
    if (a === "marcas") return viewTaxonomy();
    if (a === "envios") return viewShipping();
    if (a === "notificaciones") return viewNotifications();
    if (a === "ajustes") return viewSettings();
    if (a === "admins") return viewAdmins();
    shell("", "No encontrado", "<p>Esa sección no existe.</p>");
  }

  /* ---------- Resumen ---------- */
  function viewHome() {
    const s = SUM;
    shell("", "Resumen", `<div class="ad-cards">
      <a class="ad-stat ${s.unreadOrders ? "warn" : ""}" href="#/pedidos?unread=1"><b>${s.unreadOrders}</b>Pedidos nuevos sin leer</a>
      <a class="ad-stat ${s.needsReview ? "warn" : ""}" href="#/pedidos?review=1"><b>${s.needsReview}</b>Pedidos a revisar (pago sin stock)</a>
      <a class="ad-stat ${s.lowStock ? "warn" : ""}" href="#/stock"><b>${s.lowStock}</b>Variantes con stock bajo (≤ ${s.threshold})</a>
      <a class="ad-stat ${s.failedNotifications ? "warn" : ""}" href="#/notificaciones"><b>${s.failedNotifications}</b>Avisos con fallos</a>
      <a class="ad-stat" href="#/productos?f=unconfirmed"><b>${s.unconfirmedStock}</b>Publicados sin existencias confirmadas (no se pueden comprar)</a>
      <a class="ad-stat" href="#/productos?f=nophoto"><b>${s.withoutPhotos}</b>Publicados sin fotografía</a>
      <a class="ad-stat" href="#/productos"><b>${s.products}</b>Productos en total</a></div>
      <div class="ad-card"><h2>Para empezar a vender</h2><ol><li>Sube las fotos de cada producto (Productos → elegir producto → Fotografías).</li><li>Cuenta las existencias reales y escríbelas por talla/color. <b>Sin esa cantidad el producto no se puede comprar.</b></li><li>Configura envíos, contacto y destinatarios de avisos en «Envíos» y «Ajustes».</li></ol></div>`);
  }

  /* ---------- Productos ---------- */
  async function viewProducts(q) {
    const r = await api("/api/admin/products" + (q.q ? "?q=" + encodeURIComponent(q.q) : "")); if (!r.ok) return shell("productos", "Productos", `<p class="err-box">${esc(err(r))}</p>`);
    let list = r.data; const f = q.f || "";
    if (f === "nophoto") list = list.filter((p) => p.status === "published" && p.photos === 0);
    if (f === "unconfirmed") list = list.filter((p) => p.status === "published" && p.confirmed === 0);
    if (f === "low") list = list.filter((p) => p.low > 0);
    if (f === "draft") list = list.filter((p) => p.status === "draft");
    shell("productos", "Productos", `<div class="ad-card"><form id="sf" class="ad-row"><div class="field"><label for="sq">Buscar</label><input id="sq" name="q" value="${esc(q.q || "")}" placeholder="Nombre o código"></div>
      <div class="field"><label for="sfl">Mostrar</label><select id="sfl" name="f">${[["", "Todos"], ["nophoto", "Sin fotografía"], ["unconfirmed", "Sin existencias confirmadas"], ["low", "Con stock bajo"], ["draft", "Borradores"]].map(([v, n]) => `<option value="${v}" ${v === f ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <button class="btn btn-ghost sm" type="submit">Filtrar</button><button class="btn btn-primary sm" type="button" id="newP">+ Nuevo producto</button></form>
      <div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Producto</th><th>Subcategoría</th><th>Precio</th><th>Estado</th><th>Fotos</th><th>Existencias</th></tr></thead><tbody>
      ${list.map((p) => `<tr class="click" data-id="${esc(p.id)}"><td><b>${esc(p.name)}</b><br><small>${esc(p.id)}</small></td><td>${esc(subName(p.sub))}</td><td>${p.priceCents == null ? "—" : money(p.priceCents)}</td>
        <td><span class="tag ${p.status === "published" ? "ok" : "mute"}">${p.status === "published" ? "Publicado" : "Borrador"}</span>${p.isNew ? '<span class="tag sky">Novedad</span>' : ""}${p.isSelection ? '<span class="tag sky">Selección</span>' : ""}</td>
        <td>${p.photos ? p.photos : '<span class="tag warn">Imagen próximamente</span>'}</td>
        <td>${p.confirmed === 0 ? '<span class="tag warn">Sin confirmar</span>' : `${p.units} u.${p.confirmed < p.variants ? ` <span class="tag warn">${p.variants - p.confirmed} sin confirmar</span>` : ""}${p.low ? ' <span class="tag warn">Bajo</span>' : ""}`}</td></tr>`).join("") || '<tr><td colspan="6">Sin resultados.</td></tr>'}</tbody></table></div><p class="sum-note">${list.length} productos</p></div>`);
    $$("tr.click").forEach((tr) => tr.addEventListener("click", () => (location.hash = "#/productos/" + tr.dataset.id)));
    $("#sf").addEventListener("submit", (e) => { e.preventDefault(); const d = fd(e.target); location.hash = `#/productos?q=${encodeURIComponent(d.q)}&f=${d.f}`; });
    $("#newP").addEventListener("click", () => newProductDialog());
  }
  function newProductDialog() {
    const subs = TAX.categories.flatMap((c) => c.subs.map((s) => [s.id, `${c.name} · ${s.name}`]));
    const box = document.createElement("div"); box.className = "ad-card"; box.innerHTML = `<h2>Nuevo producto</h2><form id="np" class="ad-row"><div class="field"><label for="npn">Nombre</label><input id="npn" name="name" required></div><div class="field"><label for="nps">Subcategoría</label><select id="nps" name="sub">${subs.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select></div><button class="btn btn-primary sm" type="submit">Crear borrador</button></form><div class="err-box" id="npm" role="alert"></div>`;
    $("#main").insertBefore(box, $("#main").children[1]); $("#npn").focus();
    $("#np").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/admin/products", { method: "POST", body: fd(e.target) }); if (r.ok) location.hash = "#/productos/" + r.data.id; else $("#npm").textContent = err(r); });
  }

  async function viewProduct(id) {
    const [pr, tx] = await Promise.all([api("/api/admin/products/" + encodeURIComponent(id)), TAX ? Promise.resolve({ ok: true }) : loadTax()]);
    if (!pr.ok) return shell("productos", "Producto", `<p class="err-box">${esc(err(pr, "No existe."))}</p>`);
    const p = pr.data; const subs = TAX.categories.flatMap((c) => c.subs.map((s) => [s.id, `${c.name} · ${s.name}`]));
    const vrow = (v) => `<tr data-vid="${v.id || ""}"><td><input name="color" list="dlColors" value="${esc(v.color)}" placeholder="(sin color)" aria-label="Color"></td><td><input name="size" value="${esc(v.size)}" placeholder="(sin talla)" aria-label="Talla"></td>
      <td><input name="price" inputmode="decimal" value="${v.priceCents != null ? (v.priceCents / 100).toFixed(2) : ""}" aria-label="Precio en soles" style="width:96px"></td>
      <td>${v.id ? `<input name="stock" inputmode="numeric" value="${v.stock ?? ""}" placeholder="sin confirmar" aria-label="Existencias" style="width:110px"> <button class="btn btn-ghost sm" type="button" data-setstock="${v.id}">Fijar</button>${v.reserved ? `<br><small>${v.reserved} reservadas</small>` : ""}` : '<small>Guarda primero</small>'}</td>
      <td><button class="btn btn-ghost sm danger" type="button" data-rmv>Quitar</button></td></tr>`;
    shell("productos", p.name, `<p><a class="link-arrow" href="#/productos">← Volver a productos</a></p>
      <datalist id="dlColors">${TAX.colors.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist><datalist id="dlBrands">${TAX.brands.map((b) => `<option value="${esc(b.name)}">`).join("")}</datalist>
      <form id="pf" novalidate><div class="ad-card"><h2>Datos</h2>
        <div class="ad-row"><div class="field"><label for="fn">Nombre</label><input id="fn" name="name" value="${esc(p.name)}" required></div><div class="field"><label for="fs">Subcategoría</label><select id="fs" name="sub">${subs.map(([v, n]) => `<option value="${v}" ${v === p.sub ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          <div class="field"><label for="fst">Estado</label><select id="fst" name="status"><option value="draft" ${p.status === "draft" ? "selected" : ""}>Borrador (oculto)</option><option value="published" ${p.status === "published" ? "selected" : ""}>Publicado</option></select></div></div>
        <div class="field"><label for="fb">Marcas (separadas por coma; una colaboración lleva varias, ej. Nike, Supreme)</label><input id="fb" name="brands" list="dlBrands" value="${esc(p.brands.join(", "))}"></div>
        <div class="field" style="margin-top:12px"><label for="fd">Descripción</label><textarea id="fd" name="description" maxlength="4000">${esc(p.description)}</textarea></div>
        <div class="ad-row" style="margin-top:12px"><label class="chk"><input type="checkbox" name="isNew" ${p.isNew ? "checked" : ""}> Mostrar etiqueta «Nuevo»</label><label class="chk"><input type="checkbox" name="isSelection" ${p.isSelection ? "checked" : ""}> Destacado en «Selección Flowers»</label></div></div>
      <div class="ad-card"><h2>Variantes, precios y existencias</h2><p class="sum-note">Todas las tallas de un mismo color llevan el mismo precio. Las tallas del inventario NO son existencias: escribe la cantidad contada y pulsa «Fijar». Sin cantidad, la variante no se puede comprar.</p>
        <div class="tbl-wrap"><table class="ad-t" id="vt"><thead><tr><th>Color</th><th>Talla</th><th>Precio (S/)</th><th>Existencias</th><th></th></tr></thead><tbody>${p.variants.filter((v) => v.active).map(vrow).join("")}</tbody></table></div>
        <div class="ad-actions"><button class="btn btn-ghost sm" type="button" id="addV">+ Agregar variante</button><button class="btn btn-ghost sm" type="button" id="setAll">Mismo precio para todas</button></div></div>
      <div class="err-box" id="pm" role="alert"></div><div class="ad-actions"><button class="btn btn-primary" type="submit">Guardar producto</button><a class="btn btn-ghost" target="_blank" rel="noopener" href="/#/producto/${esc(p.id)}">Ver en la tienda</a></div></form>
      <div class="ad-card" style="margin-top:18px"><h2>Fotografías</h2><div id="imgs"></div>
        <form id="upf" class="ad-row" style="margin-top:12px"><div class="field"><label for="uf">Agregar fotos (JPG, PNG, WebP o AVIF)</label><input id="uf" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple></div>
          <div class="field"><label for="uc">Es de este color (opcional)</label><select id="uc"><option value="">Foto general del producto</option>${[...new Set(p.variants.map((v) => v.color).filter(Boolean))].map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
          <div class="field"><label for="ua">Texto alternativo</label><input id="ua" placeholder="${esc(p.name)}"></div><button class="btn btn-primary sm" type="submit">Subir</button></form><div class="err-box" id="um" role="alert"></div></div>`);

    const colors = () => [...new Set($$("#vt tbody tr").map((tr) => $("[name=color]", tr).value.trim()).filter(Boolean))];
    const bind = (tr) => {
      $("[data-rmv]", tr).addEventListener("click", () => tr.remove());
      const sb = $("[data-setstock]", tr); if (sb) sb.addEventListener("click", async () => {
        const raw = $("[name=stock]", tr).value.trim(); if (raw === "" || !/^\d+$/.test(raw)) return toast("Escribe una cantidad (0 o más).");
        const r = await api("/api/admin/stock", { method: "POST", body: { variantId: +sb.dataset.setstock, quantity: +raw, note: "Ajuste desde el panel" } }); toast(r.ok ? "Existencias guardadas." : err(r));
      });
    };
    $$("#vt tbody tr").forEach(bind);
    $("#addV").addEventListener("click", () => { const t = document.createElement("tbody"); t.innerHTML = vrow({ color: "", size: "", priceCents: null }); const tr = t.firstElementChild; $("#vt tbody").appendChild(tr); bind(tr); $("[name=color]", tr).focus(); });
    $("#setAll").addEventListener("click", () => { const v = prompt("Precio en soles para TODAS las variantes (ej. 350.00):"); if (v === null) return; $$("#vt [name=price]").forEach((i) => (i.value = v)); });
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, d = fd(f), m = $("#pm"); m.textContent = "";
      const variants = $$("#vt tbody tr").map((tr) => ({ color: $("[name=color]", tr).value.trim(), size: $("[name=size]", tr).value.trim(), priceCents: Math.round(parseFloat(($("[name=price]", tr).value || "").replace(",", ".")) * 100) }));
      if (variants.some((v) => !Number.isFinite(v.priceCents))) { m.textContent = "Escribe el precio de cada variante."; return; }
      const r = await api("/api/admin/products/" + encodeURIComponent(id), { method: "PUT", body: { name: d.name, sub: d.sub, status: d.status, description: d.description, brands: d.brands.split(",").map((s) => s.trim()).filter(Boolean), isNew: !!d.isNew, isSelection: !!d.isSelection, variants } });
      if (r.ok) { toast("Producto guardado."); await loadTax(); viewProduct(id); } else m.textContent = err(r);
    });
    renderImages(p);
    $("#upf").addEventListener("submit", async (e) => {
      e.preventDefault(); const files = Array.from($("#uf").files); const m = $("#um"); m.textContent = "";
      if (!files.length) { m.textContent = "Elige al menos una imagen."; return; }
      for (const file of files) {
        try { const blob = await shrink(file); const form = new FormData(); form.append("file", blob, "foto.webp"); form.append("color", $("#uc").value); form.append("alt", $("#ua").value.trim());
          const r = await api(`/api/admin/products/${encodeURIComponent(id)}/images`, { method: "POST", form }); if (!r.ok) { m.textContent = `${file.name}: ${err(r)}`; break; }
        } catch (ex) { m.textContent = `${file.name}: ${ex.message}`; break; }
      }
      if (!m.textContent) toast("Fotos subidas."); viewProduct(id);
    });
  }

  /* Reduce la foto en el navegador (máx. 1600 px, proporción intacta) y la convierte a WebP para que cargue rápido. */
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("Formato no permitido (usa JPG, PNG, WebP o AVIF).");
    if (file.size > 20 * 1024 * 1024) throw new Error("La imagen pesa más de 20 MB.");
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/webp", 0.86));
    if (!blob) throw new Error("No se pudo procesar la imagen.");
    if (blob.size > 3 * 1024 * 1024) throw new Error("La imagen sigue pesando más de 3 MB tras optimizarla.");
    return blob;
  }
  function renderImages(p) {
    const box = $("#imgs"); const cols = [...new Set(p.variants.map((v) => v.color).filter(Boolean))];
    if (!p.images.length) { box.innerHTML = `<p><span class="tag warn">Imagen próximamente</span> Este producto aún no tiene fotografías.</p>`; return; }
    box.innerHTML = `<div class="img-grid">${p.images.map((i, n) => `<div class="img-card" data-iid="${i.id}"><img src="${esc(i.url)}" alt="${esc(i.alt)}" loading="lazy">
      <label class="chk"><input type="radio" name="prim" value="${i.id}" ${i.isPrimary ? "checked" : ""}> Principal</label>
      <div class="field"><label>Color</label><select data-f="color"><option value="">General</option>${cols.map((c) => `<option ${c === i.color ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="field"><label>Texto alternativo</label><input data-f="alt" value="${esc(i.alt)}"></div>
      <div class="ad-actions" style="margin:0"><button class="btn btn-ghost sm" type="button" data-mv="-1" ${n === 0 ? "disabled" : ""} aria-label="Mover antes">◀</button><button class="btn btn-ghost sm" type="button" data-mv="1" ${n === p.images.length - 1 ? "disabled" : ""} aria-label="Mover después">▶</button>
        <label class="btn btn-ghost sm" style="cursor:pointer">Reemplazar<input type="file" accept="image/*" data-rep hidden></label><button class="btn btn-ghost sm danger" type="button" data-del>Eliminar</button></div></div>`).join("")}</div>
      <div class="ad-actions"><button class="btn btn-primary sm" type="button" id="saveImgs">Guardar orden y detalles</button></div>`;
    const collect = () => $$(".img-card", box).map((c) => ({ id: +c.dataset.iid, alt: $("[data-f=alt]", c).value, color: $("[data-f=color]", c).value, isPrimary: $("[name=prim]", c).checked }));
    const save = async () => { const r = await api(`/api/admin/products/${encodeURIComponent(p.id)}/images`, { method: "PUT", body: { images: collect() } }); if (r.ok) { toast("Fotos actualizadas."); viewProduct(p.id); } else toast(err(r)); };
    $("#saveImgs").addEventListener("click", save);
    $$("[data-mv]", box).forEach((b) => b.addEventListener("click", () => { const card = b.closest(".img-card"); const d = +b.dataset.mv; const sib = d < 0 ? card.previousElementSibling : card.nextElementSibling; if (!sib) return; d < 0 ? card.parentNode.insertBefore(card, sib) : card.parentNode.insertBefore(sib, card); save(); }));
    $$("[data-del]", box).forEach((b) => b.addEventListener("click", async () => { if (!confirm("¿Eliminar esta fotografía?")) return; const r = await api("/api/admin/images/" + b.closest(".img-card").dataset.iid, { method: "DELETE" }); if (r.ok) viewProduct(p.id); else toast(err(r)); }));
    $$("[data-rep]", box).forEach((inp) => inp.addEventListener("change", async () => { try { const blob = await shrink(inp.files[0]); const form = new FormData(); form.append("file", blob, "foto.webp"); const r = await api(`/api/admin/images/${inp.closest(".img-card").dataset.iid}/replace`, { method: "POST", form }); if (r.ok) viewProduct(p.id); else toast(err(r)); } catch (ex) { toast(ex.message); } }));
  }

  /* ---------- Pedidos ---------- */
  async function viewOrders(q) {
    const qs = new URLSearchParams({ pay: q.pay || "", ful: q.ful || "", unread: q.unread || "", q: q.q || "" });
    const r = await api("/api/admin/orders?" + qs); let list = r.ok ? r.data : []; if (q.review) list = list.filter((o) => o.needsReview);
    shell("pedidos", "Pedidos", `<div class="ad-card"><form id="of" class="ad-row"><div class="field"><label for="oq">Buscar</label><input id="oq" name="q" value="${esc(q.q || "")}" placeholder="N.º, nombre o correo"></div>
      <div class="field"><label for="op">Pago</label><select id="op" name="pay"><option value="">Todos</option>${Object.entries(PAY).map(([k, v]) => `<option value="${k}" ${q.pay === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label for="of2">Preparación</label><select id="of2" name="ful"><option value="">Todas</option>${Object.entries(FUL).filter(([k]) => k !== "none").map(([k, v]) => `<option value="${k}" ${q.ful === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <label class="chk"><input type="checkbox" name="unread" value="1" ${q.unread ? "checked" : ""}> Solo sin leer</label><button class="btn btn-ghost sm" type="submit">Filtrar</button></form>
      <div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Preparación</th></tr></thead><tbody>
      ${list.map((o) => `<tr class="click" data-n="${o.number}"><td><b>${esc(o.number)}</b> ${o.adminRead ? "" : '<span class="tag warn">Nuevo</span>'}${o.needsReview ? '<span class="tag warn">Revisar</span>' : ""}</td><td>${esc(fdate(o.createdAt))}</td><td>${esc(o.name)}<br><small>${esc(o.email)}</small></td><td>${money(o.totalCents)}</td>
        <td><span class="tag ${o.paymentStatus === "paid" ? "ok" : ["rejected", "cancelled", "expired"].includes(o.paymentStatus) ? "warn" : ""}">${PAY[o.paymentStatus]}</span></td><td><span class="tag mute">${FUL[o.fulfillmentStatus]}</span></td></tr>`).join("") || '<tr><td colspan="6">Sin pedidos.</td></tr>'}</tbody></table></div></div>`);
    $$("tr.click").forEach((tr) => tr.addEventListener("click", () => (location.hash = "#/pedido/" + tr.dataset.n)));
    $("#of").addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(e.target); const p = new URLSearchParams(); for (const [k, v] of f) if (v) p.set(k, v); location.hash = "#/pedidos?" + p; });
  }
  async function viewOrder(n) {
    const r = await api("/api/admin/orders/" + encodeURIComponent(n)); if (!r.ok) return shell("pedidos", "Pedido", `<p class="err-box">${esc(err(r, "Pedido no encontrado."))}</p>`);
    const { order: o, events, payments, paymentEvents, notifications, next } = r.data;
    if (!o.adminRead) { await api(`/api/admin/orders/${encodeURIComponent(n)}/read`, { method: "POST" }); await refreshSummary(); }
    const addr = o.address && o.address.line1 ? [o.address.line1, o.address.district, o.address.city, o.address.reference].filter(Boolean).join(", ") : "—";
    shell("pedidos", "Pedido " + o.number, `<p><a class="link-arrow" href="#/pedidos">← Volver a pedidos</a></p>
      ${o.isTest ? '<div class="sim-note"><b>Pedido de PRUEBA</b> (pago simulado).</div>' : ""}
      ${o.needsReview ? `<div class="sim-note" style="background:#fde3ef;border-color:#a1004f;color:#6e0035"><b>Requiere revisión:</b> ${esc(o.reviewNote)} El cliente pagó pero no había stock. Contáctalo y gestiona el reembolso con la pasarela, o resuelve la revisión si ya repusiste el stock. <button class="btn btn-ghost sm" id="resolve" type="button">Marcar revisión resuelta</button></div>` : ""}
      <div class="ad-cards"><div class="ad-stat"><small>Pago (solo lectura, lo confirma el proveedor)</small><b style="font-size:1.2rem">${PAY[o.paymentStatus]}</b></div><div class="ad-stat"><small>Preparación / envío</small><b style="font-size:1.2rem">${FUL[o.fulfillmentStatus]}</b></div><div class="ad-stat"><small>Total</small><b style="font-size:1.2rem">${money(o.totalCents)}</b></div></div>
      <div class="ad-card"><h2>Cliente y entrega</h2><p><b>${esc(o.name)}</b> · ${esc(o.email)} · ${esc(o.phone)}</p><p>${esc(o.shippingMethod)} (${esc(o.shippingZone)}) · ${money(o.shippingCents)}</p><p>Dirección: ${esc(addr)}</p><p>Fecha: ${esc(fdate(o.createdAt))}${o.paidAt ? " · Pagado: " + esc(fdate(o.paidAt)) : ""}</p>
        ${o.trackingCode || o.carrier ? `<p>Seguimiento: <b>${esc(o.carrier)} ${esc(o.trackingCode)}</b> ${esc(o.trackingUrl)}</p>` : ""}</div>
      <div class="ad-card"><h2>Productos (copia al momento de la compra)</h2><div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Producto</th><th>Variante</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${esc(i.name)}<br><small>${esc(i.brands)}</small></td><td>${esc([i.color, i.size && "Talla " + i.size].filter(Boolean).join(" · ") || "—")}</td><td>${i.qty}</td><td>${money(i.unitCents)}</td><td>${money(i.unitCents * i.qty)}</td></tr>`).join("")}</tbody></table></div>
        <p style="margin-top:8px">Subtotal ${money(o.subtotalCents)} · Envío ${money(o.shippingCents)} · <b>Total ${money(o.totalCents)}</b></p></div>
      ${next.length ? `<div class="ad-card"><h2>Actualizar preparación y envío</h2><form id="ff" class="ad-row"><div class="field"><label for="ft">Nuevo estado</label><select id="ft" name="to">${next.map((s) => `<option value="${s}">${FUL[s]}</option>`).join("")}</select></div>
        <div class="field"><label for="fc">Transportista</label><input id="fc" name="carrier"></div><div class="field"><label for="fcode">Código de seguimiento</label><input id="fcode" name="code"></div><div class="field"><label for="fu">Enlace de seguimiento</label><input id="fu" name="url" placeholder="https://"></div><div class="field"><label for="fnote">Nota</label><input id="fnote" name="note"></div><button class="btn btn-primary sm" type="submit">Actualizar</button></form><div class="err-box" id="fm" role="alert"></div></div>` : ""}
      <div class="ad-card"><h2>Pagos del proveedor</h2><p class="sum-note">El estado del pago solo cambia cuando el proveedor lo notifica; no se puede editar a mano.</p>
        ${payments.map((p) => `<p>Pago <code>${esc(p.id.slice(0, 8))}</code> · ${esc(p.provider)} · ${PAY[p.status]} · ${money(p.amountCents)}</p>`).join("")}
        <ul class="timeline">${paymentEvents.map((e) => `<li>${esc(e.type)} → <b>${esc(e.outcome)}</b><br><small>${esc(fdate(e.at))} · ${esc(e.eventId.slice(0, 8))}</small></li>`).join("") || "<li>Sin notificaciones del proveedor todavía.</li>"}</ul></div>
      <div class="ad-card"><h2>Historial</h2><ul class="timeline">${events.map((e) => `<li>${esc(e.detail)}<br><small>${esc(fdate(e.at))} · ${esc(e.kind)}</small></li>`).join("")}</ul></div>
      <div class="ad-card"><h2>Avisos de este pedido</h2>${notifTable(notifications)}</div>`);
    const ff = $("#ff"); if (ff) ff.addEventListener("submit", async (e) => { e.preventDefault(); const r2 = await api(`/api/admin/orders/${encodeURIComponent(n)}/fulfillment`, { method: "POST", body: fd(ff) }); if (r2.ok) { toast("Pedido actualizado."); viewOrder(n); } else $("#fm").textContent = err(r2); });
    const rs = $("#resolve"); if (rs) rs.addEventListener("click", async () => { const note = prompt("Nota (qué hiciste):") || ""; const r2 = await api(`/api/admin/orders/${encodeURIComponent(n)}/resolve-review`, { method: "POST", body: { note } }); if (r2.ok) viewOrder(n); else toast(err(r2)); });
    bindRetry();
  }

  /* ---------- Stock bajo ---------- */
  async function viewLowStock() {
    const [r, s] = await Promise.all([api("/api/admin/low-stock"), api("/api/admin/settings")]);
    shell("stock", "Stock bajo", `<div class="ad-card"><form id="th" class="ad-row"><div class="field"><label for="tv">Avisar cuando queden (o menos) unidades</label><input id="tv" name="low_stock.threshold" inputmode="numeric" value="${esc(s.data["low_stock.threshold"])}"></div><button class="btn btn-primary sm" type="submit">Guardar umbral</button></form>
      <div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Producto</th><th>Variante</th><th>Quedan</th><th></th></tr></thead><tbody>${r.data.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc([v.color, v.size && "Talla " + v.size].filter(Boolean).join(" · ") || "—")}</td><td><span class="tag warn">${v.stock}</span></td><td><a class="link-arrow" href="#/productos/${esc(v.productId)}">Editar</a></td></tr>`).join("") || '<tr><td colspan="4">No hay variantes con stock bajo.</td></tr>'}</tbody></table></div></div>`);
    $("#th").addEventListener("submit", async (e) => { e.preventDefault(); const r2 = await api("/api/admin/settings", { method: "PUT", body: fd(e.target) }); toast(r2.ok ? "Umbral guardado." : err(r2)); if (r2.ok) viewLowStock(); });
  }

  /* ---------- Marcas, categorías, colores ---------- */
  async function loadTax() { const r = await api("/api/admin/taxonomy"); if (r.ok) TAX = r.data; return r; }
  async function viewTaxonomy() {
    await loadTax();
    shell("marcas", "Marcas y categorías", `<div class="ad-card"><h2>Marcas</h2><p class="sum-note">Las marcas aparecen en el filtro de la tienda cuando tienen productos. Una colaboración se asigna con varias marcas en el producto.</p>
      <form id="bf" class="ad-row"><div class="field"><label for="bn">Nueva marca</label><input id="bn" name="name"></div><button class="btn btn-primary sm" type="submit">Agregar</button></form>
      <div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Marca</th><th>Productos</th><th></th></tr></thead><tbody>${TAX.brands.map((b) => `<tr><td><input value="${esc(b.name)}" data-bid="${b.id}" aria-label="Nombre de la marca"></td><td>${b.products}</td><td><button class="btn btn-ghost sm" data-bsave="${b.id}" type="button">Renombrar</button> <button class="btn btn-ghost sm danger" data-bdel="${b.id}" type="button" ${b.products ? "disabled" : ""}>Eliminar</button></td></tr>`).join("")}</tbody></table></div></div>
      <div class="ad-card"><h2>Categorías y subcategorías</h2><p class="sum-note">Una categoría o subcategoría sin productos publicados se oculta sola en la tienda.</p>
        ${TAX.categories.map((c) => `<div class="ad-card" style="background:var(--bg-soft)"><div class="ad-row"><div class="field"><label>Categoría</label><input data-cn="${c.id}" value="${esc(c.name)}"></div><div class="field"><label>Frase</label><input data-ct="${c.id}" value="${esc(c.tagline)}"></div><button class="btn btn-ghost sm" data-csave="${c.id}" type="button">Guardar</button></div>
          ${c.subs.map((s) => `<div class="ad-row"><div class="field"><label>Subcategoría <span class="tag ${s.published ? "ok" : "mute"}">${s.published} publicados</span></label><input data-sn="${s.id}" value="${esc(s.name)}"></div><button class="btn btn-ghost sm" data-ssave="${s.id}" type="button">Renombrar</button></div>`).join("")}
          <div class="ad-row"><div class="field"><label>Nueva subcategoría en ${esc(c.name)}</label><input data-newsub="${c.id}"></div><button class="btn btn-ghost sm" data-addsub="${c.id}" type="button">Agregar</button></div></div>`).join("")}</div>
      <div class="ad-card"><h2>Colores</h2><p class="sum-note">Define el color de la muestra que ve el cliente (formato #RRGGBB).</p><div class="ad-row">${TAX.colors.map((c) => `<span class="tag" style="padding:5px 12px"><i style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${esc(c.hex)};border:1px solid #0003;vertical-align:-1px"></i> ${esc(c.name)} ${esc(c.hex)}</span>`).join("")}</div>
        <form id="cf" class="ad-row"><div class="field"><label for="cn">Nombre del color</label><input id="cn" name="name"></div><div class="field"><label for="ch">Tono</label><input id="ch" name="hex" type="color" value="#5C509C"></div><button class="btn btn-primary sm" type="submit">Guardar color</button></form></div>`);
    $("#bf").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/admin/brands", { method: "POST", body: fd(e.target) }); toast(r.ok ? "Marca agregada." : err(r)); viewTaxonomy(); });
    $$("[data-bsave]").forEach((b) => b.addEventListener("click", async () => { const r = await api("/api/admin/brands/" + b.dataset.bsave, { method: "PUT", body: { name: $(`[data-bid="${b.dataset.bsave}"]`).value } }); toast(r.ok ? "Marca actualizada." : err(r)); if (r.ok) viewTaxonomy(); }));
    $$("[data-bdel]").forEach((b) => b.addEventListener("click", async () => { const r = await api("/api/admin/brands/" + b.dataset.bdel, { method: "DELETE" }); toast(r.ok ? "Marca eliminada." : err(r)); viewTaxonomy(); }));
    $$("[data-csave]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.csave; const r = await api("/api/admin/categories/" + id, { method: "PUT", body: { name: $(`[data-cn="${id}"]`).value, tagline: $(`[data-ct="${id}"]`).value } }); toast(r.ok ? "Categoría guardada." : err(r)); }));
    $$("[data-ssave]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.ssave; const r = await api("/api/admin/subcategories/" + id, { method: "PUT", body: { name: $(`[data-sn="${id}"]`).value } }); toast(r.ok ? "Subcategoría guardada." : err(r)); }));
    $$("[data-addsub]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.addsub; const r = await api("/api/admin/subcategories", { method: "POST", body: { categoryId: id, name: $(`[data-newsub="${id}"]`).value } }); toast(r.ok ? "Subcategoría agregada." : err(r)); if (r.ok) viewTaxonomy(); }));
    $("#cf").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/admin/colors", { method: "POST", body: fd(e.target) }); toast(r.ok ? "Color guardado." : err(r)); if (r.ok) viewTaxonomy(); });
  }

  /* ---------- Envíos ---------- */
  async function viewShipping() {
    const r = await api("/api/admin/shipping"); let methods = r.data;
    const draw = () => {
      $("#shipBox").innerHTML = methods.map((m, mi) => `<div class="ad-card" style="background:var(--bg-soft)" data-mi="${mi}"><div class="ad-row"><div class="field"><label>Modalidad</label><input data-k="name" value="${esc(m.name)}"></div>
        <div class="field"><label>Tipo</label><select data-k="kind"><option value="delivery" ${m.kind === "delivery" ? "selected" : ""}>Entrega a domicilio</option><option value="pickup" ${m.kind === "pickup" ? "selected" : ""}>Retiro en tienda</option></select></div><label class="chk"><input type="checkbox" data-k="active" ${m.active ? "checked" : ""}> Activa</label></div>
        <div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Zona</th><th>Tarifa (S/)</th><th>Nota</th><th>Activa</th><th></th></tr></thead><tbody>${m.rates.map((t, ri) => `<tr data-ri="${ri}"><td><input data-r="zone" value="${esc(t.zone)}"></td><td><input data-r="price" inputmode="decimal" value="${(t.priceCents / 100).toFixed(2)}" style="width:96px"></td><td><input data-r="note" value="${esc(t.note)}"></td><td><input type="checkbox" data-r="active" ${t.active ? "checked" : ""} aria-label="Activa"></td><td><button class="btn btn-ghost sm danger" type="button" data-rmrate>Quitar</button></td></tr>`).join("")}</tbody></table></div>
        <div class="ad-actions"><button class="btn btn-ghost sm" type="button" data-addrate>+ Zona / tarifa</button><button class="btn btn-ghost sm danger" type="button" data-rmmethod>Quitar modalidad</button></div></div>`).join("") || "<p>No hay modalidades de envío. Sin ellas no se puede completar una compra.</p>";
      $$("[data-addrate]").forEach((b) => b.addEventListener("click", () => { sync(); methods[+b.closest("[data-mi]").dataset.mi].rates.push({ zone: "", priceCents: 0, note: "", active: true }); draw(); }));
      $$("[data-rmrate]").forEach((b) => b.addEventListener("click", () => { sync(); methods[+b.closest("[data-mi]").dataset.mi].rates.splice(+b.closest("[data-ri]").dataset.ri, 1); draw(); }));
      $$("[data-rmmethod]").forEach((b) => b.addEventListener("click", () => { sync(); methods.splice(+b.closest("[data-mi]").dataset.mi, 1); draw(); }));
    };
    const sync = () => $$("[data-mi]").forEach((box) => { const m = methods[+box.dataset.mi]; m.name = $("[data-k=name]", box).value; m.kind = $("[data-k=kind]", box).value; m.active = $("[data-k=active]", box).checked;
      $$("[data-ri]", box).forEach((tr) => { const t = m.rates[+tr.dataset.ri]; t.zone = $("[data-r=zone]", tr).value; t.priceCents = Math.round(parseFloat($("[data-r=price]", tr).value.replace(",", ".")) * 100); t.note = $("[data-r=note]", tr).value; t.active = $("[data-r=active]", tr).checked; }); });
    shell("envios", "Envíos", `<div class="sim-note">Las modalidades marcadas «(PRUEBA)» son datos de ejemplo. Reemplázalas con las condiciones reales de Flowers antes de vender. No se inventan plazos ni envíos gratuitos.</div><div id="shipBox"></div>
      <div class="ad-actions"><button class="btn btn-ghost" id="addM" type="button">+ Agregar modalidad</button><button class="btn btn-primary" id="saveShip" type="button">Guardar envíos</button></div><div class="err-box" id="sm" role="alert"></div>`);
    draw();
    $("#addM").addEventListener("click", () => { sync(); methods.push({ name: "", kind: "delivery", active: true, rates: [{ zone: "", priceCents: 0, note: "", active: true }] }); draw(); });
    $("#saveShip").addEventListener("click", async () => { sync(); if (methods.some((m) => m.rates.some((t) => !Number.isFinite(t.priceCents)))) { $("#sm").textContent = "Revisa las tarifas."; return; } const r2 = await api("/api/admin/shipping", { method: "PUT", body: { methods } }); if (r2.ok) { toast("Envíos guardados."); viewShipping(); } else $("#sm").textContent = err(r2); });
  }

  /* ---------- Notificaciones ---------- */
  const notifTable = (list) => `<div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Fecha</th><th>Canal</th><th>Destinatario</th><th>Asunto</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((n) => `<tr><td>${esc(fdate(n.at))}</td><td>${esc(n.channel)}</td><td>${esc(n.recipient)}</td><td>${esc(n.subject)}${n.error ? `<br><small style="color:#a1004f">${esc(n.error)}</small>` : ""}</td><td><span class="tag ${n.status === "sent" ? "ok" : n.status === "dead" ? "warn" : "mute"}">${NOTIF[n.status] || n.status}</span>${n.attempts ? `<br><small>${n.attempts} intento(s)</small>` : ""}</td><td>${["dead", "pending", "skipped"].includes(n.status) ? `<button class="btn btn-ghost sm" data-retry="${n.id}" type="button">Reintentar</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6">Sin avisos.</td></tr>'}</tbody></table></div>`;
  function bindRetry() { $$("[data-retry]").forEach((b) => b.addEventListener("click", async () => { const r = await api(`/api/admin/notifications/${b.dataset.retry}/retry`, { method: "POST" }); toast(r.ok ? "Reintento programado." : err(r)); setTimeout(route, 1500); })); }
  async function viewNotifications() {
    const r = await api("/api/admin/notifications");
    shell("notificaciones", "Notificaciones", `<div class="sim-note"><b>Entorno de pruebas:</b> los correos y WhatsApp son SIMULADOS (no salen por internet). Se ven en <a href="/dev/bandeja" target="_blank" rel="noopener">la bandeja de pruebas</a>. Un fallo de aviso nunca cancela una compra: se reintenta solo con esperas crecientes.</div>
      <div class="ad-card"><h2>Enviar un aviso de prueba</h2><form id="tf" class="ad-row"><div class="field"><label for="tc">Canal</label><select id="tc" name="channel"><option value="email">Correo</option><option value="whatsapp">WhatsApp</option></select></div><div class="field"><label for="tr">Destinatario (correo o número con código de país)</label><input id="tr" name="recipient"></div><button class="btn btn-primary sm" type="submit">Enviar prueba</button></form></div>
      <div class="ad-card"><h2>Historial</h2>${notifTable(r.data)}</div>`);
    bindRetry();
    $("#tf").addEventListener("submit", async (e) => { e.preventDefault(); const r2 = await api("/api/admin/notifications/test", { method: "POST", body: fd(e.target) }); toast(r2.ok ? "Prueba encolada." : err(r2)); setTimeout(route, 4000); });
  }

  /* ---------- Ajustes ---------- */
  async function viewSettings() {
    const r = await api("/api/admin/settings"); const s = r.data;
    const inp = (k, label, type = "text", hint = "") => `<div class="field"><label for="s_${k}">${label}</label><input id="s_${k}" name="${k}" type="${type}" value="${esc(s[k])}">${hint ? `<small class="sum-note">${hint}</small>` : ""}</div>`;
    const sw = (k, label) => `<label class="chk"><input type="checkbox" name="${k}" ${s[k] === "1" ? "checked" : ""}> ${label}</label>`;
    shell("ajustes", "Ajustes", `<form id="sf2"><div class="ad-card"><h2>Contacto de la tienda</h2><div class="ad-row">${inp("contact.email", "Correo")}${inp("contact.phone", "Teléfono")}</div><div class="ad-row">${inp("contact.address", "Dirección")}${inp("contact.hours", "Horario de atención")}</div>
        ${inp("whatsapp.number", "WhatsApp oficial (con código de país, solo números)", "text", "Si está vacío, no se muestran los botones de WhatsApp. Ej.: 51 + número.")}</div>
      <div class="ad-card"><h2>Avisos de pedidos pagados</h2>${inp("notify.admin_emails", "Correos que reciben los avisos (separados por coma)")}<div class="ad-row">${sw("notify.email.enabled", "Enviar avisos por correo")}${sw("notify.whatsapp.enabled", "Aviso por WhatsApp Business (opcional, requiere configuración oficial)")}</div>${inp("notify.admin_whatsapp", "Número de WhatsApp que recibe el aviso (opcional)")}</div>
      <div class="ad-card"><h2>Inventario y compra</h2><div class="ad-row">${inp("low_stock.threshold", "Avisar stock bajo desde (unidades)", "number")}${inp("reserve.minutes", "Minutos que se reserva el stock durante el pago", "number")}</div>${inp("site.base_url", "Dirección pública de la tienda (para los enlaces de los correos)")}</div>
      <div class="ad-card"><h2>Simulación de fallos (solo pruebas)</h2><div class="ad-row">${sw("sim.email_fail", "Simular caída del servicio de correo")}${sw("sim.whatsapp_fail", "Simular caída de WhatsApp")}</div></div>
      <div class="err-box" id="sm" role="alert"></div><button class="btn btn-primary" type="submit">Guardar ajustes</button></form>`);
    $("#sf2").addEventListener("submit", async (e) => {
      e.preventDefault(); const body = {}; $$("input", e.target).forEach((i) => { body[i.name] = i.type === "checkbox" ? (i.checked ? "1" : "0") : i.value; });
      const r2 = await api("/api/admin/settings", { method: "PUT", body }); if (r2.ok) toast("Ajustes guardados."); else $("#sm").textContent = err(r2);
    });
  }

  /* ---------- Administradores ---------- */
  async function viewAdmins() {
    const r = await api("/api/admin/admins");
    shell("admins", "Administradores", `<div class="ad-card"><h2>Administradores actuales</h2><div class="tbl-wrap"><table class="ad-t"><thead><tr><th>Nombre</th><th>Correo</th><th>Doble factor</th><th>Desde</th></tr></thead><tbody>${r.data.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.email)}</td><td><span class="tag ${a.mfa ? "ok" : "warn"}">${a.mfa ? "Activo" : "Pendiente"}</span></td><td>${esc(fdate(a.createdAt))}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="ad-card"><h2>Invitar a otro administrador</h2><p class="sum-note">Se envía un enlace de un solo uso (vence en 3 días). Las cuentas creadas desde la tienda nunca son administradoras.</p><form id="inv" class="ad-row"><div class="field"><label for="ie">Correo</label><input id="ie" name="email" type="email" required></div><button class="btn btn-primary sm" type="submit">Enviar invitación</button></form><div class="err-box" id="im" role="alert"></div></div>`);
    $("#inv").addEventListener("submit", async (e) => { e.preventDefault(); const r2 = await api("/api/admin/invite", { method: "POST", body: fd(e.target) }); if (r2.ok) { toast("Invitación enviada."); e.target.reset(); } else $("#im").textContent = err(r2); });
  }

  /* ---------- Arranque ---------- */
  async function start() {
    const me = await api("/api/auth/me"); const u = me.data && me.data.user;
    const { parts, q } = hashParts();
    if (parts[0] === "invitacion") return inviteView(q.token || "");
    if (!u) return loginView();
    if (u.role !== "admin") { await api("/api/auth/logout", { method: "POST" }); return loginView("Esta cuenta no tiene acceso al panel."); }
    if (!u.mfaOk) { await api("/api/auth/logout", { method: "POST" }); return loginView("Inicia sesión de nuevo para completar la verificación en dos pasos."); }
    ME = u; await loadTax(); route();
  }
  window.addEventListener("hashchange", () => { if (ME) route(); else if (hashParts().parts[0] === "invitacion") start(); });
  start();
})();
