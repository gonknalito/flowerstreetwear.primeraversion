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
  const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "S/M", "L/XL"];
  const sortSizes = (a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia > -1 || ib > -1) return (ia > -1 ? ia : 99) - (ib > -1 ? ib : 99);
    return parseFloat(a) - parseFloat(b);
  };
  const uniq = (arr) => Array.from(new Set(arr));

  /* ---------- Datos enriquecidos ---------- */
  const SUBS = {};
  CATS.forEach((c) => c.subs.forEach((s) => { SUBS[s.id] = { ...s, cat: c }; }));
  const PRODUCTS = window.FLOWERS_PRODUCTS.map((p) => ({
    sizes: [], capacities: [], soldOut: [], details: [], care: [], ...p,
    cat: SUBS[p.sub].cat.id, catName: SUBS[p.sub].cat.name, subName: SUBS[p.sub].name
  }));
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const catById = (id) => CATS.find((c) => c.id === id);
  const hex = (name) => COLORS[name] || "#cccccc";
  const imgCache = {};
  function productImage(p, view = 0, color) {
    if (p.images && p.images[view]) return p.images[view];
    const c = color || p.colors[0];
    const k = `${p.sub}|${c}|${view}`;
    return imgCache[k] || (imgCache[k] = Art.product(p.sub, hex(c), view));
  }
  const productImages = (p, color) => (p.images && p.images.length ? p.images : [0, 1, 2].map((v) => productImage(p, v, color)));
  const isNewList = () => PRODUCTS.filter((p) => p.isNew).sort((a, b) => b.addedAt.localeCompare(a.addedAt));

  /* ---------- Carrito (persistente) ---------- */
  const CART_KEY = "flowers.cart.v1";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
  cart = cart.filter((i) => byId(i.id));
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* sin almacenamiento */ } updateCartBadge(); };
  const cartCount = () => cart.reduce((n, i) => n + i.qty, 0);
  const cartSubtotal = () => cart.reduce((n, i) => n + byId(i.id).price * i.qty, 0);
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
    return `<a class="p-card" href="#/producto/${p.id}">
      <div class="p-media">
        <img src="${productImage(p)}" alt="${esc(p.name)}" width="400" height="500" loading="lazy" decoding="async">
        ${p.isNew ? '<span class="badge">Nuevo</span>' : ""}${!p.available ? '<span class="badge out">Agotado</span>' : ""}
      </div>
      <div class="p-info">
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-meta">${esc(p.subName)}</div>
        <div class="p-price">${money(p.price)}</div>
        <div class="swatches" role="img" aria-label="Colores: ${esc(p.colors.join(", "))}">${swatches}<span class="p-meta">${p.colors.length > 1 ? plural(p.colors.length, "color", "colores") : p.colors[0]}</span></div>
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
      const groups = MENU_GROUPS[c.id];
      return `<div class="mega"><div class="mega-inner" style="--cols:${groups.length}">
        ${groups.map((g) => `<div class="mega-col"><h3>${esc(g.title)}</h3><ul>
          ${g.subs.map((s) => `<li><a href="#/${c.id}/${s}">${esc(SUBS[s].name)}</a></li>`).join("")}
          <li class="see-all"><a href="#/${c.id}">Ver todo ${esc(c.name)}</a></li></ul></div>`).join("")}
        <a class="mega-promo" href="#/${c.id}"><img src="${catImage(c.id)}" alt="" loading="lazy"><span>${esc(c.name)}</span></a>
      </div></div>`;
    };
    $("#mainNav").innerHTML = `<div class="nav-item"><a class="nav-link accent" href="#/novedades" data-nav="novedades">Novedades</a></div>` +
      CATS.map((c) => `<div class="nav-item"><a class="nav-link" href="#/${c.id}" data-nav="${c.id}" aria-haspopup="true">${esc(c.name)}</a>${mega(c)}</div>`).join("");

    $("#mobileNav").innerHTML = `<div class="mn-head"><a href="#/" aria-label="Inicio"><img src="assets/logo.png" alt="Flowers Streetwear"></a>
        <button class="icon-btn" id="menuClose" aria-label="Cerrar menú"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
      <ul class="mn-list">
        <li><a class="mn-row" href="#/novedades">Novedades</a></li>
        ${CATS.map((c) => `<li><button class="mn-acc" aria-expanded="false" aria-controls="mn-${c.id}">${esc(c.name)}</button>
          <div class="mn-sub" id="mn-${c.id}" hidden><a class="all" href="#/${c.id}">Ver todo ${esc(c.name)}</a>
          ${c.subs.map((s) => `<a href="#/${c.id}/${s.id}">${esc(s.name)}</a>`).join("")}</div></li>`).join("")}
      </ul>
      <div class="mn-foot"><a class="btn btn-primary" href="#/carrito">Ver carrito</a><a class="btn btn-ghost" href="${CFG.instagramUrl}" target="_blank" rel="noopener">Instagram</a></div>`;
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
          <div><h3>Tienda</h3><ul><li><a href="#/novedades">Novedades</a></li>${CATS.map((c) => `<li><a href="#/${c.id}">${esc(c.name)}</a></li>`).join("")}</ul></div>
          <div><h3>Ayuda</h3><ul><li><a href="#/info/contacto">Contacto</a></li><li><a href="#/info/faq">Preguntas frecuentes</a></li><li><a href="#/info/envios">Envíos y cambios</a></li><li><a href="#/info/tallas">Guía de tallas</a></li><li><a href="#/info/privacidad">Privacidad y términos</a></li></ul></div>
          <div><h3>Comunidad</h3><ul><li><a href="${CFG.instagramUrl}" target="_blank" rel="noopener">Instagram ${esc(CFG.instagramHandle)}</a></li></ul></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} Flowers Streetwear · <span class="demo-flag">Catálogo de demostración</span></span>
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
    closeMobileNav(); closeMini(); closeFilters(); closeLightbox();
    if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
    const { parts, q } = parseHash();
    const [a, b] = parts;
    $$(".nav-link").forEach((l) => l.classList.toggle("active", l.dataset.nav === (a === "producto" && byId(b) ? byId(b).cat : a)));
    if (!a) renderHome();
    else if (a === "novedades") renderCatalog({ key: "novedades", title: "Novedades", lead: "Lo último que llegó a Flowers.", list: isNewList(), crumbs: [["Inicio", "#/"], ["Novedades"]], filters: ["cat", "size", "color", "price", "availability"], q });
    else if (a === "catalogo") renderCatalog({ key: "catalogo", title: "Todo el catálogo", lead: "Explora todas las categorías.", list: PRODUCTS, crumbs: [["Inicio", "#/"], ["Catálogo"]], filters: ["cat", "size", "color", "price", "availability"], q });
    else if (a === "buscar") renderSearch(q);
    else if (a === "carrito") renderCart();
    else if (a === "checkout") renderCheckout();
    else if (a === "info" && PAGES[b]) renderInfo(b);
    else if (a === "producto" && byId(b)) renderProduct(byId(b));
    else if (catById(a) && !b) renderCategory(catById(a), q);
    else if (catById(a) && SUBS[b] && SUBS[b].cat.id === a) renderSub(SUBS[b], q);
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
    const sel = PRODUCTS.filter((p) => p.selection).slice(0, 8);
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
      <div class="cat-grid">${CATS.map((c) => `<a class="cat-card reveal" href="#/${c.id}"><img src="${catImage(c.id)}" alt="" loading="lazy">
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
      filters: c.id === "accesorios" ? ["type", "color", "price", "availability", "size"] : c.filters, typeSubs: c.subs, chips: { cat: c, active: null }, q });
  }
  function renderSub(s, q) {
    renderCatalog({ key: s.id, title: s.name, lead: s.cat.tagline, list: PRODUCTS.filter((p) => p.sub === s.id),
      crumbs: [["Inicio", "#/"], [s.cat.name, `#/${s.cat.id}`], [s.name]], filters: s.cat.filters.filter((f) => f !== "type"), chips: { cat: s.cat, active: s.id }, q });
  }
  function renderSearch(q) {
    const term = (q.q || "").trim();
    $("#searchInput").value = term;
    const words = norm(term).split(/\s+/).filter(Boolean);
    const list = words.length ? PRODUCTS.filter((p) => { const hay = norm([p.name, p.catName, p.subName, p.colors.join(" "), p.description].join(" ")); return words.every((w) => hay.includes(w)); }) : [];
    renderCatalog({ key: "buscar", title: term ? `Resultados para «${term}»` : "Buscar", lead: term ? "" : "Escribe en la barra de búsqueda para encontrar productos por nombre o categoría.", list,
      crumbs: [["Inicio", "#/"], ["Búsqueda"]], filters: ["cat", "size", "color", "price", "availability"], q, search: term });
  }

  let CS = null; // estado del catálogo vigente
  function renderCatalog(o) {
    const L = o.list;
    CS = { o, st: { sort: o.q.sort || "nuevos", min: o.q.min || "", max: o.q.max || "", av: o.q.av === "1",
      size: (o.q.size || "").split(",").filter(Boolean), color: (o.q.color || "").split(",").filter(Boolean),
      type: (o.q.type || "").split(",").filter(Boolean), cap: (o.q.cap || "").split(",").filter(Boolean) } };
    const has = (k) => o.filters.includes(k);
    const sizes = uniq(L.flatMap((p) => p.sizes)).sort(sortSizes);
    const colors = uniq(L.flatMap((p) => p.colors));
    const caps = uniq(L.flatMap((p) => p.capacities)).sort((a, b) => parseFloat(a) - parseFloat(b));
    const prices = L.map((p) => p.price);
    const lo = prices.length ? Math.floor(Math.min(...prices)) : 0, hi = prices.length ? Math.ceil(Math.max(...prices)) : 0;
    const typeOpts = o.typeSubs ? o.typeSubs.map((s) => [s.id, s.name]) : uniq(L.map((p) => p.cat)).map((id) => [id, catById(id).name]);
    const chips = (name, vals, labelFn) => `<div class="f-opts">${vals.map((v) => `<label class="f-opt"><input type="checkbox" name="${name}" value="${esc(v)}"><span>${labelFn ? labelFn(v) : esc(v)}</span></label>`).join("")}</div>`;

    let fp = "";
    if ((has("type") || has("cat")) && typeOpts.length > 1) fp += `<fieldset class="f-group"><legend>${o.typeSubs ? "Tipo" : "Categoría"}</legend><div class="f-list">${typeOpts.map(([id, n]) => `<label class="f-check"><input type="checkbox" name="type" value="${id}"> ${esc(n)}</label>`).join("")}</div></fieldset>`;
    if (has("size") && sizes.length) fp += `<fieldset class="f-group"><legend>${o.key === "calzado" || o.key === "zapatillas" || o.key === "crocs" ? "Talla de calzado" : "Talla"}</legend>${chips("size", sizes)}</fieldset>`;
    if (has("capacity") && caps.length) fp += `<fieldset class="f-group"><legend>Capacidad</legend>${chips("cap", caps)}</fieldset>`;
    if (has("color") && colors.length) fp += `<fieldset class="f-group"><legend>Color</legend>${chips("color", colors, (v) => `<i class="sw" style="background:${hex(v)}"></i>${esc(v)}`)}</fieldset>`;
    if (has("price") && L.length) fp += `<fieldset class="f-group"><legend>Precio (${CFG.currency})</legend><div class="price-row"><label>Mínimo<input type="number" name="min" min="0" inputmode="decimal" placeholder="${lo}"></label><label>Máximo<input type="number" name="max" min="0" inputmode="decimal" placeholder="${hi}"></label></div></fieldset>`;
    if (has("availability")) fp += `<fieldset class="f-group"><legend>Disponibilidad</legend><label class="f-check"><input type="checkbox" name="av" value="1"> Solo productos disponibles</label></fieldset>`;

    const subChips = o.chips ? `<div class="sub-chips" aria-label="Subcategorías"><a class="chip ${o.chips.active ? "" : "active"}" href="#/${o.chips.cat.id}" ${o.chips.active ? "" : 'aria-current="page"'}>Todo ${esc(o.chips.cat.name)}</a>
      ${o.chips.cat.subs.map((s) => `<a class="chip ${o.chips.active === s.id ? "active" : ""}" href="#/${o.chips.cat.id}/${s.id}" ${o.chips.active === s.id ? 'aria-current="page"' : ""}>${esc(s.name)}</a>`).join("")}</div>` : "";

    view(`<section class="page-head"><div class="wrap">${crumbs(o.crumbs)}<h1>${esc(o.title)}</h1>${o.lead ? `<p>${esc(o.lead)}</p>` : ""}${subChips}</div></section>
      <div class="wrap catalog">
        <aside class="filters" id="filters" aria-label="Filtros" ${fp ? "" : "hidden"}>
          <div class="filters-head"><h2>Filtros</h2><button type="button" class="icon-btn filters-close" id="filtersClose" aria-label="Cerrar filtros"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
          <form id="filterForm" onsubmit="return false">${fp}</form>
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
    st.size = vals("size"); st.color = vals("color"); st.type = vals("type"); st.cap = vals("cap");
    const av = $('input[name="av"]', f); st.av = av ? av.checked : false;
    const mn = $('input[name="min"]', f), mx = $('input[name="max"]', f);
    st.min = mn ? mn.value : ""; st.max = mx ? mx.value : "";
  }
  function clearFilters() {
    Object.assign(CS.st, { size: [], color: [], type: [], cap: [], min: "", max: "", av: false });
    const f = $("#filterForm");
    if (f) $$("input", f).forEach((i) => { if (i.type === "checkbox") i.checked = false; else i.value = ""; });
    applyCatalog();
  }
  function filterList(L, st) {
    const min = st.min !== "" ? parseFloat(st.min) : null, max = st.max !== "" ? parseFloat(st.max) : null;
    return L.filter((p) => {
      if (st.type.length && !st.type.includes(CS.o.typeSubs ? p.sub : p.cat)) return false;
      if (st.size.length && !p.sizes.some((s) => st.size.includes(s))) return false;
      if (st.color.length && !p.colors.some((c) => st.color.includes(c))) return false;
      if (st.cap.length && !p.capacities.some((c) => st.cap.includes(c))) return false;
      if (min !== null && p.price < min) return false;
      if (max !== null && p.price > max) return false;
      if (st.av && !p.available) return false;
      return true;
    });
  }
  function sortList(L, how) {
    const a = L.slice();
    if (how === "precio-asc") a.sort((x, y) => x.price - y.price);
    else if (how === "precio-desc") a.sort((x, y) => y.price - x.price);
    else a.sort((x, y) => (Number(!!y.isNew) - Number(!!x.isNew)) || y.addedAt.localeCompare(x.addedAt));
    return a;
  }
  function applyCatalog(first) {
    const { o, st } = CS;
    const res = sortList(filterList(o.list, st), st.sort);
    const tags = [];
    st.type.forEach((v) => tags.push(["type", v, (SUBS[v] ? SUBS[v].name : (catById(v) || {}).name) || v]));
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
    ["size", "color", "type", "cap"].forEach((k) => st[k].length && qs.set(k, st[k].join(",")));
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
  const GUIDE_ROWS = { ropa: ["XS", "S", "M", "L", "XL"], calzado: ["37", "38", "39", "40", "41", "42", "43"] };
  function sizeGuideHtml(p) {
    const type = SUBS[p.sub].cat.sizeType;
    if (type === "ropa") return `<p class="pending">Medidas pendientes de completar por Flowers.</p><table class="size-table"><thead><tr><th>Talla</th><th>Pecho (cm)</th><th>Largo (cm)</th></tr></thead><tbody>${GUIDE_ROWS.ropa.map((s) => `<tr><td>${s}</td><td>—</td><td>—</td></tr>`).join("")}</tbody></table>`;
    if (type === "calzado") return `<p class="pending">Equivalencias pendientes de completar por Flowers.</p><table class="size-table"><thead><tr><th>Talla</th><th>Largo del pie (cm)</th></tr></thead><tbody>${GUIDE_ROWS.calzado.map((s) => `<tr><td>${s}</td><td>—</td></tr>`).join("")}</tbody></table>`;
    return "";
  }
  function renderProduct(p) {
    const sub = SUBS[p.sub], cat = sub.cat;
    const groups = [];
    if (p.colors.length) groups.push({ key: "color", label: "Color", opts: p.colors, sw: true });
    if (p.sizes.length) groups.push({ key: "size", label: cat.sizeType === "calzado" ? "Talla de calzado" : "Talla", opts: p.sizes, guide: !!GUIDE_ROWS[cat.sizeType] });
    if (p.capacities.length) groups.push({ key: "capacity", label: "Capacidad", opts: p.capacities });
    const guide = sizeGuideHtml(p);
    const related = [...PRODUCTS.filter((x) => x.sub === p.sub && x.id !== p.id), ...PRODUCTS.filter((x) => x.cat === p.cat && x.sub !== p.sub)].slice(0, 4);
    const sel = {};
    groups.forEach((g) => { if (g.opts.length === 1) sel[g.key] = g.opts[0]; });

    view(`<div class="wrap"><div style="padding-top:20px">${crumbs([["Inicio", "#/"], [cat.name, `#/${cat.id}`], [sub.name, `#/${cat.id}/${sub.id}`], [p.name]])}</div>
      <div class="pdp">
        <div class="gallery"><div class="thumbs" id="thumbs"></div>
          <button class="g-main" id="gMain" type="button" aria-label="Ampliar foto"><img id="gImg" alt="" width="400" height="500"><span class="g-zoom" aria-hidden="true">Ampliar</span>${p.isNew ? '<span class="badge">Nuevo</span>' : ""}</button></div>
        <div class="pdp-info">
          <span class="eyebrow">${esc(sub.name)}</span>
          <h1>${esc(p.name)}</h1>
          <div class="pdp-price">${money(p.price)}</div>
          <div class="stock ${p.available ? "" : "out"}">${p.available ? "Disponible" : "Agotado"}</div>
          <p>${esc(p.description)}</p>
          <form id="buyForm" novalidate>
            ${groups.map((g) => `<fieldset class="var-block" data-key="${g.key}"><div class="var-label"><span>${g.label}<span class="chosen" data-chosen></span></span>${g.guide ? '<button type="button" data-guide>Guía de tallas</button>' : ""}</div>
              <div class="var-opts">${g.opts.map((o) => {
                const out = !p.available || p.soldOut.includes(o);
                return `<label class="var-opt"><input type="radio" name="${g.key}" value="${esc(o)}" ${out ? "disabled" : ""} ${sel[g.key] === o ? "checked" : ""}><span>${g.sw ? `<i class="sw" style="background:${hex(o)}"></i>` : ""}${esc(o)}</span></label>`;
              }).join("")}</div><div class="var-error" role="alert"></div></fieldset>`).join("")}
            <div class="buy-row"><div class="qty"><button type="button" id="qMinus" aria-label="Quitar uno">−</button><input id="qty" type="number" min="1" max="10" value="1" aria-label="Cantidad"><button type="button" id="qPlus" aria-label="Agregar uno">+</button></div>
              <button class="btn btn-primary" type="submit" ${p.available ? "" : "disabled"}>${p.available ? "Agregar al carrito" : "Agotado"}</button></div>
          </form>
          <p class="demo-note"><span class="demo-flag">Demo</span> Producto de ejemplo: nombre, precio, fotos y especificaciones se reemplazarán con información real de Flowers.</p>
          <div class="acc">
            <details open><summary>Detalles</summary><div class="acc-body"><ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>${p.sub === "llaveros" ? '<p class="pending" style="margin-top:12px">Colaboración, licencia y autenticidad: sin información confirmada por Flowers.</p>' : ""}</div></details>
            <details><summary>Cuidados</summary><div class="acc-body"><ul>${p.care.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div></details>
            <details><summary>Envíos y cambios</summary><div class="acc-body"><p class="pending">Plazos, costos y condiciones pendientes de completar. <a href="#/info/envios" style="text-decoration:underline">Ver página de envíos y cambios</a>.</p></div></details>
            ${guide ? `<details id="guideAcc"><summary>Guía de tallas</summary><div class="acc-body">${guide}</div></details>` : ""}
          </div>
        </div>
      </div>
      <section class="section" style="padding-top:24px"><div class="section-head"><h2>Productos relacionados</h2></div>${grid(related)}</section></div>`, p.name);

    /* Galería */
    let gi = 0, imgs = productImages(p, sel.color);
    const paint = () => {
      $("#gImg").src = imgs[gi]; $("#gImg").alt = `${p.name}, foto ${gi + 1} de ${imgs.length}`;
      $("#thumbs").innerHTML = imgs.map((s, i) => `<button class="thumb" type="button" aria-label="Ver foto ${i + 1}" ${i === gi ? 'aria-current="true"' : ""} data-i="${i}"><img src="${s}" alt="" loading="lazy"></button>`).join("");
      $$(".thumb").forEach((b) => b.addEventListener("click", () => { gi = +b.dataset.i; paint(); }));
    };
    paint();
    $("#gMain").addEventListener("click", () => openLightbox(imgs, gi, p.name, (i) => { gi = i; paint(); }));

    /* Variantes */
    const form = $("#buyForm");
    const showChosen = () => groups.forEach((g) => { const el = $(`[data-key="${g.key}"] [data-chosen]`); if (el) el.textContent = sel[g.key] ? `: ${sel[g.key]}` : ""; });
    showChosen();
    form.addEventListener("change", (e) => {
      if (e.target.type !== "radio") return;
      sel[e.target.name] = e.target.value; showChosen();
      $(`[data-key="${e.target.name}"] .var-error`).textContent = "";
      if (e.target.name === "color" && !(p.images && p.images.length)) { imgs = productImages(p, sel.color); paint(); }
    });
    const gb = $("[data-guide]"); if (gb) gb.addEventListener("click", () => { const a = $("#guideAcc"); a.open = true; a.scrollIntoView({ behavior: "smooth", block: "center" }); });
    const qty = $("#qty"), clampQ = () => { qty.value = Math.max(1, Math.min(10, parseInt(qty.value, 10) || 1)); };
    $("#qMinus").addEventListener("click", () => { qty.value = (parseInt(qty.value, 10) || 1) - 1; clampQ(); });
    $("#qPlus").addEventListener("click", () => { qty.value = (parseInt(qty.value, 10) || 1) + 1; clampQ(); });
    qty.addEventListener("change", clampQ);
    form.addEventListener("submit", (e) => {
      e.preventDefault(); clampQ();
      const missing = groups.filter((g) => !sel[g.key]);
      $$(".var-error").forEach((x) => { x.textContent = ""; });
      if (missing.length) {
        missing.forEach((g) => { $(`[data-key="${g.key}"] .var-error`).textContent = `Selecciona ${g.key === "color" ? "un color" : g.key === "size" ? "una talla" : "una capacidad"} para continuar.`; });
        const first = $(`[data-key="${missing[0].key}"] input:not(:disabled)`); if (first) first.focus();
        return;
      }
      addToCart({ id: p.id, size: sel.size || "", color: sel.color || "", capacity: sel.capacity || "", qty: parseInt(qty.value, 10) });
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
      <div class="mc-body">${items.length ? items.map((i) => { const p = byId(i.id); return `<div class="mc-item"><img src="${productImage(p, 0, i.color)}" alt="${esc(p.name)}"><div><div class="ci-name">${esc(p.name)}</div><div>${esc(variantText(i))}</div><div>Cant.: ${i.qty}</div></div><div class="ci-price">${money(p.price * i.qty)}</div></div>`; }).join("") : "<p>Tu carrito está vacío.</p>"}</div>
      <div class="mc-foot"><div class="sum-row"><span>Subtotal</span><b>${money(cartSubtotal())}</b></div>
        <a class="btn btn-primary" href="#/checkout">Finalizar compra</a><a class="btn btn-ghost" href="#/carrito">Ver carrito</a><button class="btn btn-ghost" id="mcContinue" type="button">Seguir comprando</button></div>`;
    m.hidden = false; openScrim("mini");
    $("#mcClose").addEventListener("click", closeMini); $("#mcContinue").addEventListener("click", closeMini);
    $("#mcClose").focus();
  }
  function closeMini() { const m = $("#miniCart"); if (m.hidden) return; m.hidden = true; if (scrimOwner === "mini") closeScrim(); }

  /* ---------- Página de carrito ---------- */
  const shippingRow = () => CFG.shipping.enabled ? `<div class="sum-row"><span>Envío</span><span>${money(CFG.shipping.flat)}</span></div>` : `<div class="sum-row"><span>Envío</span><span>Por calcular</span></div>`;
  function renderCart() {
    if (!cart.length) {
      view(`<div class="wrap"><section class="info"><h1>Tu carrito</h1><div class="empty" style="margin-top:24px"><h2>Tu carrito está vacío</h2><p>Explora el catálogo y encuentra tu próxima pieza.</p><a class="btn btn-primary" href="#/catalogo">Ir a comprar</a></div></section></div>`, "Carrito");
      return;
    }
    view(`<div class="wrap"><div style="padding-top:20px">${crumbs([["Inicio", "#/"], ["Carrito"]])}<h1>Tu carrito</h1></div>
      <div class="cart-page"><section aria-label="Productos en el carrito">${cart.map((i, idx) => { const p = byId(i.id); return `<article class="cart-item">
        <a href="#/producto/${p.id}"><img src="${productImage(p, 0, i.color)}" alt="${esc(p.name)}" width="110" height="138"></a>
        <div><a class="ci-name" href="#/producto/${p.id}">${esc(p.name)}</a><div class="ci-var">${esc(variantText(i)) || "&nbsp;"}</div>
          <div class="qty"><button type="button" data-q="-1" data-i="${idx}" aria-label="Quitar uno de ${esc(p.name)}">−</button><output aria-label="Cantidad" aria-live="polite">${i.qty}</output><button type="button" data-q="1" data-i="${idx}" aria-label="Agregar uno de ${esc(p.name)}">+</button></div>
          <button class="ci-remove" type="button" data-rm="${idx}">Eliminar</button></div>
        <div class="ci-price">${money(p.price * i.qty)}</div></article>`; }).join("")}
        <p style="margin-top:20px"><a class="link-arrow" href="#/catalogo">← Continuar comprando</a></p></section>
        <aside class="summary" aria-label="Resumen"><h2>Resumen</h2>
          <div class="sum-row"><span>Subtotal (${plural(cartCount(), "artículo", "artículos")})</span><b>${money(cartSubtotal())}</b></div>${shippingRow()}
          ${CFG.shipping.enabled ? `<div class="sum-row total"><span>Total</span><span>${money(cartSubtotal() + CFG.shipping.flat)}</span></div>` : `<p class="sum-note">${esc(CFG.shipping.note)}</p>`}
          <a class="btn btn-primary btn-block" href="#/checkout">Finalizar compra</a></aside></div></div>`, "Carrito");
    $$("[data-q]").forEach((b) => b.addEventListener("click", () => { const it = cart[+b.dataset.i]; it.qty = Math.max(1, Math.min(20, it.qty + +b.dataset.q)); saveCart(); const y = scrollY; renderCart(); scrollTo(0, y); const nb = $(`[data-q="${b.dataset.q}"][data-i="${b.dataset.i}"]`); if (nb) nb.focus(); }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { const it = cart[+b.dataset.rm]; cart.splice(+b.dataset.rm, 1); saveCart(); renderCart(); toast(`Se eliminó «${byId(it.id).name}» del carrito.`); }));
  }

  /* ---------- Proceso de compra (demostración) ---------- */
  function renderCheckout() {
    if (!cart.length) { location.hash = "#/carrito"; return; }
    view(`<div class="wrap"><div style="padding-top:20px">${crumbs([["Inicio", "#/"], ["Carrito", "#/carrito"], ["Finalizar compra"]])}<h1>Finalizar compra</h1></div>
      <div class="cart-page"><form class="checkout-form" id="coForm" novalidate>
        <div class="banner"><b>Proceso de demostración.</b> Aún no hay una pasarela de pago conectada: no se realizará ningún cobro ni se creará ningún pedido.</div>
        <h2 style="font-size:1.3rem">Contacto</h2>
        <div class="field"><label for="coEmail">Correo electrónico</label><input id="coEmail" name="email" type="email" autocomplete="email" required></div>
        <div class="field-row"><div class="field"><label for="coName">Nombre y apellidos</label><input id="coName" name="name" autocomplete="name" required></div>
          <div class="field"><label for="coPhone">Teléfono</label><input id="coPhone" name="phone" type="tel" autocomplete="tel" required></div></div>
        <h2 style="font-size:1.3rem;margin-top:10px">Dirección de entrega</h2>
        <div class="field"><label for="coAddr">Dirección</label><input id="coAddr" name="address" autocomplete="street-address" required></div>
        <div class="field-row"><div class="field"><label for="coCity">Distrito / ciudad</label><input id="coCity" name="city" autocomplete="address-level2" required></div>
          <div class="field"><label for="coRef">Referencia (opcional)</label><input id="coRef" name="ref"></div></div>
        <h2 style="font-size:1.3rem;margin-top:10px">Pago</h2>
        <p class="pending">Medios de pago pendientes de conectar (pasarela por definir).</p>
        <div class="form-msg err" id="coMsg" role="alert"></div>
        <button class="btn btn-primary" type="submit">Continuar al pago (demo)</button></form>
        <aside class="summary" aria-label="Resumen del pedido"><h2>Tu pedido</h2>
          ${cart.map((i) => { const p = byId(i.id); return `<div class="sum-row"><span>${i.qty} × ${esc(p.name)}<br><small>${esc(variantText(i))}</small></span><span>${money(p.price * i.qty)}</span></div>`; }).join("")}
          <div class="sum-row" style="border-top:1px solid var(--line);margin-top:8px"><span>Subtotal</span><b>${money(cartSubtotal())}</b></div>${shippingRow()}
          ${CFG.shipping.enabled ? `<div class="sum-row total"><span>Total</span><span>${money(cartSubtotal() + CFG.shipping.flat)}</span></div>` : `<p class="sum-note">${esc(CFG.shipping.note)}</p>`}
          <a class="btn btn-ghost btn-block" href="#/carrito">Volver al carrito</a></aside></div></div>`, "Finalizar compra");
    $("#coForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target, msg = $("#coMsg"), bad = $$("input[required]", f).find((i) => !i.value.trim() || (i.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.value)));
      if (bad) { msg.className = "form-msg err"; msg.textContent = "Completa correctamente todos los campos obligatorios."; bad.focus(); return; }
      msg.className = "banner"; msg.setAttribute("role", "status");
      msg.innerHTML = CFG.payments.gatewayConnected ? "Redirigiendo al pago…" : "<b>Demostración:</b> la pasarela de pago aún no está conectada. No se procesó ningún pago y no se generó ningún pedido. Tu carrito se mantiene intacto.";
      /* CONEXIÓN PENDIENTE: aquí se enviarían los datos del formulario y el carrito (cart) a la pasarela de pago / backend. */
    });
  }

  /* ---------- Páginas informativas ---------- */
  function renderInfo(key) {
    const pg = PAGES[key];
    let extra = "";
    if (key === "tallas") extra = `<h2 style="font-size:1.4rem;margin:28px 0 12px">Ropa</h2>${sizeGuideHtml({ sub: "polos" })}<h2 style="font-size:1.4rem;margin:28px 0 12px">Calzado</h2>${sizeGuideHtml({ sub: "zapatillas" })}`;
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

  buildHeader(); buildFooter(); updateCartBadge(); route();
})();
