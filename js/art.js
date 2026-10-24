/* ==========================================================================
   Imágenes de muestra (SVG generado). Sirven mientras no haya fotografías
   reales: para reemplazarlas, agrega rutas en `images` de cada producto
   (data.js) o en FLOWERS_CONFIG para portada, categorías y calle.
   ========================================================================== */
(function () {
  const C = { purple: "#5C509C", sky: "#68ACDC", pink: "#E50373", gray: "#575757" };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  /* Cada forma se dibuja en un recuadro de 400×500 centrado en (200,250). */
  const SHAPES = {
    polos: (f, s, d) => `<path d="M118 135 L160 112 Q200 142 240 112 L282 135 L328 195 L288 220 L272 198 L272 385 L128 385 L128 198 L112 220 L72 195 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M160 112 Q200 150 240 112" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
      <text x="200" y="215" text-anchor="middle" font-family="Archivo Black,Arial Black,sans-serif" font-size="22" fill="${d}">FLOWERS</text>`,
    poleras: (f, s, d) => `<path d="M122 125 L162 108 Q200 138 238 108 L278 125 L338 340 L298 352 L268 215 L268 380 L132 380 L132 215 L102 352 L62 340 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M162 108 Q200 150 238 108" fill="none" stroke="${s}" stroke-width="7" stroke-linecap="round"/>
      <path d="M132 360 H268" stroke="${s}" stroke-width="10"/>
      <path d="M150 300 H250 L240 345 H160 Z" fill="none" stroke="${s}" stroke-width="3"/>
      <text x="200" y="215" text-anchor="middle" font-family="Archivo Black,Arial Black,sans-serif" font-size="20" fill="${d}">FLOWERS</text>`,
    casacas: (f, s, d) => `<path d="M120 120 L168 100 L200 130 L232 100 L280 120 L340 345 L298 358 L270 220 L270 392 L130 392 L130 220 L102 358 L60 345 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M200 130 V392" stroke="${s}" stroke-width="4"/>
      <path d="M168 100 L200 130 L232 100 L226 92 L200 112 L174 92 Z" fill="${s}" opacity=".35"/>
      <path d="M145 320 H185 M215 320 H255" stroke="${s}" stroke-width="4" stroke-linecap="round"/>
      <rect x="150" y="190" width="26" height="14" rx="3" fill="${d}"/>`,
    pantalones: (f, s, d) => `<path d="M128 100 H272 L290 410 H214 L200 205 L186 410 H110 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M128 130 H272" stroke="${s}" stroke-width="5"/><path d="M200 130 V205" stroke="${s}" stroke-width="3"/>
      <rect x="132" y="250" width="34" height="42" rx="4" fill="none" stroke="${s}" stroke-width="3"/>
      <rect x="234" y="250" width="34" height="42" rx="4" fill="none" stroke="${s}" stroke-width="3"/>`,
    shorts: (f, s, d) => `<path d="M122 140 H278 L296 310 H214 L200 215 L186 310 H104 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M122 168 H278" stroke="${s}" stroke-width="5"/><path d="M190 168 V205 M210 168 V205" stroke="${s}" stroke-width="3" stroke-linecap="round"/>
      <rect x="236" y="240" width="40" height="8" rx="2" fill="${d}"/>`,
    zapatillas: (f, s, d) => `<path d="M52 312 Q52 250 100 238 L150 205 Q175 222 205 230 L292 240 Q352 252 352 305 V322 H52 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M52 322 H352 V344 Q352 352 342 352 H62 Q52 352 52 344 Z" fill="${shade(f, lum(f) > .5 ? -0.2 : 0.35)}" stroke="${s}" stroke-width="4"/>
      <path d="M170 215 L186 240 M192 222 L208 246 M214 228 L230 250" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
      <path d="M100 290 Q180 270 300 290" fill="none" stroke="${d}" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
    crocs: (f, s, d) => `<path d="M64 305 Q64 235 130 228 L214 224 Q250 224 270 252 L330 288 Q352 304 344 326 H64 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M64 326 H344 V344 Q344 352 334 352 H74 Q64 352 64 344 Z" fill="${shade(f, lum(f) > .5 ? -0.2 : 0.3)}" stroke="${s}" stroke-width="4"/>
      <path d="M150 232 Q170 170 214 212" fill="none" stroke="${s}" stroke-width="9" stroke-linecap="round"/>
      <g fill="${d}"><circle cx="150" cy="268" r="8"/><circle cx="185" cy="262" r="8"/><circle cx="220" cy="262" r="8"/><circle cx="165" cy="296" r="8"/><circle cx="200" cy="292" r="8"/><circle cx="235" cy="288" r="8"/></g>`,
    gorros: (f, s, d) => `<path d="M104 300 Q100 140 200 128 Q300 140 296 300 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <rect x="98" y="278" width="204" height="50" rx="12" fill="${shade(f, lum(f) > .5 ? -0.12 : 0.15)}" stroke="${s}" stroke-width="4"/>
      <path d="M120 295 V312 M145 295 V312 M170 295 V312 M195 295 V312 M220 295 V312 M245 295 V312 M270 295 V312" stroke="${s}" stroke-width="3" opacity=".5"/>
      <rect x="170" y="284" width="60" height="18" rx="3" fill="${d}"/>`,
    medias: (f, s, d) => `<path d="M158 82 H244 V268 Q312 284 330 338 Q342 392 288 400 H172 Q142 400 142 362 Q142 306 158 268 Z" fill="${f}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      <rect x="158" y="82" width="86" height="38" fill="${d}" opacity=".85"/><rect x="158" y="128" width="86" height="12" fill="${d}" opacity=".5"/>
      <path d="M142 362 Q180 380 240 372" fill="none" stroke="${s}" stroke-width="3" opacity=".5"/>`,
    bolsos: (f, s, d) => `<path d="M135 205 Q150 70 200 70 Q250 70 265 205" fill="none" stroke="${s}" stroke-width="9" stroke-linecap="round"/>
      <rect x="100" y="200" width="200" height="150" rx="22" fill="${f}" stroke="${s}" stroke-width="4"/>
      <path d="M100 250 Q200 285 300 250" fill="none" stroke="${s}" stroke-width="4"/>
      <circle cx="200" cy="272" r="9" fill="${d}"/><path d="M118 322 H182" stroke="${s}" stroke-width="3" opacity=".6"/>`,
    llaveros: (f, s, d) => `<circle cx="200" cy="88" r="30" fill="none" stroke="${s}" stroke-width="8"/>
      <path d="M200 118 V176" stroke="${s}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="144" cy="206" r="30" fill="${f}" stroke="${s}" stroke-width="4"/><circle cx="256" cy="206" r="30" fill="${f}" stroke="${s}" stroke-width="4"/>
      <circle cx="200" cy="270" r="84" fill="${f}" stroke="${s}" stroke-width="4"/>
      <ellipse cx="200" cy="296" rx="38" ry="28" fill="${shade(f, lum(f) > .5 ? -0.15 : 0.35)}" stroke="${s}" stroke-width="3"/>
      <circle cx="170" cy="250" r="8" fill="${d}"/><circle cx="230" cy="250" r="8" fill="${d}"/>
      <ellipse cx="200" cy="286" rx="11" ry="8" fill="${d}"/>`,
    baterias: (f, s, d) => `<rect x="136" y="96" width="128" height="310" rx="26" fill="${f}" stroke="${s}" stroke-width="4"/>
      <rect x="170" y="110" width="60" height="14" rx="5" fill="${s}" opacity=".5"/>
      <g fill="${d}"><circle cx="164" cy="360" r="7"/><circle cx="190" cy="360" r="7"/><circle cx="216" cy="360" r="7"/><circle cx="242" cy="360" r="7" opacity=".35"/></g>
      <path d="M205 170 L180 245 H202 L195 310 L222 225 H200 Z" fill="${d}" opacity=".9"/>`
  };

  function group(sub, hex, transform) {
    const f = hex || "#ffffff";
    const dark = lum(f) < 0.5;
    const s = dark ? shade(f, 0.35) : shade(f, -0.45);
    const d = dark ? "#ffffff" : "#2b2b33";
    const fn = SHAPES[sub] || SHAPES.polos;
    return `<g transform="${transform || ""}">${fn(f, dark ? shade(f, 0.28) : s, d)}</g>`;
  }

  function dots(id, color) {
    return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.6" fill="${color}" opacity=".35"/></pattern>`;
  }

  function wrap(w, h, inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
  }
  function uri(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

  /* Imagen de producto (vista 0, 1, 2). */
  function product(sub, hex, view) {
    const bgs = [["#eef1f8", "#dfe6f4"], ["#e6f1f9", "#cfe4f3"], ["#efeaf8", "#ddd6f0"]];
    const [a, b] = bgs[view % 3];
    const tf = view === 1 ? "translate(-120 -140) scale(1.6)" : view === 2 ? "rotate(-6 200 250) translate(8 4)" : "";
    const svg = wrap(400, 500, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>${dots("p", C.purple)}</defs>
      <rect width="400" height="500" fill="url(#g)"/><rect width="400" height="500" fill="url(#p)" opacity=".5"/>
      ${view === 2 ? `<path d="M0 440 L400 380 V500 H0Z" fill="${C.sky}" opacity=".35"/>` : ""}
      <ellipse cx="200" cy="${view === 1 ? 470 : 436}" rx="${view === 1 ? 0 : 110}" ry="10" fill="#000" opacity=".08"/>
      ${group(sub, hex, tf)}
      <text x="14" y="486" font-family="Inter,Arial,sans-serif" font-size="10" font-weight="600" letter-spacing="1.5" fill="${C.gray}" opacity=".7">FOTO DE MUESTRA</text>`);
    return uri(svg);
  }

  /* Escena compuesta para tarjetas, portada y editorial. */
  function scene(items, opts) {
    const w = opts.w, h = opts.h, bg = opts.bg, accent = opts.accent || C.sky;
    const parts = items.map((it) => group(it.sub, it.color, `translate(${it.x} ${it.y}) scale(${it.s}) rotate(${it.r || 0} 200 250)`)).join("");
    return uri(wrap(w, h, `<defs>${dots("p", "#ffffff")}</defs>
      <rect width="${w}" height="${h}" fill="${bg}"/>
      <path d="M0 ${h * 0.72} L${w} ${h * 0.5} V${h} H0Z" fill="${accent}" opacity=".55"/>
      <rect width="${w}" height="${h}" fill="url(#p)"/>${parts}`));
  }

  const SCENES = {
    ropa: () => scene([{ sub: "casacas", color: "#5C509C", x: -40, y: 60, s: 1.1, r: -6 }, { sub: "polos", color: "#f4f4f6", x: 120, y: 150, s: 0.9, r: 6 }], { w: 600, h: 750, bg: "#68ACDC", accent: "#5C509C" }),
    calzado: () => scene([{ sub: "zapatillas", color: "#f4f4f6", x: -70, y: 40, s: 1.25, r: -8 }, { sub: "crocs", color: "#E50373", x: 90, y: 230, s: 0.8, r: 4 }], { w: 600, h: 750, bg: "#5C509C", accent: "#68ACDC" }),
    accesorios: () => scene([{ sub: "gorros", color: "#68ACDC", x: -40, y: 20, s: 1, r: -5 }, { sub: "bolsos", color: "#1d1d22", x: 130, y: 150, s: 0.9, r: 6 }, { sub: "llaveros", color: "#E50373", x: 20, y: 250, s: 0.6, r: -8 }], { w: 600, h: 750, bg: "#eadff5", accent: "#5C509C" }),
    tecnologia: () => scene([{ sub: "baterias", color: "#1d1d22", x: 20, y: 40, s: 1.3, r: -5 }, { sub: "baterias", color: "#68ACDC", x: 190, y: 190, s: 0.9, r: 7 }], { w: 600, h: 750, bg: "#E4EFFA", accent: "#68ACDC" }),
    hero: () => scene([
      { sub: "pantalones", color: "#1d1d22", x: 520, y: 60, s: 1.0, r: -4 }, { sub: "casacas", color: "#f4f4f6", x: 640, y: 150, s: 0.95, r: 5 },
      { sub: "zapatillas", color: "#E50373", x: 420, y: 330, s: 0.75, r: -6 }, { sub: "gorros", color: "#68ACDC", x: 790, y: 10, s: 0.55, r: 8 }], { w: 1200, h: 700, bg: "#dfeaf7", accent: "#68ACDC" }),
    editorial: () => scene([
      { sub: "poleras", color: "#68ACDC", x: -60, y: 40, s: 1.25, r: -4 }, { sub: "bolsos", color: "#5C509C", x: 190, y: 220, s: 0.9, r: 6 }, { sub: "llaveros", color: "#E50373", x: 280, y: 20, s: 0.7, r: 10 }], { w: 800, h: 900, bg: "#ffffff", accent: "#5C509C" })
  };

  window.FlowersArt = { product, scene: (k) => SCENES[k](), colors: C };
})();
