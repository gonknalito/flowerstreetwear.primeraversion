/* ==========================================================================
   FLOWERS STREETWEAR · DATOS EDITABLES
   Todo lo que cambia con frecuencia vive aquí: textos de marca, categorías,
   productos, precios, variantes y disponibilidad.
   ========================================================================== */

window.FLOWERS_CONFIG = {
  brand: "FLOWERS STREETWEAR",
  instagramUrl: "https://www.instagram.com/flowers.streetwear/",
  instagramHandle: "@flowers.streetwear",
  currency: "S/",
  /* Franja superior editable */
  announcement: "Descubre el nuevo drop de Flowers",
  /* Imágenes editoriales: coloca aquí la ruta de tus fotos (p. ej. "assets/img/portada.jpg").
     Si queda vacío se muestra una composición gráfica de muestra. */
  heroImage: "",
  categoryImages: { ropa: "", calzado: "", accesorios: "", tecnologia: "" },
  editorialImage: "",
  streetImages: [],           /* hasta 6 fotos de outfits: ["assets/img/calle-1.jpg", ...] */
  /* Envíos: no hay tarifas definidas. Cuando existan, cambia enabled a true y completa flat. */
  shipping: { enabled: false, flat: 0, note: "Se calculará al finalizar la compra (pendiente de configurar)." },
  /* Pasarela de pago: pendiente de integración real. */
  payments: { gatewayConnected: false },
  /* Suscripción por correo: pendiente de conectar con un servicio (Mailchimp, Brevo, etc.). */
  newsletter: { connected: false },
  /* Datos de contacto: completar con información real. */
  contact: { email: "", phone: "", address: "", hours: "" }
};

/* Categorías y subcategorías.
   filters: qué filtros se muestran. sizeType: "ropa" | "calzado" | "otro" | null  */
window.FLOWERS_CATEGORIES = [
  { id: "ropa", name: "Ropa", tagline: "Prendas con actitud para el día a día.", filters: ["size", "color", "price", "availability"], sizeType: "ropa",
    subs: [
      { id: "polos", name: "Polos" }, { id: "poleras", name: "Poleras" }, { id: "casacas", name: "Casacas" },
      { id: "pantalones", name: "Pantalones" }, { id: "shorts", name: "Shorts" } ] },
  { id: "calzado", name: "Calzado", tagline: "Pisa fuerte, a tu ritmo.", filters: ["size", "color", "price", "availability"], sizeType: "calzado",
    subs: [ { id: "zapatillas", name: "Zapatillas" }, { id: "crocs", name: "Crocs" } ] },
  { id: "accesorios", name: "Accesorios", tagline: "Los detalles que completan el outfit.", filters: ["type", "color", "price", "availability", "size"], sizeType: "otro",
    subs: [
      { id: "gorros", name: "Gorros" }, { id: "medias", name: "Medias" }, { id: "bolsos", name: "Bolsos" },
      { id: "llaveros", name: "Llaveros de Ted x Supreme" } ] },
  { id: "tecnologia", name: "Tecnología", tagline: "Energía para seguir en la calle.", filters: ["capacity", "price", "availability"], sizeType: null,
    subs: [ { id: "baterias", name: "Baterías portátiles" } ] }
];

window.FLOWERS_SIZES = {
  ropa: ["XS", "S", "M", "L", "XL"],
  calzado: ["37", "38", "39", "40", "41", "42", "43"],
  otro: []
};

/* Paleta de colores de producto (nombre → hex). Edita o agrega nombres aquí. */
window.FLOWERS_COLORS = {
  "Negro": "#1d1d22", "Blanco": "#f4f4f6", "Morado": "#5C509C", "Celeste": "#68ACDC",
  "Fucsia": "#E50373", "Gris": "#8b8d94", "Crema": "#e9e2d0", "Verde oliva": "#6b7050", "Azul marino": "#26335c"
};

/* --------------------------------------------------------------------------
   PRODUCTOS DE DEMOSTRACIÓN
   Campos:
   id · name · sub (id de subcategoría) · price (número, en soles)
   colors: ["Negro", ...] · sizes: [...] (vacío = sin talla) · capacities: [...]
   available: true/false · soldOut: ["M","Negro"] (variantes agotadas, opcional)
   isNew: true → etiqueta «Nuevo» · addedAt: fecha para ordenar por novedades
   selection: true → aparece en «Selección Flowers»
   images: ["assets/img/mi-foto-1.jpg", ...] → si se omite se usa una imagen de muestra.
   -------------------------------------------------------------------------- */
window.FLOWERS_PRODUCTS = [
  /* POLOS */
  { id: "polo-flor-urbana", name: "Polo Flor Urbana", sub: "polos", price: 79.00, colors: ["Blanco", "Negro", "Celeste"], sizes: ["S", "M", "L", "XL"], available: true, isNew: true, addedAt: "2026-10-20", selection: true,
    description: "Polo de corte relajado con gráfico frontal inspirado en la cultura urbana.", details: ["Corte relajado (oversize ligero)", "Cuello redondo", "Estampado frontal"], care: ["Lavar del revés", "No usar blanqueador", "Planchar a baja temperatura"] },
  { id: "polo-boxy-flowers", name: "Polo Boxy Flowers", sub: "polos", price: 85.00, colors: ["Morado", "Negro"], sizes: ["S", "M", "L"], soldOut: ["S"], available: true, isNew: true, addedAt: "2026-10-18",
    description: "Silueta boxy y caída amplia para un look callejero y cómodo.", details: ["Silueta boxy", "Cuello reforzado", "Logo bordado pequeño"], care: ["Lavar del revés", "No usar secadora"] },
  { id: "polo-basico-negro", name: "Polo Básico Flowers", sub: "polos", price: 59.00, colors: ["Negro", "Blanco", "Gris"], sizes: ["XS", "S", "M", "L", "XL"], available: true, addedAt: "2026-08-10",
    description: "El básico que combina con todo, con la marca discreta en el pecho.", details: ["Corte regular", "Cuello redondo"], care: ["Lavar con colores similares", "No usar blanqueador"] },

  /* POLERAS */
  { id: "polera-capucha-flowers", name: "Polera con Capucha Flowers", sub: "poleras", price: 159.00, colors: ["Morado", "Negro", "Gris"], sizes: ["S", "M", "L", "XL"], available: true, isNew: true, addedAt: "2026-10-19", selection: true,
    description: "Polera con capucha y bolsillo canguro. Abrigo cómodo para todos los días.", details: ["Capucha ajustable", "Bolsillo frontal", "Puños acanalados"], care: ["Lavar del revés", "No usar secadora"] },
  { id: "polera-cuello-redondo", name: "Polera Cuello Redondo", sub: "poleras", price: 129.00, colors: ["Celeste", "Crema"], sizes: ["S", "M", "L"], available: true, addedAt: "2026-09-12",
    description: "Polera de cuello redondo con estampado en la espalda.", details: ["Corte relajado", "Estampado en espalda"], care: ["Lavar del revés", "Planchar a baja temperatura"] },
  { id: "polera-oversize", name: "Polera Oversize Street", sub: "poleras", price: 149.00, colors: ["Negro", "Verde oliva"], sizes: ["M", "L", "XL"], available: false, addedAt: "2026-07-01",
    description: "Polera oversize de caída amplia.", details: ["Oversize", "Hombros caídos"], care: ["Lavar del revés"] },

  /* CASACAS */
  { id: "casaca-bomber", name: "Casaca Bomber Flowers", sub: "casacas", price: 229.00, colors: ["Negro", "Azul marino"], sizes: ["S", "M", "L", "XL"], available: true, isNew: true, addedAt: "2026-10-17", selection: true,
    description: "Bomber ligera con cierre frontal y puños elásticos.", details: ["Cierre frontal", "Bolsillos laterales", "Puños y basta elásticos"], care: ["Lavar a mano o ciclo delicado", "No planchar sobre estampados"] },
  { id: "casaca-cortaviento", name: "Casaca Cortaviento", sub: "casacas", price: 189.00, colors: ["Celeste", "Morado"], sizes: ["S", "M", "L"], available: true, addedAt: "2026-09-02",
    description: "Cortaviento liviana para días frescos.", details: ["Capucha enrollable", "Cierre completo"], care: ["Lavar en ciclo delicado"] },
  { id: "casaca-denim", name: "Casaca Denim Street", sub: "casacas", price: 249.00, colors: ["Azul marino", "Negro"], sizes: ["M", "L", "XL"], available: true, addedAt: "2026-06-15",
    description: "Casaca estilo denim con parches de marca.", details: ["Botones metálicos", "Bolsillos de pecho"], care: ["Lavar del revés", "No usar blanqueador"] },

  /* PANTALONES */
  { id: "pantalon-cargo", name: "Pantalón Cargo Flowers", sub: "pantalones", price: 169.00, colors: ["Negro", "Verde oliva", "Crema"], sizes: ["S", "M", "L", "XL"], available: true, isNew: true, addedAt: "2026-10-16",
    description: "Cargo de pierna ancha con bolsillos laterales amplios.", details: ["Pierna ancha", "Bolsillos cargo", "Cintura ajustable"], care: ["Lavar del revés", "No usar secadora"] },
  { id: "pantalon-jogger", name: "Pantalón Jogger", sub: "pantalones", price: 139.00, colors: ["Gris", "Negro"], sizes: ["XS", "S", "M", "L"], available: true, addedAt: "2026-08-22", selection: true,
    description: "Jogger cómodo con puños acanalados.", details: ["Cordón ajustable", "Bolsillos laterales"], care: ["Lavar con colores similares"] },
  { id: "pantalon-wide", name: "Pantalón Wide Leg", sub: "pantalones", price: 179.00, colors: ["Azul marino", "Celeste"], sizes: ["S", "M", "L"], available: true, addedAt: "2026-07-20",
    description: "Pantalón de corte amplio y tiro alto.", details: ["Tiro alto", "Pierna ancha"], care: ["Lavar del revés"] },

  /* SHORTS */
  { id: "short-deportivo", name: "Short Deportivo Flowers", sub: "shorts", price: 89.00, colors: ["Negro", "Morado"], sizes: ["S", "M", "L", "XL"], available: true, isNew: true, addedAt: "2026-10-15",
    description: "Short liviano con cintura elástica y logo en la pierna.", details: ["Cintura elástica con cordón", "Bolsillos laterales"], care: ["Lavar con colores similares"] },
  { id: "short-cargo", name: "Short Cargo", sub: "shorts", price: 99.00, colors: ["Crema", "Verde oliva"], sizes: ["M", "L", "XL"], available: true, addedAt: "2026-08-01",
    description: "Short cargo con bolsillos laterales.", details: ["Bolsillos cargo", "Largo a la rodilla"], care: ["Lavar del revés"] },
  { id: "short-denim", name: "Short Denim Street", sub: "shorts", price: 109.00, colors: ["Azul marino"], sizes: ["S", "M", "L"], available: true, addedAt: "2026-06-30",
    description: "Short estilo denim de corte holgado.", details: ["Corte holgado", "Cierre y botón"], care: ["Lavar del revés"] },

  /* ZAPATILLAS */
  { id: "zapatilla-street-low", name: "Zapatilla Street Low", sub: "zapatillas", price: 259.00, colors: ["Blanco", "Negro"], sizes: ["38", "39", "40", "41", "42", "43"], soldOut: ["38"], available: true, isNew: true, addedAt: "2026-10-21", selection: true,
    description: "Zapatilla de corte bajo, suela gruesa y base cómoda para todo el día.", details: ["Corte bajo", "Suela gruesa", "Plantilla acolchada"], care: ["Limpiar con paño húmedo", "Evitar la lavadora"] },
  { id: "zapatilla-high", name: "Zapatilla High Flowers", sub: "zapatillas", price: 289.00, colors: ["Negro", "Morado"], sizes: ["39", "40", "41", "42"], available: true, addedAt: "2026-09-20",
    description: "Zapatilla de caña alta con cierre de cordones.", details: ["Caña alta", "Cordones planos"], care: ["Limpiar con paño húmedo"] },
  { id: "zapatilla-runner", name: "Zapatilla Runner", sub: "zapatillas", price: 239.00, colors: ["Celeste", "Gris"], sizes: ["37", "38", "39", "40", "41"], available: true, addedAt: "2026-08-14",
    description: "Zapatilla liviana de aire deportivo.", details: ["Malla transpirable", "Suela flexible"], care: ["Limpiar con paño húmedo"] },

  /* CROCS */
  { id: "croc-clasico", name: "Croc Clásico Flowers", sub: "crocs", price: 149.00, colors: ["Negro", "Morado", "Celeste"], sizes: ["37", "38", "39", "40", "41", "42"], available: true, isNew: true, addedAt: "2026-10-14",
    description: "Clog liviano y fácil de limpiar, con orificios de ventilación.", details: ["Material liviano", "Correa trasera móvil"], care: ["Lavar con agua y jabón suave"] },
  { id: "croc-plataforma", name: "Croc Plataforma", sub: "crocs", price: 169.00, colors: ["Blanco", "Fucsia"], sizes: ["36", "37", "38", "39", "40"], available: true, addedAt: "2026-09-05",
    description: "Clog con suela de plataforma.", details: ["Plataforma", "Ventilación lateral"], care: ["Lavar con agua y jabón suave"] },
  { id: "croc-sandalia", name: "Sandalia Croc", sub: "crocs", price: 119.00, colors: ["Negro", "Gris"], sizes: ["38", "39", "40", "41", "42", "43"], available: false, addedAt: "2026-06-01",
    description: "Sandalia ligera con correas ajustables.", details: ["Correas ajustables"], care: ["Lavar con agua y jabón suave"] },

  /* GORROS */
  { id: "gorro-beanie", name: "Gorro Beanie Flowers", sub: "gorros", price: 49.00, colors: ["Negro", "Morado", "Celeste"], sizes: [], available: true, isNew: true, addedAt: "2026-10-13", selection: true,
    description: "Gorro de punto con doblez y etiqueta de marca.", details: ["Talla única", "Punto elástico"], care: ["Lavar a mano"] },
  { id: "gorro-pescador", name: "Gorro Bucket", sub: "gorros", price: 59.00, colors: ["Crema", "Negro"], sizes: [], available: true, addedAt: "2026-08-28",
    description: "Bucket hat de ala media.", details: ["Talla única", "Algodón"], care: ["Lavar a mano"] },
  { id: "gorro-cap", name: "Gorra Snapback", sub: "gorros", price: 65.00, colors: ["Blanco", "Fucsia"], sizes: [], available: true, addedAt: "2026-07-18",
    description: "Gorra de visera plana con cierre ajustable.", details: ["Cierre ajustable", "Visera plana"], care: ["Limpiar con paño húmedo"] },

  /* MEDIAS */
  { id: "medias-largas", name: "Medias Largas Flowers", sub: "medias", price: 25.00, colors: ["Blanco", "Negro"], sizes: ["S/M", "L/XL"], available: true, isNew: true, addedAt: "2026-10-12",
    description: "Medias largas de algodón con logo tejido.", details: ["Algodón", "Puño elástico"], care: ["Lavar con colores similares"] },
  { id: "medias-pack", name: "Pack de Medias", sub: "medias", price: 55.00, colors: ["Negro", "Gris"], sizes: ["S/M", "L/XL"], available: true, addedAt: "2026-09-09",
    description: "Pack de medias de uso diario.", details: ["Pack de varios pares (cantidad por confirmar)"], care: ["Lavar con colores similares"] },
  { id: "medias-tobilleras", name: "Medias Tobilleras", sub: "medias", price: 22.00, colors: ["Celeste", "Fucsia", "Blanco"], sizes: ["S/M", "L/XL"], available: true, addedAt: "2026-07-07",
    description: "Medias tobilleras livianas.", details: ["Corte tobillero"], care: ["Lavar con colores similares"] },

  /* BOLSOS */
  { id: "bolso-crossbody", name: "Bolso Crossbody", sub: "bolsos", price: 99.00, colors: ["Negro", "Morado"], sizes: [], available: true, isNew: true, addedAt: "2026-10-11", selection: true,
    description: "Bolso cruzado compacto con correa ajustable.", details: ["Correa ajustable", "Cierre frontal"], care: ["Limpiar con paño húmedo"] },
  { id: "bolso-tote", name: "Tote Bag Flowers", sub: "bolsos", price: 69.00, colors: ["Crema", "Negro"], sizes: [], available: true, addedAt: "2026-08-05",
    description: "Tote bag de tela resistente con estampado.", details: ["Tela resistente", "Asas largas"], care: ["Lavar a mano"] },
  { id: "bolso-mochila", name: "Mochila Urbana", sub: "bolsos", price: 159.00, colors: ["Negro", "Azul marino"], sizes: [], available: true, addedAt: "2026-07-25",
    description: "Mochila urbana con compartimento principal amplio.", details: ["Correas acolchadas", "Bolsillo frontal"], care: ["Limpiar con paño húmedo"] },

  /* LLAVEROS TED x SUPREME (denominación según el producto; sin afirmar licencia ni autenticidad) */
  { id: "llavero-ted-1", name: "Llavero Ted x Supreme · Modelo 1", sub: "llaveros", price: 35.00, colors: ["Celeste", "Fucsia"], sizes: [], available: true, isNew: true, addedAt: "2026-10-22",
    description: "Llavero con figura de osito. Denominación tal como se comercializa; información de origen pendiente de confirmar por Flowers.", details: ["Figura tipo osito", "Argolla metálica"], care: ["Limpiar con paño seco"] },
  { id: "llavero-ted-2", name: "Llavero Ted x Supreme · Modelo 2", sub: "llaveros", price: 35.00, colors: ["Negro", "Blanco"], sizes: [], available: true, addedAt: "2026-10-01", selection: true,
    description: "Segundo modelo de llavero con figura de osito.", details: ["Argolla metálica"], care: ["Limpiar con paño seco"] },
  { id: "llavero-ted-3", name: "Llavero Ted x Supreme · Modelo 3", sub: "llaveros", price: 39.00, colors: ["Morado"], sizes: [], available: false, addedAt: "2026-09-01",
    description: "Tercer modelo de llavero con figura de osito.", details: ["Argolla metálica"], care: ["Limpiar con paño seco"] },

  /* BATERÍAS PORTÁTILES (capacidades de ejemplo; reemplazar por las especificaciones reales) */
  { id: "bateria-10000", name: "Batería Portátil 10 000 mAh", sub: "baterias", price: 89.00, colors: ["Negro"], sizes: [], capacities: ["10000 mAh"], available: true, isNew: true, addedAt: "2026-10-10", selection: true,
    description: "Batería portátil compacta para el día a día. Especificaciones técnicas por confirmar.", details: ["Capacidad de ejemplo", "Especificaciones reales: pendiente"], care: ["Mantener alejada de la humedad"] },
  { id: "bateria-20000", name: "Batería Portátil 20 000 mAh", sub: "baterias", price: 139.00, colors: ["Negro"], sizes: [], capacities: ["20000 mAh"], available: true, addedAt: "2026-09-15",
    description: "Mayor capacidad para jornadas largas. Especificaciones técnicas por confirmar.", details: ["Capacidad de ejemplo", "Especificaciones reales: pendiente"], care: ["Mantener alejada de la humedad"] },
  { id: "bateria-multi", name: "Batería Portátil Flowers", sub: "baterias", price: 119.00, colors: ["Morado"], sizes: [], capacities: ["10000 mAh", "20000 mAh"], available: true, addedAt: "2026-08-18",
    description: "Batería con diseño de la marca, disponible en dos capacidades de ejemplo.", details: ["Elige la capacidad", "Especificaciones reales: pendiente"], care: ["Mantener alejada de la humedad"] }
];

/* Páginas informativas: completa con información real. */
window.FLOWERS_PAGES = {
  contacto: { title: "Contacto", intro: "¿Tienes dudas sobre un producto o un pedido? Escríbenos.", pending: ["Correo de contacto", "Teléfono / WhatsApp", "Horario de atención", "Dirección (si aplica)"] },
  faq: { title: "Preguntas frecuentes", intro: "Aquí irán las respuestas a las dudas más comunes.", pending: ["¿Cómo hago un pedido?", "¿Qué medios de pago aceptan?", "¿Cuánto demora mi pedido?", "¿Cómo cambio un producto?"] },
  envios: { title: "Envíos y cambios", intro: "Información sobre envíos, plazos, costos y cambios.", pending: ["Zonas y costos de envío", "Plazos de entrega", "Política de cambios y devoluciones", "Condiciones del producto para cambios"] },
  tallas: { title: "Guía de tallas", intro: "Medidas de referencia para elegir tu talla. Los valores reales están pendientes de completar.", pending: [] },
  privacidad: { title: "Privacidad y términos", intro: "Políticas de privacidad y términos y condiciones de la tienda.", pending: ["Política de privacidad", "Términos y condiciones", "Política de cookies", "Datos del titular de la tienda"] }
};
