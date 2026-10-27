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
  { id: "ropa", name: "Ropa", tagline: "Prendas con actitud para el día a día.", filters: ["brand", "size", "color", "price", "availability"], sizeType: "ropa",
    subs: [
      { id: "polos", name: "Polos" }, { id: "poleras", name: "Poleras" }, { id: "casacas", name: "Casacas" },
      { id: "pantalones", name: "Pantalones" }, { id: "shorts", name: "Shorts" } ] },
  { id: "calzado", name: "Calzado", tagline: "Pisa fuerte, a tu ritmo.", filters: ["brand", "size", "color", "price", "availability"], sizeType: "calzado",
    subs: [ { id: "zapatillas", name: "Zapatillas" }, { id: "crocs", name: "Crocs" } ] },
  { id: "accesorios", name: "Accesorios", tagline: "Los detalles que completan el outfit.", filters: ["type", "brand", "color", "price", "availability", "size"], sizeType: "otro",
    subs: [
      { id: "gorros", name: "Gorros" }, { id: "medias", name: "Medias" }, { id: "bolsos", name: "Bolsos" },
      { id: "llaveros", name: "Llaveros de Ted x Supreme" } ] },
  { id: "tecnologia", name: "Tecnología", tagline: "Energía para seguir en la calle.", filters: ["capacity", "price", "availability"], sizeType: null,
    subs: [ { id: "baterias", name: "Baterías portátiles" } ] }
];

/* Paleta de colores de producto (nombre → hex). Edita o agrega nombres aquí. */
window.FLOWERS_COLORS = {
  "Negro": "#1d1d22", "Blanco": "#f4f4f6", "Morado": "#5C509C", "Celeste": "#68ACDC",
  "Fucsia": "#E50373", "Gris": "#8b8d94", "Crema": "#e9e2d0", "Verde oliva": "#6b7050", "Azul marino": "#26335c", "Azul": "#2f5fa8", "Marrón": "#6b4a32", "White": "#f4f4f6", "Black": "#1d1d22", "Triple Black": "#1d1d22", "Red": "#c8202f", "Royal Blue": "#2b4fb8"
};
/* Páginas informativas: completa con información real. */
window.FLOWERS_PAGES = {
  contacto: { title: "Contacto", intro: "¿Tienes dudas sobre un producto o un pedido? Escríbenos.", pending: ["Correo de contacto", "Teléfono / WhatsApp", "Horario de atención", "Dirección (si aplica)"] },
  faq: { title: "Preguntas frecuentes", intro: "Aquí irán las respuestas a las dudas más comunes.", pending: ["¿Cómo hago un pedido?", "¿Qué medios de pago aceptan?", "¿Cuánto demora mi pedido?", "¿Cómo cambio un producto?"] },
  envios: { title: "Envíos y cambios", intro: "Información sobre envíos, plazos, costos y cambios.", pending: ["Zonas y costos de envío", "Plazos de entrega", "Política de cambios y devoluciones", "Condiciones del producto para cambios"] },
  tallas: { title: "Guía de tallas", intro: "Medidas de referencia para elegir tu talla. Los valores reales están pendientes de completar.", pending: [] },
  privacidad: { title: "Privacidad y términos", intro: "Políticas de privacidad y términos y condiciones de la tienda.", pending: ["Política de privacidad", "Términos y condiciones", "Política de cookies", "Datos del titular de la tienda"] }
};
