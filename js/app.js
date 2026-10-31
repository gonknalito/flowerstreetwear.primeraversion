/* ==========================================================================
   FLOWERS STREETWEAR · LÓGICA DE LA TIENDA
   Enrutador por hash (#/ruta) para que funcione abriendo index.html
   o en cualquier hosting estático, sin servidor.
   ========================================================================== */
(function () {
  "use strict";

  const CFG = window.FLOWERS_CONFIG;
  const CATS = window.FLOWERS_CATEGORIES;
  const COLORS = window.FLOWERS_COLORS;
  const Art = window.FlowersArt;
  const PAGES = window.FLOWERS_PAGES;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Utilidades ---------- */
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => `${CFG.currency} ${Number(n).toFixed(2)}`;
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];
  /* Clave de orden para tallas: letras (XS…XL) o numéricas (cintura, calzado EU/US/IT). */
  const sizeKey = (s) => {
    const t = String(s).trim();
    const lt = t.match(/^(XS|S|M|L|XL)\b/);
    if (lt) return 1000 + SIZE_ORDER.indexOf(lt[1]);
    if (/\bLV\b/.test(t)) return 900;
    if (/^\d+(\.\d+)?\s*IT\b/.test(t)) return parseFloat(t);
    const eu = t.match(/\((\d+(?:\.\d+)?)\)/);
    return eu ? parseFloat(eu[1]) : parseFloat(t);
  };
  const sortSizes = (a, b) => sizeKey(a) - sizeKey(b);
  const uniq = (arr) => Array.from(new Set(arr));

  /* ---------- Datos enriquecidos ---------- */
  const SUBS = {};
  CATS.forEach((c) => c.subs.forEach((s) => { SUBS[s.id] = { ...s, cat: c }; }));
  /* Marcas: una sola escritura por marca (sin duplicados como «NIKE» / «Nike»). */
  const BRAND_NAMES = {};
  const normBrands = (list) => uniq((list || []).map((b) => { const t = String(b).trim(), k = norm(t); return BRAND_NAMES[k] || (BRAND_NAMES[k] = t); }));
  const PRODUCTS = window.FLOWERS_PRODUCTS.map((p, order) => {
    const variants = (p.variants && p.variants.length ? p.variants : [{ color: "", sizes: p.sizes || [] }])
      .map((v) => ({ color: "", sizes: [], images: [], ...v, price: v.price != null ? v.price : p.price }));
    const prices = variants.map((v) => v.price);
    return { ...p, order, variants, brands: normBrands(p.brands), available: p.available !== false, images: p.images || [],
      colors: uniq(variants.map((v) => v.color).filter(Boolean)),
      sizes: uniq(variants.flatMap((v) => v.sizes)).sort(sortSizes),
      price: Math.min(...prices), maxPrice: Math.max(...prices),
      cat: SUBS[p.sub].cat.id, catName: SUBS[p.sub].cat.name, subName: SUBS[p.sub].name };
  });
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const hasProducts = (subId) => PRODUCTS.some((p) => p.sub === subId);
  /* Solo se muestran las categorías y subcategorías que tienen productos. */
  const VCATS = CATS.map((c) => ({ ...c, subs: c.subs.filter((s) => hasProducts(s.id)) })).filter((c) => c.subs.length);
  const catById = (id) => CATS.find((c) => c.id === id);
  const visCat = (id) => VCATS.find((c) => c.id === id);
  const hex = (name) => COLORS[name] || "#cccccc";
  const variantOf = (p, color) => p.variants.find((v) => v.color === (color || "")) || p.variants[0];
  const unitPrice = (i) => { const p = byId(i.id); return variantOf(p, i.color).price; };
  const priceLabel = (p) => (p.maxPrice > p.price ? `Desde ${money(p.price)}` : money(p.price));
  const imagesFor = (p, color) => { const v = color ? variantOf(p, color) : null; return v && v.images.length ? v.images : p.images; };
  const productImage = (p, color) => imagesFor(p, color)[0] || Art.placeholder();
  /* Sin datos de «nuevo», se muestra el inventario completo intercalando categorías. */
  function isNewList() {
    const n = PRODUCTS.filter((p) => p.isNew).sort((a, b) => a.order - b.order);
    if (n.length) return n;
    const groups = {}; PRODUCTS.forEach((p) => (groups[p.sub] = groups[p.sub] || []).push(p));
    const lists = Object.values(groups), out = [];
    for (let k = 0; out.length < PRODUCTS.length; k++) lists.forEach((l) => { if (l[k]) out.push(l[k]); });
    return out;
  }

  /* ---------- Carrito (persistente) ---------- */
  const CART_KEY = "flowers.cart.v2";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
  cart = cart.filter((i) => byId(i.id));
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* sin almacenamiento */ } updateCartBadge(); };
  const cartCount = () => cart.reduce((n, i) => n + i.qty, 0);
  const cartSubtotal = () => cart.reduce((n, i) => n + unitPrice(i) * i.qty, 0);
  const lineKey = (i) => [i.id, i.size || "", i.color || "", i.capacity || ""].join("|");
  function updateCartBadge(bump) {
    const n = cartCount();
    const el = $("#cartCount");
    el.textContent = n;
    el.hidden = n === 0;
    $("#cartLink").setAttribute("aria-label", `Carrito, ${plural(n, "artículo", "artículos")}`);
    if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  }
  function addToCart(item) {
    const k = lineKey(item);
    const ex = cart.find((i) => lineKey(i) === k);
    if (ex) ex.qty = Math.min(20, ex.qty + item.qty); else cart.push(item);
    saveCart(); updateCartBadge(true);
  }
  const variantText = (i) => [i.color, i.size && `Talla ${i.size}`, i.capacity].filter(Boolean).join(" · ");

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- Plantillas compartidas ---------- */
  function card(p) {
    const swatches = p.colors.map((c) => `<span class="sw" style="background:${hex(c)}" title="${esc(c)}"></span>`).join("");
    const photo = imagesFor(p).length > 0;
    return `<a class="p-card" href="#/producto/${p.id}">
      <div class="p-media ${photo ? "" : "no-photo"}">
        <img src="${productImage(p)}" alt="${esc(photo ? (p.imageAlt || p.name) : `${p.name} (imagen próximamente)`)}" width="400" height="500" loading="lazy" decoding="async">
        ${p.isNew ? '<span class="badge">Nuevo</span>' : ""}${!p.available ? `<span class="badge out">${p.unconfirmed ? "Próximamente" : "Agotado"}</span>` : ""}
      </div>
      <div class="p-info">
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-meta">${esc(p.subName)}</div>
        <div class="p-price">${priceLabel(p)}</div>
        ${p.colors.length ? `<div class="swatches" role="img" aria-label="Colores: ${esc(p.colors.join(", "))}">${swatches}<span class="p-meta">${p.colors.length > 1 ? plural(p.colors.length, "color", "colores") : esc(p.colors[0])}</span></div>` : ""}
      </div>
    </a>`;
  }
  const grid = (list, cls = "") => `<div class="product-grid ${cls}">${list.map(card).join("")}</div>`;
  function crumbs(parts) {
    return `<nav class="crumbs" aria-label="Ruta de navegación"><ol>${parts.map((p, i) => i === parts.length - 1 ? `<li><span aria-current="page">${esc(p[0])}</span></li>` : `<li><a href="${p[1]}">${esc(p[0])}</a></li>`).join("")}</ol></nav>`;
  }
  const catImage = (id) => CFG.categoryImages[id] || Art.scene(id);

  /* ---------- Cabecera, menús y pie ---------- */
  const MENU_GROUPS = {
    ropa: [{ title: "Parte superior", subs: ["polos", "poleras", "casacas"] }, { title: "Parte inferior", subs: ["pantalones", "shorts"] }],
    calzado: [{ title: "Calzado", subs: ["zapatillas", "crocs"] }],
    accesorios: [{ title: "Complementos", subs: ["gorros", "medias"] }, { title: "Para llevar", subs: ["bolsos", "llaveros"] }],
    tecnologia: [{ title: "Tecnología", subs: ["baterias"] }]
  };
  function buildHeader() {
    $("#announce").innerHTML = `<b>●</b> ${esc(CFG.announcement)}`;
    const mega = (c) => {
      const groups = MENU_GROUPS[c.id].map((g) => ({ ...g, subs: g.subs.filter(hasProducts) })).filter((g) => g.subs.length);
      return `<div class="mega"><div class="mega-inner" style="--cols:${groups.length}">
        ${groups.map((g) => `<div class="mega-col"><h3>${esc(g.title)}</h3><ul>
          ${g.subs.map((s) => `<li><a href="#/${c.id}/${s}">${esc(SUBS[s].name)}</a></li>`).join("")}
          <li class="see-all"><a href="#/${c.id}">Ver todo ${esc(c.name)}</a></li></ul></div>`).join("")}
        <a class="mega-promo" href="#/${c.id}"><img src="${catImage(c.id)}" alt="" loading="lazy"><span>${esc(c.name)}</span></a>
      </div></div>`;
    };
    $("#mainNav").innerHTML = `<div class="nav-item"><a class="nav-link accent" href="#/novedades" data-nav="novedades">Novedades</a></div>` +
      VCATS.map((c) => `<div class="nav-item"><a class="nav-link" href="#/${c.id}" data-nav="${c.id}" aria-haspopup="true">${esc(c.name)}</a>${mega(c)}</div>`).join("");

    $("#mobileNav").innerHTML = `<div class="mn-head"><a href="#/" aria-label="Inicio"><img src="assets/logo.png" alt="Flowers Streetwear"></a>
        <button class="icon-btn" id="menuClose" aria-label="Cerrar menú"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
      <ul class="mn-list">
        <li><a class="mn-row" href="#/novedades">Novedades</a></li>
        ${VCATS.map((c) => `<li><button class="mn-acc" aria-expanded="false" aria-controls="mn-${c.id}">${esc(c.name)}</button>
          <div class="mn-sub" id="mn-${c.id}" hidden><a class="all" href="#/${c.id}">Ver todo ${esc(c.name)}</a>
          ${c.subs.map((s) => `<a href="#/${c.id}/${s.id}">${esc(s.name)}</a>`).join("")}</div></li>`).join("")}
      </ul>
      <div class="mn-foot"><a class="btn btn-ghost" id="mnAccount" href="#/cuenta">Mi cuenta</a><a class="btn btn-primary" href="#/carrito">Ver carrito</a><a class="btn btn-ghost" href="${CFG.instagramUrl}" target="_blank" rel="noopener">Instagram</a></div>`;
  }
  function buildFooter() {
    $("#footer").innerHTML = `<div class="wrap">
      <div class="footer-top">
        <div class="footer-sub"><h2>Entérate primero</h2><p>Recibe novedades y nuevos drops de Flowers en tu correo.</p>
          <form class="news-form" id="newsForm" novalidate><label class="sr-only" for="newsEmail">Correo electrónico</label>
            <input id="newsEmail" type="email" placeholder="tucorreo@ejemplo.com" autocomplete="email" required>
            <button class="btn btn-primary" type="submit">Suscribirme</button></form>
          <div class="form-msg" id="newsMsg" role="status" aria-live="polite"></div>
          <p class="form-note"><span class="demo-flag">Pendiente</span> Conexión con servicio de correo por configurar.</p></div>
        <div class="footer-cols">
          <div><h3>Tienda</h3><ul><li><a href="#/novedades">Novedades</a></li>${VCATS.map((c) => `<li><a href="#/${c.id}">${esc(c.name)}</a></li>`).join("")}</ul></div>
          <div><h3>Ayuda</h3><ul><li><a href="#/info/contacto">Contacto</a></li><li><a href="#/info/faq">Preguntas frecuentes</a></li><li><a href="#/info/envios">Envíos y cambios</a></li><li><a href="#/info/tallas">Guía de tallas</a></li><li><a href="#/info/privacidad">Privacidad y términos</a></li></ul></div>
          <div><h3>Comunidad</h3><ul><li><a href="${CFG.instagramUrl}" target="_blank" rel="noopener">Instagram ${esc(CFG.instagramHandle)}</a></li></ul></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} Flowers Streetwear</span>
        <span>Síguenos en <a href="${CFG.instagramUrl}" target="_blank" rel="noopener">${esc(CFG.instagramHandle)}</a></span></div></div>`;
    $("#newsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#newsEmail"), msg = $("#newsMsg");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) { msg.className = "form-msg err"; msg.textContent = "Escribe un correo válido."; input.focus(); return; }
      msg.className = "form-msg ok";
      msg.textContent = CFG.newsletter.connected ? "¡Gracias por suscribirte!" : "Demostración: la suscripción aún no está conectada, por lo que tu correo no se guardó.";
      /* CONEXIÓN PENDIENTE: enviar input.value al servicio de correo (Mailchimp, Brevo, etc.). */
    });
  }

  /* Menú móvil y búsqueda */
  const mobileNav = $("#mobileNav"), scrim = $("#scrim");
  let scrimOwner = null;
  function openScrim(owner) { scrimOwner = owner; scrim.hidden = false; document.body.style.overflow = "hidden"; }
  function closeScrim() { scrimOwner = null; scrim.hidden = true; document.body.style.overflow = ""; }
  function openMobileNav() { mobileNav.hidden = false; openScrim("nav"); $("#menuToggle").setAttribute("aria-expanded", "true"); $("#menuClose").focus(); }
  function closeMobileNav() { if (mobileNav.hidden) return; mobileNav.hidden = true; if (scrimOwner === "nav") closeScrim(); $("#menuToggle").setAttribute("aria-expanded", "false"); }
  function toggleSearch(force) {
    const bar = $("#searchBar"), open = force ?? bar.hidden;
    bar.hidden = !open; $("#searchToggle").setAttribute("aria-expanded", String(open));
    if (open) $("#searchInput").focus();
  }

  /* ---------- Enrutador ---------- */
  const main = $("#main");
  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const q = {};
    new URLSearchParams(qs || "").forEach((v, k) => { q[k] = v; });
    return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), q };
  }
  function setTitle(t) { document.title = t ? `${t} · Flowers Streetwear` : "Flowers Streetwear · Tienda online"; }
  function view(html, title) {
    main.innerHTML = html;
    main.classList.remove("view-enter"); void main.offsetWidth; main.classList.add("view-enter");
    setTitle(title);
    observeReveal();
  }
  function route() {
    closeMobileNav(); closeMini(); closeFilters(); closeLightbox(); clearPoll();
    if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
    const { parts, q } = parseHash();
    const [a, b] = parts;
    $$(".nav-link").forEach((l) => l.classList.toggle("active", l.dataset.nav === (a === "producto" && byId(b) ? byId(b).cat : a)));
    if (!a) renderHome();
    else if (a === "novedades") renderCatalog({ key: "novedades", title: "Novedades", lead: "Lo último que llegó a Flowers.", list: isNewList(), crumbs: [["Inicio", "#/"], ["Novedades"]], filters: ["cat", "brand", "size", "color", "price", "availability"], q });
    else if (a === "catalogo") renderCatalog({ key: "catalogo", title: "Todo el catálogo", lead: "Explora todas las categorías.", list: PRODUCTS, crumbs: [["Inicio", "#/"], ["Catálogo"]], filters: ["cat", "brand", "size", "color", "price", "availability"], q });
    else if (a === "buscar") renderSearch(q);
    else if (a === "carrito") renderCart();
    else if (a === "cuenta") renderAccount(b, parts[2]);
    else if (a === "verificar") renderVerify(q);
    else if (a === "recuperar") renderForgot();
    else if (a === "restablecer") renderReset(q);
    else if (a === "pedido" && b) renderOrderStatus(b, q);
    else if (a === "checkout") renderCheckout();
    else if (a === "info" && PAGES[b]) renderInfo(b);
    else if (a === "producto" && byId(b)) renderProduct(byId(b));
    else if (visCat(a) && !b) renderCategory(visCat(a), q);
    else if (visCat(a) && SUBS[b] && SUBS[b].cat.id === a && hasProducts(b)) renderSub(SUBS[b], q);
    else renderNotFound();
    window.scrollTo({ top: 0, behavior: "instant" });
    main.focus({ preventScroll: true });
  }

  /* ---------- Reveal ---------- */
  let io;
  function observeReveal() {
    const els = $$(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) return els.forEach((e) => e.classList.add("in"));
    io = io || new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- Inicio ---------- */
  function renderHome() {
    const drop = isNewList().slice(0, 8);
    const flagged = PRODUCTS.filter((p) => p.selection);
    const sel = (flagged.length ? flagged : isNewList()).slice(0, 8);
    const street = CFG.streetImages;
    view(`
    <section class="hero" aria-labelledby="heroTitle">
      <div class="hero-media"><img src="${CFG.heroImage || Art.scene("hero")}" alt="" fetchpriority="high"></div>
      <div class="hero-shade"></div><div class="hero-slash" aria-hidden="true"></div>
      <div class="wrap hero-inner"><div class="hero-copy">
        <span class="eyebrow">Nuevo drop</span>
        <h1 id="heroTitle">Florece <em>a tu</em> manera</h1>
        <p>Streetwear con actitud urbana para quienes crean su propio estilo.</p>
        <div class="hero-cta"><a class="btn btn-light" href="#/catalogo">Comprar ahora</a><a class="btn btn-outline-light" href="#/novedades">Ver novedades</a></div>
      </div></div>
      ${CFG.heroImage ? "" : '<span class="hero-tag">Imagen de muestra</span>'}
    </section>

    <section class="section"><div class="wrap">
      <div class="section-head reveal"><div><span class="eyebrow">Explora</span><h2>Compra por categoría</h2></div></div>
      <div class="cat-grid" style="--n:${VCATS.length}">${VCATS.map((c) => `<a class="cat-card reveal" href="#/${c.id}"><img src="${catImage(c.id)}" alt="" loading="lazy">
        <div class="cat-card-body"><h3>${esc(c.name)}</h3><p>${esc(c.tagline)}</p><span class="pill">Explorar</span></div></a>`).join("")}</div>
    </div></section>

    <section class="section" style="padding-top:0"><div class="wrap">
      <div class="section-head reveal"><div><span class="eyebrow">Recién llegado</span><h2>El nuevo drop</h2></div><a class="link-arrow" href="#/novedades">Ver todas las novedades</a></div>
      <div class="reveal">${grid(drop)}</div>
    </div></section>

    <section class="editorial"><div class="wrap editorial-grid">
      <div class="editorial-copy reveal"><span class="eyebrow" style="color:#fff">Flowers</span><h2>Tu estilo.<span>Tus reglas.</span></h2>
        <p>Mezcla prendas, calzado y accesorios a tu manera. Aquí no hay uniforme: hay actitud.</p>
        <a class="btn btn-light" href="#/catalogo">Explorar catálogo</a></div>
      <div class="editorial-media reveal"><img src="${CFG.editorialImage || Art.scene("editorial")}" alt="" loading="lazy"><span class="editorial-chip a">Ropa</span><span class="editorial-chip b">Accesorios</span></div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="section-head reveal"><div><span class="eyebrow">Elegidos por Flowers</span><h2>Selección Flowers</h2></div><a class="link-arrow" href="#/catalogo">Ver todo el catálogo</a></div>
      <div class="reveal">${grid(sel)}</div>
    </div></section>

    <section class="section" style="background:var(--bg-soft)"><div class="wrap">
      <div class="section-head reveal"><div><span class="eyebrow">Comunidad</span><h2>Flowers en la calle</h2></div></div>
      <div class="street-grid reveal">${Array.from({ length: 6 }, (_, i) => street[i]
        ? `<div class="street-tile"><img src="${esc(street[i])}" alt="Outfit de la comunidad Flowers ${i + 1}" loading="lazy"></div>`
        : `<div class="street-tile"><span>Espacio para foto de outfit</span></div>`).join("")}</div>
      <div class="street-cta reveal"><p>Etiquétanos y comparte tu outfit con ${esc(CFG.instagramHandle)}.</p>
        <a class="btn btn-primary" href="${CFG.instagramUrl}" target="_blank" rel="noopener">Síguenos en Instagram</a></div>
    </div></section>`, "");
  }

  /* ---------- Catálogo ---------- */
  function renderCategory(c, q) {
    renderCatalog({ key: c.id, title: c.name, lead: c.tagline, list: PRODUCTS.filter((p) => p.cat === c.id), crumbs: [["Inicio", "#/"], [c.name]],
      filters: c.id === "accesorios" ? ["type", "brand", "color", "price", "availability", "size"] : c.filters, typeSubs: c.subs, chips: { cat: c, active: null }, q });
  }
  function renderSub(s, q) {
    renderCatalog({ key: s.id, title: s.name, lead: s.cat.tagline, list: PRODUCTS.filter((p) => p.sub === s.id),
      crumbs: [["Inicio", "#/"], [s.cat.name, `#/${s.cat.id}`], [s.name]], filters: s.cat.filters.filter((f) => f !== "type"), chips: { cat: visCat(s.cat.id), active: s.id }, q });
  }
  function renderSearch(q) {
    const term = (q.q || "").trim();
    $("#searchInput").value = term;
    const words = norm(term).split(/\s+/).filter(Boolean);
    const list = words.length ? PRODUCTS.filter((p) => { const hay = norm([p.name, p.catName, p.subName, p.colors.join(" "), p.brands.join(" "), p.description].join(" ")); return words.every((w) => hay.includes(w)); }) : [];
    renderCatalog({ key: "buscar", title: term ? `Resultados para «${term}»` : "Buscar", lead: term ? "" : "Escribe en la barra de búsqueda para encontrar productos por nombre o categoría.", list,
      crumbs: [["Inicio", "#/"], ["Búsqueda"]], filters: ["cat", "brand", "size", "color", "price", "availability"], q, search: term });
  }

  let CS = null; // estado del catálogo vigente
  function renderCatalog(o) {
    const L = o.list;
    CS = { o, st: { sort: o.q.sort || "nuevos", min: o.q.min || "", max: o.q.max || "", av: o.q.av === "1",
      size: (o.q.size || "").split(",").filter(Boolean), color: (o.q.color || "").split(",").filter(Boolean),
      brand: (o.q.brand || "").split(",").filter(Boolean), type: (o.q.type || "").split(",").filter(Boolean), cap: (o.q.cap || "").split(",").filter(Boolean) } };
    const has = (k) => o.filters.includes(k);
    const sizes = uniq(L.flatMap((p) => p.sizes)).sort(sortSizes);
    const colors = uniq(L.flatMap((p) => p.colors));
    const caps = uniq(L.flatMap((p) => p.capacities)).sort((a, b) => parseFloat(a) - parseFloat(b));
    const prices = L.flatMap((p) => [p.price, p.maxPrice]);
    const colorShare = L.length ? L.filter((p) => p.colors.length).length / L.length : 0;
    const lo = prices.length ? Math.floor(Math.min(...prices)) : 0, hi = prices.length ? Math.ceil(Math.max(...prices)) : 0;
    const typeOpts = o.typeSubs ? o.typeSubs.map((s) => [s.id, s.name]) : uniq(L.map((p) => p.cat)).map((id) => [id, catById(id).name]);
    const chips = (name, vals, labelFn) => `<div class="f-opts">${vals.map((v) => `<label class="f-opt"><input type="checkbox" name="${name}" value="${esc(v)}"><span>${labelFn ? labelFn(v) : esc(v)}</span></label>`).join("")}</div>`;

    let fp = "";
    if ((has("type") || has("cat")) && typeOpts.length > 1) fp += `<fieldset class="f-group"><legend>${o.typeSubs ? "Tipo" : "Categoría"}</legend><div class="f-list">${typeOpts.map(([id, n]) => `<label class="f-check"><input type="checkbox" name="type" value="${id}"> ${esc(n)}</label>`).join("")}</div></fieldset>`;
    const brands = uniq(L.flatMap((p) => p.brands)).sort((a, b) => a.localeCompare(b, "es"));
    if (has("brand") && brands.length) fp += `<fieldset class="f-group"><legend>Marca</legend><div class="f-list ${brands.length > 8 ? "scroll" : ""}">${brands.map((b) => `<label class="f-check"><input type="checkbox" name="brand" value="${esc(b)}"> ${esc(b)}</label>`).join("")}</div></fieldset>`;
    if (has("size") && sizes.length) fp += `<fieldset class="f-group"><legend>${o.key === "calzado" || o.key === "zapatillas" || o.key === "crocs" ? "Talla de calzado" : "Talla"}</legend>${chips("size", sizes)}</fieldset>`;
    if (has("capacity") && caps.length) fp += `<fieldset class="f-group"><legend>Capacidad</legend>${chips("cap", caps)}</fieldset>`;
    if (has("color") && colors.length && colorShare >= 0.5) fp += `<fieldset class="f-group"><legend>Color</legend>${chips("color", colors, (v) => `<i class="sw" style="background:${hex(v)}"></i>${esc(v)}`)}</fieldset>`;
    if (has("price") && L.length) fp += `<fieldset class="f-group"><legend>Precio (${CFG.currency})</legend><div class="price-row"><label>Mínimo<input type="number" name="min" min="0" inputmode="decimal" placeholder="${lo}"></label><label>Máximo<input type="number" name="max" min="0" inputmode="decimal" placeholder="${hi}"></label></div></fieldset>`;
    if (has("availability")) fp += `<fieldset class="f-group"><legend>Disponibilidad</legend><label class="f-check"><input type="checkbox" name="av" value="1"> Solo productos disponibles</label></fieldset>`;

    const subChips = o.chips ? `<div class="sub-chips" aria-label="Subcategorías"><a class="chip ${o.chips.active ? "" : "active"}" href="#/${o.chips.cat.id}" ${o.chips.active ? "" : 'aria-current="page"'}>Todo ${esc(o.chips.cat.name)}</a>
      ${o.chips.cat.subs.map((s) => `<a class="chip ${o.chips.active === s.id ? "active" : ""}" href="#/${o.chips.cat.id}/${s.id}" ${o.chips.active === s.id ? 'aria-current="page"' : ""}>${esc(s.name)}</a>`).join("")}</div>` : "";

    view(`<section class="page-head"><div class="wrap">${crumbs(o.crumbs)}<h1>${esc(o.title)}</h1>${o.lead ? `<p>${esc(o.lead)}</p>` : ""}${subChips}</div></section>
      <div class="wrap catalog">
        <aside class="filters" id="filters" aria-label="Filtros" ${fp ? "" : "hidden"}>
          <div class="filters-head"><h2>Filtros</h2><button type="button" class="icon-btn filters-close" id="filtersClose" aria-label="Cerrar filtros"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
          <form id="filterForm">${fp}</form>
          <div class="filters-foot"><button type="button" class="btn btn-ghost" id="filtersClear">Limpiar</button><button type="button" class="btn btn-primary" id="filtersApply">Ver resultados</button></div>
        </aside>
        <section aria-label="Productos"><div id="results"></div></section>
      </div>`, o.title);

    const form = $("#filterForm");
    if (form) {
      const st = CS.st;
      $$("input", form).forEach((i) => {
        if (i.type === "checkbox") i.checked = i.name === "av" ? st.av : (st[i.name] || []).includes(i.value);
        else i.value = st[i.name] || "";
      });
      form.addEventListener("submit", (e) => e.preventDefault());
      form.addEventListener("input", () => { readForm(); applyCatalog(); });
    }
    $("#filtersClose").addEventListener("click", closeFilters);
    $("#filtersApply").addEventListener("click", closeFilters);
    $("#filtersClear").addEventListener("click", () => { clearFilters(); });
    applyCatalog(true);
  }
  function readForm() {
    const f = $("#filterForm"), st = CS.st;
    const vals = (n) => $$(`input[name="${n}"]:checked`, f).map((i) => i.value);
    st.size = vals("size"); st.brand = vals("brand"); st.color = vals("color"); st.type = vals("type"); st.cap = vals("cap");
    const av = $('input[name="av"]', f); st.av = av ? av.checked : false;
    const mn = $('input[name="min"]', f), mx = $('input[name="max"]', f);
    st.min = mn ? mn.value : ""; st.max = mx ? mx.value : "";
  }
  function clearFilters() {
    Object.assign(CS.st, { size: [], brand: [], color: [], type: [], cap: [], min: "", max: "", av: false });
    const f = $("#filterForm");
    if (f) $$("input", f).forEach((i) => { if (i.type === "checkbox") i.checked = false; else i.value = ""; });
    applyCatalog();
  }
  function filterList(L, st) {
    const min = st.min !== "" ? parseFloat(st.min) : null, max = st.max !== "" ? parseFloat(st.max) : null;
    return L.filter((p) => {
      if (st.type.length && !st.type.includes(CS.o.typeSubs ? p.sub : p.cat)) return false;
      if (st.brand.length && !p.brands.some((b) => st.brand.some((s) => norm(s) === norm(b)))) return false;
      if (st.size.length && !p.sizes.some((s) => st.size.includes(s))) return false;
      if (st.color.length && !p.colors.some((c) => st.color.includes(c))) return false;
      if (st.cap.length && !p.capacities.some((c) => st.cap.includes(c))) return false;
      if (min !== null && p.maxPrice < min) return false;
      if (max !== null && p.price > max) return false;
      if (st.av && !p.available) return false;
      return true;
    });
  }
  function sortList(L, how) {
    const a = L.slice();
    if (how === "precio-asc") a.sort((x, y) => x.price - y.price);
    else if (how === "precio-desc") a.sort((x, y) => y.price - x.price);
    else a.sort((x, y) => (Number(!!y.isNew) - Number(!!x.isNew)) || x.order - y.order);
    return a;
  }
  function applyCatalog(first) {
    const { o, st } = CS;
    const res = sortList(filterList(o.list, st), st.sort);
    const tags = [];
    st.type.forEach((v) => tags.push(["type", v, (SUBS[v] ? SUBS[v].name : (catById(v) || {}).name) || v]));
    st.brand.forEach((v) => tags.push(["brand", v, v]));
    st.size.forEach((v) => tags.push(["size", v, `Talla ${v}`]));
    st.cap.forEach((v) => tags.push(["cap", v, v]));
    st.color.forEach((v) => tags.push(["color", v, v]));
    if (st.min !== "") tags.push(["min", "", `Desde ${CFG.currency} ${st.min}`]);
    if (st.max !== "") tags.push(["max", "", `Hasta ${CFG.currency} ${st.max}`]);
    if (st.av) tags.push(["av", "", "Solo disponibles"]);
    const nFilters = tags.length;

    let body;
    if (!o.list.length && o.key === "buscar" && !o.search) body = `<div class="empty"><h2>¿Qué estás buscando?</h2><p>Escribe el nombre o la categoría de un producto en la barra de búsqueda.</p><a class="btn btn-primary" href="#/catalogo">Ver todo el catálogo</a></div>`;
    else if (!o.list.length) body = `<div class="empty"><h2>Sin resultados</h2><p>No encontramos productos para «${esc(o.search || o.title)}». Revisa la ortografía o prueba con otra palabra.</p><a class="btn btn-primary" href="#/catalogo">Ver todo el catálogo</a></div>`;
    else if (!res.length) body = `<div class="empty"><h2>Sin resultados con estos filtros</h2><p>Prueba quitando algún filtro para ver más productos.</p><button class="btn btn-primary" id="emptyClear" type="button">Limpiar filtros</button></div>`;
    else body = grid(res, "three");

    const showTools = o.list.length > 0;
    $("#results").innerHTML = `${showTools ? `<div class="toolbar"><div class="count" id="count" aria-live="polite">${plural(res.length, "producto", "productos")}</div>
      <div class="toolbar-r"><button type="button" class="btn btn-ghost filter-toggle" id="filterToggle" aria-controls="filters">Filtros${nFilters ? ` (${nFilters})` : ""}</button>
      <label class="sr-only" for="sortSel">Ordenar por</label><select class="select" id="sortSel">
        <option value="nuevos">Ordenar: Novedades</option><option value="precio-asc">Precio: menor a mayor</option><option value="precio-desc">Precio: mayor a menor</option></select></div></div>` : ""}
      ${nFilters ? `<div class="active-filters">${tags.map((t, i) => `<button class="tag-x" data-i="${i}" type="button" aria-label="Quitar filtro ${esc(t[2])}">${esc(t[2])} <span aria-hidden="true">✕</span></button>`).join("")}<button class="tag-x" id="tagsClear" type="button">Limpiar todo</button></div>` : ""}
      ${body}`;
    const sel = $("#sortSel"); if (sel) { sel.value = st.sort; sel.addEventListener("change", () => { st.sort = sel.value; applyCatalog(); sel.focus(); }); }
    const ft = $("#filterToggle"); if (ft) ft.addEventListener("click", openFilters);
    const ec = $("#emptyClear"); if (ec) ec.addEventListener("click", clearFilters);
    const tc = $("#tagsClear"); if (tc) tc.addEventListener("click", clearFilters);
    $$(".tag-x[data-i]").forEach((b) => b.addEventListener("click", () => {
      const [k, v] = tags[b.dataset.i];
      if (k === "min" || k === "max") st[k] = ""; else if (k === "av") st.av = false; else st[k] = st[k].filter((x) => x !== v);
      syncForm(); applyCatalog();
    }));
    const apply = $("#filtersApply"); if (apply) apply.textContent = `Ver ${plural(res.length, "resultado", "resultados")}`;
    if (first) observeReveal();
    /* Mantener la URL con los filtros activos */
    const qs = new URLSearchParams();
    if (st.sort !== "nuevos") qs.set("sort", st.sort);
    ["brand", "size", "color", "type", "cap"].forEach((k) => st[k].length && qs.set(k, st[k].join(",")));
    if (st.min !== "") qs.set("min", st.min); if (st.max !== "") qs.set("max", st.max); if (st.av) qs.set("av", "1");
    if (o.search) qs.set("q", o.search);
    const base = location.hash.split("?")[0] || "#/";
    history.replaceState(null, "", base + (qs.toString() ? "?" + qs : ""));
  }
  function syncForm() {
    const f = $("#filterForm"); if (!f) return; const st = CS.st;
    $$("input", f).forEach((i) => { if (i.type === "checkbox") i.checked = i.name === "av" ? st.av : (st[i.name] || []).includes(i.value); else i.value = st[i.name] || ""; });
  }
  function openFilters() { const f = $("#filters"); if (!f) return; f.classList.add("open"); openScrim("filters"); $("#filtersClose").focus(); }
  function closeFilters() { const f = $("#filters"); if (f) f.classList.remove("open"); if (scrimOwner === "filters") closeScrim(); }

  /* ---------- Ficha de producto ---------- */
  const sizeGuideHtml = () => `<p class="pending">La guía de tallas está pendiente de completar por Flowers. Las tallas mostradas son las indicadas en el inventario.</p>`;
  function renderProduct(p) {
    const sub = SUBS[p.sub], cat = sub.cat;
    const groups = [];
    if (p.colors.length) groups.push({ key: "color", label: "Color", opts: p.colors, sw: true });
    if (p.sizes.length) groups.push({ key: "size", label: cat.sizeType === "calzado" ? "Talla de calzado" : "Talla", opts: p.sizes, guide: ["ropa", "calzado"].includes(cat.sizeType) });
    const related = [...PRODUCTS.filter((x) => x.sub === p.sub && x.id !== p.id), ...PRODUCTS.filter((x) => x.cat === p.cat && x.sub !== p.sub)].slice(0, 4);
    const sel = {};
    if (p.colors.length === 1) sel.color = p.colors[0];
    if (p.sizes.length === 1) sel.size = p.sizes[0];
    const maxQty = p.stock || 10;
    const stockText = !p.available ? (p.unconfirmed ? "Consultar disponibilidad" : "Agotado") : p.stock ? (p.stock === 1 ? "1 unidad disponible" : `${p.stock} unidades disponibles`) : "Disponible";
    const alt = (n) => `${p.imageAlt || p.name}${n ? `, foto ${n}` : ""}`;

    view(`<div class="wrap"><div style="padding-top:20px">${crumbs([["Inicio", "#/"], [cat.name, `#/${cat.id}`], [sub.name, `#/${cat.id}/${sub.id}`], [p.name]])}</div>
      <div class="pdp">
        <div class="gallery"><div class="thumbs" id="thumbs"></div>
          <button class="g-main" id="gMain" type="button"><img id="gImg" alt="" width="400" height="500"><span class="g-zoom" id="gZoom" aria-hidden="true">Ampliar</span>${p.isNew ? '<span class="badge">Nuevo</span>' : ""}</button></div>
        <div class="pdp-info">
          <span class="eyebrow">${esc(sub.name)}</span>
          <h1>${esc(p.name)}</h1>
          <div class="pdp-price" id="pdpPrice">${priceLabel(p)}</div>
          <div class="stock ${p.available ? "" : "out"}">${stockText}</div>
          ${p.description ? `<p>${esc(p.description)}</p>` : ""}
          <form id="buyForm" novalidate>
            ${groups.map((g) => `<fieldset class="var-block" data-key="${g.key}"><div class="var-label"><span>${g.label}<span class="chosen" data-chosen></span></span>${g.guide ? '<button type="button" data-guide>Guía de tallas</button>' : ""}</div>
              <div class="var-opts">${g.opts.map((o) => `<label class="var-opt"><input type="radio" name="${g.key}" value="${esc(o)}" ${!p.available ? "disabled" : ""} ${sel[g.key] === o ? "checked" : ""}><span>${g.sw ? `<i class="sw" style="background:${hex(o)}"></i>` : ""}${esc(o)}</span></label>`).join("")}</div>
              <div class="var-error" role="alert"></div></fieldset>`).join("")}
            <div class="buy-row"><div class="qty"><button type="button" id="qMinus" aria-label="Quitar uno">−</button><input id="qty" type="number" min="1" max="${maxQty}" value="1" aria-label="Cantidad"><button type="button" id="qPlus" aria-label="Agregar uno">+</button></div>
              <button class="btn btn-primary" type="submit" ${p.available ? "" : "disabled"}>${p.available ? "Agregar al carrito" : (p.unconfirmed ? "No disponible por ahora" : "Agotado")}</button></div>
          </form>
          ${SRV.whatsapp ? `<a class="btn btn-ghost btn-block wa-btn" id="waBtn" target="_blank" rel="noopener" href="${esc(waLink("Hola, quiero consultar por " + p.name + ". " + location.origin + "/#/producto/" + p.id))}">Consultar por WhatsApp</a>` : ""}
          <div class="acc">
            <details open><summary>Detalles</summary><div class="acc-body"><ul>
              <li>Categoría: ${esc(cat.name)} · ${esc(sub.name)}</li>
              ${p.brands.length ? `<li>Marca: ${esc(p.brands.join(" x "))}</li>` : ""}
              ${p.colors.length ? `<li>Colores: ${esc(p.colors.join(", "))}</li>` : ""}
              ${p.sizes.length ? `<li>Tallas según inventario: ${esc(p.sizes.join(" · "))}</li>` : ""}
              ${(p.details || []).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
              <p class="pending" style="margin-top:12px">Descripción y especificaciones pendientes de completar por Flowers.</p></div></details>
            <details><summary>Cuidados</summary><div class="acc-body"><p class="pending">Información pendiente de completar por Flowers.</p></div></details>
            <details><summary>Envíos y cambios</summary><div class="acc-body"><p class="pending">Plazos, costos y condiciones pendientes de completar. <a href="#/info/envios" style="text-decoration:underline">Ver página de envíos y cambios</a>.</p></div></details>
            ${groups.some((g) => g.guide) ? `<details id="guideAcc"><summary>Guía de tallas</summary><div class="acc-body">${sizeGuideHtml()}</div></details>` : ""}
          </div>
        </div>
      </div>
      <section class="section" style="padding-top:24px"><div class="section-head"><h2>Productos relacionados</h2></div>${grid(related)}</section></div>`, p.name);

    /* Galería: fotos reales (por color si existen) o aviso «Imagen próximamente». */
    let gi = 0, imgs = [];
    const gMain = $("#gMain");
    const paint = () => {
      const real = imagesFor(p, sel.color);
      imgs = real.length ? real : [Art.placeholder()];
      gi = Math.min(gi, imgs.length - 1);
      $("#gImg").src = imgs[gi]; $("#gImg").alt = real.length ? alt(imgs.length > 1 ? gi + 1 : 0) : `${p.name} (imagen próximamente)`;
      gMain.classList.toggle("no-photo", !real.length);
      gMain.disabled = !real.length; $("#gZoom").hidden = !real.length;
      gMain.setAttribute("aria-label", real.length ? "Ampliar foto" : "Imagen próximamente");
      $("#thumbs").innerHTML = imgs.length > 1 ? imgs.map((s, i) => `<button class="thumb" type="button" aria-label="Ver foto ${i + 1}" ${i === gi ? 'aria-current="true"' : ""} data-i="${i}"><img src="${s}" alt="" loading="lazy"></button>`).join("") : "";
      $$(".thumb").forEach((b) => b.addEventListener("click", () => { gi = +b.dataset.i; paint(); }));
    };
    paint();
    gMain.addEventListener("click", () => { if (!gMain.disabled) openLightbox(imgs, gi, p.name, (i) => { gi = i; paint(); }); });

    /* Variantes: las combinaciones sin talla/color disponible se desactivan; el precio sigue al color. */
    const form = $("#buyForm");
    const showChosen = () => groups.forEach((g) => { const el = $(`[data-key="${g.key}"] [data-chosen]`); if (el) el.textContent = sel[g.key] ? `: ${sel[g.key]}` : ""; });
    const refresh = () => {
      const sizeOut = (size) => { const vs = sel.color ? [variantOf(p, sel.color)] : p.variants; return vs.every((v) => !v.sizes.includes(size) || (v.soldOut || []).includes(size)); };
      $$("input[name=size]", form).forEach((i) => { i.disabled = !p.available || sizeOut(i.value); if (i.disabled && i.checked) { i.checked = false; sel.size = ""; } });
      $("#pdpPrice").textContent = sel.color ? money(variantOf(p, sel.color).price) : priceLabel(p);
      showChosen();
    };
    refresh();
    form.addEventListener("change", (e) => {
      if (e.target.type !== "radio") return;
      sel[e.target.name] = e.target.value;
      $(`[data-key="${e.target.name}"] .var-error`).textContent = "";
      refresh();
      if (e.target.name === "color") {
        if (sel.size && !variantOf(p, sel.color).sizes.includes(sel.size)) { sel.size = ""; $$("input[name=size]", form).forEach((i) => { i.checked = false; }); showChosen(); }
        gi = 0; paint();
      }
    });
    const wb = $("#waBtn"); if (wb) wb.addEventListener("click", () => { wb.href = waLink(`Hola, quiero consultar por ${p.name}${[sel.color, sel.size && "talla " + sel.size].filter(Boolean).length ? " (" + [sel.color, sel.size && "talla " + sel.size].filter(Boolean).join(", ") + ")" : ""}. ${location.origin}/#/producto/${p.id}`); });
    const gb = $("[data-guide]"); if (gb) gb.addEventListener("click", () => { const a = $("#guideAcc"); a.open = true; a.scrollIntoView({ behavior: "smooth", block: "center" }); });
    const qty = $("#qty"), clampQ = () => { qty.value = Math.max(1, Math.min(maxQty, parseInt(qty.value, 10) || 1)); };
    $("#qMinus").addEventListener("click", () => { qty.value = (parseInt(qty.value, 10) || 1) - 1; clampQ(); });
    $("#qPlus").addEventListener("click", () => { qty.value = (parseInt(qty.value, 10) || 1) + 1; clampQ(); });
    qty.addEventListener("change", clampQ);
    form.addEventListener("submit", (e) => {
      e.preventDefault(); clampQ();
      const missing = groups.filter((g) => !sel[g.key]);
      $$(".var-error").forEach((x) => { x.textContent = ""; });
      if (missing.length) {
        missing.forEach((g) => { $(`[data-key="${g.key}"] .var-error`).textContent = `Selecciona ${g.key === "color" ? "un color" : "una talla"} para continuar.`; });
        const first = $(`[data-key="${missing[0].key}"] input:not(:disabled)`); if (first) first.focus();
        return;
      }
      addToCart({ id: p.id, size: sel.size || "", color: sel.color || "", capacity: "", qty: parseInt(qty.value, 10) });
      openMini(`«${p.name}» se agregó a tu carrito.`);
    });
  }

  /* ---------- Lightbox ---------- */
  let lb = { imgs: [], i: 0, name: "", onChange: null, opener: null };
  function openLightbox(imgs, i, name, onChange) {
    lb = { imgs, i, name, onChange, opener: document.activeElement };
    paintLightbox(); $("#lightbox").hidden = false; document.body.style.overflow = "hidden"; $(".lb-close").focus();
  }
  function paintLightbox() {
    const multi = lb.imgs.length > 1;
    $("#lightbox").innerHTML = `<img src="${lb.imgs[lb.i]}" alt="${esc(lb.name)}, foto ampliada ${lb.i + 1} de ${lb.imgs.length}">
      <button class="lb-btn lb-close" type="button" aria-label="Cerrar">✕</button>
      ${multi ? '<button class="lb-btn lb-prev" type="button" aria-label="Foto anterior">‹</button><button class="lb-btn lb-next" type="button" aria-label="Foto siguiente">›</button>' : ""}`;
    $(".lb-close").addEventListener("click", closeLightbox);
    if (multi) { $(".lb-prev").addEventListener("click", () => stepLb(-1)); $(".lb-next").addEventListener("click", () => stepLb(1)); }
  }
  function stepLb(d) { lb.i = (lb.i + d + lb.imgs.length) % lb.imgs.length; paintLightbox(); const b = d < 0 ? $(".lb-prev") : $(".lb-next"); if (b) b.focus(); if (lb.onChange) lb.onChange(lb.i); }
  function closeLightbox() {
    const el = $("#lightbox"); if (el.hidden) return;
    el.hidden = true; el.innerHTML = ""; document.body.style.overflow = scrimOwner ? "hidden" : "";
    if (lb.opener && lb.opener.focus) lb.opener.focus();
  }
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });

  /* ---------- Carrito lateral ---------- */
  function openMini(message) {
    const m = $("#miniCart"), items = cart.slice().reverse();
    m.innerHTML = `<div class="mc-head"><h2 id="miniCartTitle">Tu carrito (${cartCount()})</h2><button class="icon-btn" id="mcClose" aria-label="Cerrar carrito"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
      ${message ? `<div class="mc-ok" role="status">✓ ${esc(message)}</div>` : ""}
      <div class="mc-body">${items.length ? items.map((i) => { const p = byId(i.id); return `<div class="mc-item"><img src="${productImage(p, i.color)}" alt="${esc(p.name)}"><div><div class="ci-name">${esc(p.name)}</div><div>${esc(variantText(i))}</div><div>Cant.: ${i.qty}</div></div><div class="ci-price">${money(unitPrice(i) * i.qty)}</div></div>`; }).join("") : "<p>Tu carrito está vacío.</p>"}</div>
      <div class="mc-foot"><div class="sum-row"><span>Subtotal</span><b>${money(cartSubtotal())}</b></div>
        <a class="btn btn-primary" href="#/checkout">Finalizar compra</a><a class="btn btn-ghost" href="#/carrito">Ver carrito</a><button class="btn btn-ghost" id="mcContinue" type="button">Seguir comprando</button></div>`;
    m.hidden = false; openScrim("mini");
    $("#mcClose").addEventListener("click", closeMini); $("#mcContinue").addEventListener("click", closeMini);
    $("#mcClose").focus();
  }
  function closeMini() { const m = $("#miniCart"); if (m.hidden) return; m.hidden = true; if (scrimOwner === "mini") closeScrim(); }

  /* ---------- Página de carrito ---------- */
  const shippingRow = () => `<div class="sum-row"><span>Envío</span><span>Se calcula al pagar</span></div>`;
  function renderCart() {
    if (!cart.length) {
      view(`<div class="wrap"><section class="info"><h1>Tu carrito</h1><div class="empty" style="margin-top:24px"><h2>Tu carrito está vacío</h2><p>Explora el catálogo y encuentra tu próxima pieza.</p><a class="btn btn-primary" href="#/catalogo">Ir a comprar</a></div></section></div>`, "Carrito");
      return;
    }
    view(`<div class="wrap"><div style="padding-top:20px">${crumbs([["Inicio", "#/"], ["Carrito"]])}<h1>Tu carrito</h1></div>
      <div class="cart-page"><section aria-label="Productos en el carrito">${cart.map((i, idx) => { const p = byId(i.id); return `<article class="cart-item">
        <a href="#/producto/${p.id}"><img src="${productImage(p, i.color)}" alt="${esc(p.name)}" width="110" height="138"></a>
        <div><a class="ci-name" href="#/producto/${p.id}">${esc(p.name)}</a><div class="ci-var">${esc(variantText(i)) || "&nbsp;"}</div>
          <div class="qty"><button type="button" data-q="-1" data-i="${idx}" aria-label="Quitar uno de ${esc(p.name)}">−</button><output aria-label="Cantidad" aria-live="polite">${i.qty}</output><button type="button" data-q="1" data-i="${idx}" aria-label="Agregar uno de ${esc(p.name)}">+</button></div>
          <button class="ci-remove" type="button" data-rm="${idx}">Eliminar</button></div>
        <div class="ci-price">${money(unitPrice(i) * i.qty)}</div></article>`; }).join("")}
        <p style="margin-top:20px"><a class="link-arrow" href="#/catalogo">← Continuar comprando</a></p></section>
        <aside class="summary" aria-label="Resumen"><h2>Resumen</h2>
          <div class="sum-row"><span>Subtotal (${plural(cartCount(), "artículo", "artículos")})</span><b>${money(cartSubtotal())}</b></div>${shippingRow()}
          <p class="sum-note">El costo de envío se calcula en el siguiente paso, según la entrega que elijas.</p>
          <a class="btn btn-primary btn-block" href="#/checkout">Finalizar compra</a></aside></div></div>`, "Carrito");
    $$("[data-q]").forEach((b) => b.addEventListener("click", () => { const it = cart[+b.dataset.i]; it.qty = Math.max(1, Math.min(20, it.qty + +b.dataset.q)); saveCart(); const y = scrollY; renderCart(); scrollTo(0, y); const nb = $(`[data-q="${b.dataset.q}"][data-i="${b.dataset.i}"]`); if (nb) nb.focus(); }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { const it = cart[+b.dataset.rm]; cart.splice(+b.dataset.rm, 1); saveCart(); renderCart(); toast(`Se eliminó «${byId(it.id).name}» del carrito.`); }));
  }

  /* ---------- Servidor: cuenta, checkout y pedidos ---------- */
  let ME = null;
  let SRV = { shipping: [], whatsapp: "", contact: {}, payments: { simulated: true }, reserveMinutes: 20, dev: false };
  async function api(path, opts = {}) {
    const o = { method: opts.method || "GET", credentials: "same-origin", headers: { "X-Flowers": "1" } };
    if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers["Content-Type"] = "application/json"; }
    try {
      const r = await fetch(path, o); let d = null;
      try { d = await r.json(); } catch (e) { /* sin cuerpo */ }
      return { ok: r.ok, status: r.status, data: d };
    } catch (e) { return { ok: false, status: 0, data: { error: "No hay conexión con el servidor. Inténtalo de nuevo." } }; }
  }
  const PAY_LABEL = { awaiting: "Pago por realizar", pending: "Pago pendiente de confirmación", paid: "Pagado", rejected: "Pago rechazado", cancelled: "Pago cancelado", expired: "Reserva vencida", refunded: "Reembolsado" };
  const FUL_LABEL = { none: "—", new: "Recibido", preparing: "En preparación", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado" };
  const fmtDate = (s) => { try { return new Date(s).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return s; } };
  const cents = (n) => money(n / 100);
  const demoBanner = () => (SRV.payments && SRV.payments.simulated ? `<div class="banner"><b>MODO DE DEMOSTRACIÓN.</b> Los pagos y los correos son simulados: no se cobra dinero real ni se envía nada por internet.</div>` : "");
  let pollTimer = null;
  const clearPoll = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };

  function waLink(text) { return SRV.whatsapp ? `https://wa.me/${SRV.whatsapp}?text=${encodeURIComponent(text)}` : ""; }
  function buildWhatsapp() {
    const old = $("#waFloat"); if (old) old.remove();
    if (!SRV.whatsapp) return;
    const a = document.createElement("a");
    a.id = "waFloat"; a.className = "wa-float"; a.target = "_blank"; a.rel = "noopener";
    a.href = waLink("Hola Flowers, tengo una consulta."); a.setAttribute("aria-label", "Consultar por WhatsApp");
    a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4.1A8 8 0 1 1 20 12z"/><path d="M9 9c.3 2.6 2.4 4.7 5 5l1.2-1.2-1.8-.9-.8.6c-.9-.4-1.6-1.100-2-2l.6-.8L10.300 7.800z"/></svg><span>Consultas</span>`;
    document.body.appendChild(a);
  }
  function updateAccountLink() {
    const l = $("#accountLink"); if (!l) return;
    l.setAttribute("aria-label", ME ? `Mi cuenta (${ME.name || ME.email})` : "Iniciar sesión o crear cuenta");
    l.classList.toggle("logged", !!ME);
    const m = $("#mnAccount"); if (m) m.textContent = ME ? "Mi cuenta" : "Iniciar sesión / Crear cuenta";
  }
  async function refreshMe() { const r = await api("/api/auth/me"); ME = r.ok && r.data ? r.data.user : null; updateAccountLink(); }

  const errBox = (id) => `<div class="form-msg err" id="${id}" role="alert"></div>`;
  const showErr = (id, msg) => { const e = $("#" + id); if (e) { e.className = "form-msg err"; e.textContent = msg; } };
  const showOk = (id, msg) => { const e = $("#" + id); if (e) { e.className = "form-msg okmsg"; e.textContent = msg; } };
  const formData = (f) => Object.fromEntries(new FormData(f).entries());

  /* ----- Cuenta ----- */
  async function renderAccount(sub, extra) {
    clearPoll();
    await refreshMe();
    if (!ME) return renderAuth();
    if (ME.role === "admin") {
      return view(`<div class="wrap"><section class="info">${crumbs([["Inicio", "#/"], ["Mi cuenta"]])}<h1>Cuenta de administrador</h1><p style="margin-top:14px">Las cuentas de administrador se gestionan desde el panel privado.</p><a class="btn btn-primary" href="/admin.html">Ir al panel</a> <button class="btn btn-ghost" id="logoutBtn" type="button">Cerrar sesión</button></section></div>`, "Mi cuenta"), bindLogout();
    }
    if (sub === "pedidos") return extra ? renderOrderStatus(extra, {}, true) : renderOrderList();
    const r = await api("/api/account");
    const addrs = r.ok ? r.data.addresses : [];
    view(`<div class="wrap"><section class="info" style="max-width:920px">${crumbs([["Inicio", "#/"], ["Mi cuenta"]])}<h1>Mi cuenta</h1>
      <p style="margin-top:12px">Hola, <b>${esc(ME.name || ME.email)}</b>. <a class="link-arrow" href="#/cuenta/pedidos">Ver mis pedidos</a></p>
      <div class="acct-grid">
        <form id="profileForm" class="checkout-form" novalidate><h2 style="font-size:1.3rem">Mis datos</h2>
          <div class="field"><label for="pfEmail">Correo</label><input id="pfEmail" value="${esc(ME.email)}" disabled></div>
          <div class="field"><label for="pfName">Nombre</label><input id="pfName" name="name" value="${esc(ME.name)}" required autocomplete="name"></div>
          <div class="field"><label for="pfPhone">Teléfono</label><input id="pfPhone" name="phone" value="${esc(ME.phone)}" type="tel" autocomplete="tel"></div>
          ${errBox("pfMsg")}<button class="btn btn-primary" type="submit">Guardar cambios</button></form>
        <div><h2 style="font-size:1.3rem;margin-bottom:12px">Mis direcciones</h2>
          <ul class="addr-list">${addrs.length ? addrs.map((a) => `<li><div><b>${esc(a.label || a.name)}</b>${a.isDefault ? ' <span class="demo-flag">Principal</span>' : ""}<br>${esc([a.line1, a.district, a.city].filter(Boolean).join(", "))}<br><small>${esc(a.name)} · ${esc(a.phone)}</small></div><button class="ci-remove" type="button" data-deladdr="${a.id}">Eliminar</button></li>`).join("") : '<li class="sum-note">Aún no guardaste direcciones.</li>'}</ul>
          <form id="addrForm" class="checkout-form" novalidate style="margin-top:16px"><h3 style="font-size:1rem">Agregar dirección</h3>
            <div class="field-row"><div class="field"><label for="adLabel">Nombre de la dirección</label><input id="adLabel" name="label" placeholder="Casa, trabajo…"></div><div class="field"><label for="adName">Quién recibe</label><input id="adName" name="name" required></div></div>
            <div class="field"><label for="adLine">Dirección</label><input id="adLine" name="line1" required></div>
            <div class="field-row"><div class="field"><label for="adDist">Distrito</label><input id="adDist" name="district"></div><div class="field"><label for="adCity">Ciudad</label><input id="adCity" name="city" required></div></div>
            <div class="field-row"><div class="field"><label for="adPhone">Teléfono</label><input id="adPhone" name="phone" type="tel"></div><div class="field"><label for="adRef">Referencia</label><input id="adRef" name="reference"></div></div>
            ${errBox("adMsg")}<button class="btn btn-ghost" type="submit">Guardar dirección</button></form></div>
      </div><p style="margin-top:28px"><button class="btn btn-ghost" id="logoutBtn" type="button">Cerrar sesión</button></p></section></div>`, "Mi cuenta");
    bindLogout();
    $("#profileForm").addEventListener("submit", async (e) => { e.preventDefault(); const r2 = await api("/api/account", { method: "PUT", body: formData(e.target) }); if (r2.ok) { await refreshMe(); showOk("pfMsg", "Datos guardados."); } else showErr("pfMsg", (r2.data && r2.data.error) || "No se pudo guardar."); });
    $("#addrForm").addEventListener("submit", async (e) => { e.preventDefault(); const r2 = await api("/api/account/addresses", { method: "POST", body: formData(e.target) }); if (r2.ok) renderAccount(); else showErr("adMsg", (r2.data && r2.data.error) || "No se pudo guardar."); });
    $$("[data-deladdr]").forEach((b) => b.addEventListener("click", async () => { await api(`/api/account/addresses/${b.dataset.deladdr}`, { method: "DELETE" }); renderAccount(); }));
  }
  function bindLogout() { const b = $("#logoutBtn"); if (b) b.addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); ME = null; updateAccountLink(); toast("Cerraste sesión."); location.hash = "#/"; }); }

  function renderAuth(msg) {
    view(`<div class="wrap"><section class="info" style="max-width:980px">${crumbs([["Inicio", "#/"], ["Mi cuenta"]])}<h1>Mi cuenta</h1>
      <p style="margin-top:12px">Puedes comprar sin cuenta. Si creas una, verás tus pedidos y guardarás tus direcciones.</p>${msg ? `<div class="banner" style="margin-top:12px">${esc(msg)}</div>` : ""}
      <div class="acct-grid">
        <form id="loginForm" class="checkout-form" novalidate><h2 style="font-size:1.3rem">Iniciar sesión</h2>
          <div class="field"><label for="lgEmail">Correo electrónico</label><input id="lgEmail" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="lgPw">Contraseña</label><input id="lgPw" name="password" type="password" autocomplete="current-password" required></div>
          ${errBox("lgMsg")}<div id="lgResend"></div><button class="btn btn-primary" type="submit">Entrar</button>
          <a class="link-arrow" href="#/recuperar" style="justify-self:start">¿Olvidaste tu contraseña?</a></form>
        <form id="regForm" class="checkout-form" novalidate><h2 style="font-size:1.3rem">Crear cuenta</h2>
          <div class="field"><label for="rgName">Nombre</label><input id="rgName" name="name" autocomplete="name" required></div>
          <div class="field"><label for="rgEmail">Correo electrónico</label><input id="rgEmail" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="rgPhone">Teléfono (opcional)</label><input id="rgPhone" name="phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label for="rgPw">Contraseña</label><input id="rgPw" name="password" type="password" autocomplete="new-password" required aria-describedby="rgHelp"><small id="rgHelp" class="sum-note">Mínimo 10 caracteres, con letras y números.</small></div>
          ${errBox("rgMsg")}<button class="btn btn-primary" type="submit">Crear cuenta</button></form>
      </div></section></div>`, "Mi cuenta");
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const d = formData(e.target);
      const r = await api("/api/auth/login", { method: "POST", body: d });
      if (r.ok) { if (r.data.role === "admin") { location.href = "/admin.html"; return; } await refreshMe(); toast("Sesión iniciada."); renderAccount(); return; }
      showErr("lgMsg", (r.data && r.data.error) || "No se pudo iniciar sesión.");
      if (r.data && r.data.extra && r.data.extra.code === "unverified") {
        $("#lgResend").innerHTML = `<button class="btn btn-ghost" id="lgResendBtn" type="button">Reenviar correo de verificación</button>`;
        $("#lgResendBtn").addEventListener("click", async () => { await api("/api/auth/resend", { method: "POST", body: { email: d.email } }); showOk("lgMsg", "Si la cuenta existe, enviamos un nuevo correo."); });
      }
    });
    $("#regForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const r = await api("/api/auth/register", { method: "POST", body: formData(e.target) });
      if (r.ok) { e.target.reset(); showOk("rgMsg", "Listo. Revisa tu correo para verificar tu cuenta antes de iniciar sesión."); } else showErr("rgMsg", (r.data && r.data.error) || "No se pudo crear la cuenta.");
    });
  }
  async function renderVerify(q) {
    view(`<div class="wrap"><section class="info"><h1>Verificando tu correo…</h1><p id="vfMsg" style="margin-top:14px" role="status">Un momento.</p></section></div>`, "Verificar correo");
    const r = await api("/api/auth/verify", { method: "POST", body: { token: q.token || "" } });
    const m = $("#vfMsg"); if (!m) return;
    m.innerHTML = r.ok ? `Tu correo fue verificado. <a class="link-arrow" href="#/cuenta">Inicia sesión</a>.` : esc((r.data && r.data.error) || "No se pudo verificar.");
    $("main h1").textContent = r.ok ? "¡Correo verificado!" : "No se pudo verificar";
  }
  function renderForgot() {
    view(`<div class="wrap"><section class="info" style="max-width:520px">${crumbs([["Inicio", "#/"], ["Mi cuenta", "#/cuenta"], ["Recuperar contraseña"]])}<h1>Recuperar contraseña</h1>
      <form id="fgForm" class="checkout-form" novalidate style="margin-top:16px"><div class="field"><label for="fgEmail">Correo electrónico</label><input id="fgEmail" name="email" type="email" required></div>${errBox("fgMsg")}<button class="btn btn-primary" type="submit">Enviar enlace</button></form></section></div>`, "Recuperar contraseña");
    $("#fgForm").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/auth/forgot", { method: "POST", body: formData(e.target) }); r.ok ? showOk("fgMsg", "Si el correo existe, te enviamos un enlace para crear una contraseña nueva.") : showErr("fgMsg", (r.data && r.data.error) || "Inténtalo de nuevo."); });
  }
  function renderReset(q) {
    view(`<div class="wrap"><section class="info" style="max-width:520px"><h1>Nueva contraseña</h1>
      <form id="rsForm" class="checkout-form" novalidate style="margin-top:16px"><div class="field"><label for="rsPw">Contraseña nueva</label><input id="rsPw" name="password" type="password" autocomplete="new-password" required><small class="sum-note">Mínimo 10 caracteres, con letras y números.</small></div>${errBox("rsMsg")}<button class="btn btn-primary" type="submit">Guardar contraseña</button></form></section></div>`, "Nueva contraseña");
    $("#rsForm").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/auth/reset", { method: "POST", body: { token: q.token || "", password: formData(e.target).password } }); r.ok ? (showOk("rsMsg", "Contraseña actualizada. Ya puedes iniciar sesión."), setTimeout(() => (location.hash = "#/cuenta"), 1200)) : showErr("rsMsg", (r.data && r.data.error) || "No se pudo actualizar."); });
  }

  /* ----- Pedidos ----- */
  async function renderOrderList() {
    const r = await api("/api/account/orders");
    const list = r.ok ? r.data : [];
    view(`<div class="wrap"><section class="info" style="max-width:920px">${crumbs([["Inicio", "#/"], ["Mi cuenta", "#/cuenta"], ["Mis pedidos"]])}<h1>Mis pedidos</h1>
      ${list.length ? `<div class="order-list">${list.map((o) => `<a class="order-row" href="#/cuenta/pedidos/${o.number}"><b>${esc(o.number)}</b><span>${esc(fmtDate(o.createdAt))}</span><span class="pill-st ${o.paymentStatus}">${esc(PAY_LABEL[o.paymentStatus])}</span><span>${esc(FUL_LABEL[o.fulfillmentStatus])}</span><b>${cents(o.totalCents)}</b></a>`).join("")}</div>` : `<div class="empty" style="margin-top:20px"><h2>Aún no tienes pedidos</h2><a class="btn btn-primary" href="#/catalogo">Ir a comprar</a></div>`}</section></div>`, "Mis pedidos");
  }

  async function renderOrderStatus(number, q, inAccount) {
    clearPoll();
    const path = `/api/orders/${encodeURIComponent(number)}${q && q.t ? "?t=" + encodeURIComponent(q.t) : ""}`;
    const r = await api(path);
    if (!r.ok) return view(`<div class="wrap"><section class="info"><h1>Pedido no encontrado</h1><p style="margin-top:14px">Revisa el enlace o <a class="link-arrow" href="#/cuenta">inicia sesión</a> para ver tus pedidos.</p></section></div>`, "Pedido");
    const o = r.data, paid = o.paymentStatus === "paid", waiting = o.paymentStatus === "awaiting" || o.paymentStatus === "pending";
    if (paid && cart.length) { cart = []; saveCart(); }   // el carrito se vacía solo cuando el servidor confirma el pago
    let payUrl = ""; try { payUrl = sessionStorage.getItem("flowers.pay." + o.number) || ""; } catch (e) { /* sin sesión */ }
    const head = paid ? (o.needsReview ? "Recibimos tu pago" : "¡Pago confirmado!") : waiting ? "Esperando la confirmación del pago" : o.paymentStatus === "refunded" ? "Pedido reembolsado" : "El pago no se completó";
    const crumb = inAccount ? [["Inicio", "#/"], ["Mi cuenta", "#/cuenta"], ["Mis pedidos", "#/cuenta/pedidos"], [o.number]] : [["Inicio", "#/"], ["Pedido " + o.number]];
    view(`<div class="wrap"><section class="info" style="max-width:860px">${crumbs(crumb)}${demoBanner()}
      <h1 style="margin-top:16px">${head}</h1>
      <p style="margin-top:12px">Pedido <b>${esc(o.number)}</b> · ${esc(fmtDate(o.createdAt))}</p>
      <p><span class="pill-st ${o.paymentStatus}">${esc(PAY_LABEL[o.paymentStatus])}</span> <span class="pill-st ful-${o.fulfillmentStatus}">${esc(FUL_LABEL[o.fulfillmentStatus])}</span></p>
      ${waiting ? `<p class="sum-note" role="status">No cierres esta página: se actualiza sola cuando el proveedor confirma el pago. Tus productos están reservados por tiempo limitado.</p>${payUrl ? `<a class="btn btn-primary" href="${esc(payUrl)}">Continuar con el pago${SRV.payments.simulated ? " (simulado)" : ""}</a>` : ""}` : ""}
      ${paid && !o.needsReview ? `<p>Te enviaremos un correo con el resumen de tu pedido.</p>` : ""}
      ${paid && o.needsReview ? `<p class="banner">Estamos verificando la disponibilidad de algunos productos y te escribiremos pronto. Tu pago quedó registrado.</p>` : ""}
      ${!paid && !waiting && o.paymentStatus !== "refunded" ? `<p>Tu carrito se conserva. Puedes intentar pagar de nuevo.</p><a class="btn btn-primary" href="#/carrito">Volver al carrito</a>` : ""}
      ${o.trackingCode || o.carrier ? `<div class="banner" style="margin-top:12px"><b>Seguimiento:</b> ${esc(o.carrier)} ${esc(o.trackingCode)} ${o.trackingUrl && /^https?:\/\//.test(o.trackingUrl) ? `<a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener" class="link-arrow">Rastrear</a>` : ""}</div>` : ""}
      <h2 style="font-size:1.3rem;margin:22px 0 8px">Resumen</h2>
      ${o.items.map((i) => `<div class="sum-row"><span>${i.qty} × ${esc(i.name)}<br><small>${esc([i.color, i.size && "Talla " + i.size].filter(Boolean).join(" · "))}</small></span><span>${cents(i.unitCents * i.qty)}</span></div>`).join("")}
      <div class="sum-row" style="border-top:1px solid var(--line)"><span>Subtotal</span><span>${cents(o.subtotalCents)}</span></div>
      <div class="sum-row"><span>Envío · ${esc(o.shippingMethod)} (${esc(o.shippingZone)})</span><span>${cents(o.shippingCents)}</span></div>
      <div class="sum-row total"><span>Total</span><span>${cents(o.totalCents)}</span></div>
      ${o.shippingKind === "delivery" && o.address ? `<p style="margin-top:12px"><b>Entrega en:</b> ${esc([o.address.line1, o.address.district, o.address.city].filter(Boolean).join(", "))}</p>` : ""}
      ${SRV.whatsapp ? `<p style="margin-top:18px"><a class="btn btn-ghost" target="_blank" rel="noopener" href="${esc(waLink("Hola, tengo una consulta sobre mi pedido " + o.number + "."))}">Consultar por este pedido en WhatsApp</a></p>` : ""}
      </section></div>`, "Pedido " + o.number);
    if (waiting) pollTimer = setTimeout(() => { if (parseHash().parts[0] === "pedido" || parseHash().parts[0] === "cuenta") renderOrderStatus(number, q, inAccount); }, 2500);
  }

  /* ---------- Proceso de compra: datos → pago (en la pasarela) → confirmación ---------- */
  const priceOverride = {};
  const lineKeyOf = (i) => `${i.id}|${i.color || ""}|${i.size || ""}`;
  const cartPayload = () => cart.map((i) => ({ id: i.id, color: i.color || "", size: i.size || "", qty: i.qty, expected: priceOverride[lineKeyOf(i)] ?? Math.round(unitPrice(i) * 100) }));
  async function renderCheckout() {
    clearPoll();
    if (!cart.length) { location.hash = "#/carrito"; return; }
    await refreshMe();
    let addrs = []; if (ME && ME.role === "customer") { const a = await api("/api/account"); if (a.ok) addrs = a.data.addresses; }
    const methods = SRV.shipping || [];
    const firstRate = methods.length ? methods[0].rates[0].id : 0;
    view(`<div class="wrap"><div style="padding-top:20px">${crumbs([["Inicio", "#/"], ["Carrito", "#/carrito"], ["Finalizar compra"]])}<h1>Finalizar compra</h1></div>
      <div class="cart-page"><form class="checkout-form" id="coForm" novalidate>
        ${demoBanner()}
        ${!ME ? `<p class="sum-note">Compras como invitado, sin crear cuenta. ¿Ya tienes una? <a class="link-arrow" href="#/cuenta">Inicia sesión</a></p>` : ""}
        <h2 style="font-size:1.3rem">1. Datos de contacto</h2>
        <div class="field"><label for="coEmail">Correo electrónico</label><input id="coEmail" name="email" type="email" autocomplete="email" required value="${esc(ME ? ME.email : "")}"></div>
        <div class="field-row"><div class="field"><label for="coName">Nombre y apellidos</label><input id="coName" name="name" autocomplete="name" required value="${esc(ME ? ME.name : "")}"></div>
          <div class="field"><label for="coPhone">Teléfono</label><input id="coPhone" name="phone" type="tel" autocomplete="tel" required value="${esc(ME ? ME.phone : "")}"></div></div>
        <h2 style="font-size:1.3rem;margin-top:10px">2. Entrega</h2>
        ${methods.length ? methods.map((m) => `<fieldset class="ship-group"><legend>${esc(m.name)}</legend>${m.rates.map((r, idx) => `<label class="ship-opt"><input type="radio" name="rate" value="${r.id}" data-kind="${m.kind}" ${r.id === firstRate ? "checked" : ""}><span><b>${esc(r.zone)}</b> — ${cents(r.priceCents)}${r.note ? `<br><small>${esc(r.note)}</small>` : ""}</span></label>`).join("")}</fieldset>`).join("")
          : `<p class="pending">Las modalidades de envío aún no están configuradas. No es posible completar la compra por ahora.</p>`}
        <div id="addrBlock">
          ${addrs.length ? `<div class="field"><label for="coSaved">Usar una dirección guardada</label><select id="coSaved"><option value="">— Escribir otra —</option>${addrs.map((a) => `<option value="${a.id}">${esc(a.label || a.line1)}</option>`).join("")}</select></div>` : ""}
          <div class="field"><label for="coAddr">Dirección</label><input id="coAddr" name="line1" autocomplete="street-address"></div>
          <div class="field-row"><div class="field"><label for="coDist">Distrito</label><input id="coDist" name="district" autocomplete="address-level3"></div><div class="field"><label for="coCity">Ciudad</label><input id="coCity" name="city" autocomplete="address-level2"></div></div>
          <div class="field"><label for="coRef">Referencia (opcional)</label><input id="coRef" name="reference"></div>
        </div>
        <h2 style="font-size:1.3rem;margin-top:10px">3. Pago</h2>
        <p class="sum-note">Al continuar pasarás a la pantalla de pago${SRV.payments.simulated ? " <b>SIMULADA</b> (no se cobra dinero real)" : " segura del proveedor"}. Reservamos tus productos durante ${SRV.reserveMinutes} minutos. La tienda no guarda datos de tarjeta.</p>
        <div class="form-msg err" id="coMsg" role="alert"></div>
        <button class="btn btn-primary" type="submit" id="coBtn" ${methods.length ? "" : "disabled"}>Continuar al pago</button></form>
        <aside class="summary" aria-label="Resumen del pedido" id="coSummary"><h2>Tu pedido</h2><p class="sum-note">Calculando…</p></aside></div></div>`, "Finalizar compra");

    const form = $("#coForm");
    const rateEl = () => $('input[name="rate"]:checked', form);
    const syncAddr = () => { const r = rateEl(); $("#addrBlock").hidden = !r || r.dataset.kind !== "delivery"; };
    async function quote() {
      const r = rateEl(); const res = await api("/api/checkout/quote", { method: "POST", body: { items: cartPayload(), rateId: r ? +r.value : 0 } });
      const d = res.data; if (!res.ok || !d) return renderSummary(null);
      renderSummary(d);
    }
    function renderSummary(d) {
      const box = $("#coSummary"); if (!box) return;
      if (!d) { box.innerHTML = `<h2>Tu pedido</h2><p class="form-msg err">No se pudo calcular. Inténtalo de nuevo.</p>`; return; }
      const changed = d.lines.filter((l) => l.priceChanged), bad = d.lines.filter((l) => l.issue);
      box.innerHTML = `<h2>Tu pedido</h2>
        ${d.lines.map((l) => `<div class="sum-row"><span>${l.qty} × ${esc(l.name)}<br><small>${esc([l.color, l.size && "Talla " + l.size].filter(Boolean).join(" · "))}</small>${l.issue ? `<br><small class="form-msg err">${esc(l.issue)}</small>` : ""}</span><span>${l.issue ? "—" : cents(l.unitCents * l.qty)}</span></div>`).join("")}
        <div class="sum-row" style="border-top:1px solid var(--line);margin-top:8px"><span>Subtotal</span><b>${cents(d.subtotalCents)}</b></div>
        <div class="sum-row"><span>Envío</span><span>${d.shippingCents == null ? "Elige la entrega" : cents(d.shippingCents)}</span></div>
        ${d.totalCents != null ? `<div class="sum-row total"><span>Total</span><span>${cents(d.totalCents)}</span></div>` : ""}
        ${changed.length ? `<div class="banner" style="margin-top:12px"><b>El precio cambió:</b> ${changed.map((l) => `${esc(l.name)} ahora cuesta ${cents(l.unitCents)}`).join("; ")}.<br><button class="btn btn-ghost" type="button" id="acceptPrices" style="margin-top:8px">Aceptar precios actualizados</button></div>` : ""}
        ${bad.length ? `<div class="banner" style="margin-top:12px">Hay productos sin stock suficiente. <a class="link-arrow" href="#/carrito">Ajusta tu carrito</a>.</div>` : ""}
        <a class="btn btn-ghost btn-block" href="#/carrito" style="margin-top:12px">Volver al carrito</a>`;
      const ac = $("#acceptPrices"); if (ac) ac.addEventListener("click", () => { changed.forEach((l) => { priceOverride[`${l.id}|${l.color}|${l.size}`] = l.unitCents; }); quote(); });
      $("#coBtn").disabled = bad.length > 0 || !SRV.shipping.length;
    }
    $$('input[name="rate"]', form).forEach((r) => r.addEventListener("change", () => { syncAddr(); quote(); }));
    const saved = $("#coSaved");
    if (saved) saved.addEventListener("change", () => { const a = addrs.find((x) => String(x.id) === saved.value); if (a) { $("#coAddr").value = a.line1; $("#coDist").value = a.district; $("#coCity").value = a.city; $("#coRef").value = a.reference; } });
    syncAddr(); quote();

    form.addEventListener("submit", async (e) => {
      e.preventDefault(); const msg = $("#coMsg"), r = rateEl(), d = formData(form);
      const needAddr = r && r.dataset.kind === "delivery";
      const bad = $$("input[required]", form).find((i) => !i.value.trim() || (i.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.value)));
      if (bad) { msg.textContent = "Completa correctamente tus datos de contacto."; bad.focus(); return; }
      if (!r) { msg.textContent = "Elige una modalidad de entrega."; return; }
      if (needAddr && (!d.line1.trim() || !d.city.trim())) { msg.textContent = "Escribe la dirección y la ciudad de entrega."; (d.line1.trim() ? $("#coCity") : $("#coAddr")).focus(); return; }
      msg.textContent = ""; $("#coBtn").disabled = true; $("#coBtn").textContent = "Reservando tus productos…";
      const res = await api("/api/checkout/create", { method: "POST", body: { items: cartPayload(), rateId: +r.value, name: d.name, email: d.email, phone: d.phone, address: needAddr ? { line1: d.line1, district: d.district, city: d.city, reference: d.reference } : undefined } });
      if (res.ok) { try { sessionStorage.setItem("flowers.pay." + res.data.number, res.data.payUrl); } catch (e2) { /* sin sesión */ } location.href = res.data.payUrl; return; }
      $("#coBtn").disabled = false; $("#coBtn").textContent = "Continuar al pago";
      msg.textContent = (res.data && res.data.error) || "No se pudo crear el pedido.";
      if (res.data && res.data.extra && res.data.extra.lines) renderSummary({ lines: res.data.extra.lines, subtotalCents: res.data.extra.lines.filter((l) => !l.issue).reduce((s, l) => s + l.unitCents * l.qty, 0), shippingCents: null, totalCents: null });
    });
  }
  /* ---------- Páginas informativas ---------- */
  function renderInfo(key) {
    const pg = PAGES[key];
    let extra = "";
    if (key === "tallas") extra = sizeGuideHtml();
    if (key === "contacto") {
      const c = CFG.contact;
      extra = `<div class="contact-grid"><div><h3>Escríbenos</h3><ul class="pending-list"><li>${c.email ? esc(c.email) : "Correo de contacto"}</li><li>${c.phone ? esc(c.phone) : "Teléfono / WhatsApp"}</li><li>${c.hours ? esc(c.hours) : "Horario de atención"}</li></ul></div>
        <div><h3>Síguenos</h3><p style="margin-top:12px">Mira las novedades en Instagram.</p><a class="btn btn-primary" href="${CFG.instagramUrl}" target="_blank" rel="noopener">${esc(CFG.instagramHandle)}</a></div></div>`;
    } else if (pg.pending.length) extra = `<ul class="pending-list">${pg.pending.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
    view(`<div class="wrap"><section class="info">${crumbs([["Inicio", "#/"], [pg.title]])}<h1>${esc(pg.title)}</h1><p style="margin-top:14px">${esc(pg.intro)}</p>${extra}</section></div>`, pg.title);
  }
  function renderNotFound() {
    view(`<div class="wrap"><section class="info"><h1>Página no encontrada</h1><p style="margin-top:14px">No encontramos lo que buscas.</p><a class="btn btn-primary" href="#/">Volver al inicio</a></section></div>`, "No encontrada");
  }

  /* ---------- Eventos globales ---------- */
  $("#menuToggle").addEventListener("click", openMobileNav);
  scrim.addEventListener("click", () => { closeMobileNav(); closeMini(); closeFilters(); });
  $("#mobileNav").addEventListener("click", (e) => {
    if (e.target.closest("#menuClose")) return closeMobileNav();
    const acc = e.target.closest(".mn-acc");
    if (acc) { const open = acc.getAttribute("aria-expanded") === "true"; acc.setAttribute("aria-expanded", String(!open)); $("#" + acc.getAttribute("aria-controls")).hidden = open; }
  });
  $("#searchToggle").addEventListener("click", () => toggleSearch());
  $("#searchBar").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#searchInput").value.trim();
    location.hash = "#/buscar?q=" + encodeURIComponent(v);
    if (!v) toast("Escribe qué quieres buscar.");
    toggleSearch(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("#lightbox").hidden) return closeLightbox();
      if (!$("#miniCart").hidden) return closeMini();
      if (!mobileNav.hidden) { closeMobileNav(); return $("#menuToggle").focus(); }
      if ($("#filters") && $("#filters").classList.contains("open")) return closeFilters();
      if (!$("#searchBar").hidden) { toggleSearch(false); return $("#searchToggle").focus(); }
      if (document.activeElement && document.activeElement.closest(".nav-item")) document.activeElement.blur();
    }
    if (!$("#lightbox").hidden && lb.imgs.length > 1) { if (e.key === "ArrowLeft") stepLb(-1); if (e.key === "ArrowRight") stepLb(1); }
  });
  $("#mainNav").addEventListener("click", (e) => { if (e.target.closest(".mega a")) setTimeout(() => document.activeElement && document.activeElement.blur(), 0); });
  window.addEventListener("hashchange", route);
  /* Sombra ligera al hacer scroll */
  window.addEventListener("scroll", () => $("#header").style.boxShadow = scrollY > 8 ? "0 6px 20px -12px rgba(40,30,80,.35)" : "none", { passive: true });

  (async () => {
    const [cfg, me] = await Promise.all([api("/api/config"), api("/api/auth/me")]);
    if (cfg.ok && cfg.data) { SRV = cfg.data; Object.assign(CFG.contact, SRV.contact); }
    ME = me.ok && me.data ? me.data.user : null;
    buildHeader(); buildFooter(); updateCartBadge(); updateAccountLink(); buildWhatsapp(); route();
  })();
})();
