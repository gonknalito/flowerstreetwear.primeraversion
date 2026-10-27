# Pendientes del catálogo (uso interno · no subir a la web pública)

Este documento no contiene costos. No publiques los PDF originales: incluyen la columna «COSTO C/U».

## Productos NO publicados (datos ambiguos)
Faltan estos datos para habilitarlos:

| Producto (nombre del PDF) | Qué falta aclarar |
|---|---|
| BAPE CAMO AMARILLO (tallas «L fit M», S/500) | Tipo de prenda (polo, casaca, etc.) para ubicarlo en su subcategoría |
| BAPE CAMO AZUL (tallas «L Fit M», S/500) | Tipo de prenda |
| PALACE X DEATH NOTE RYUK (S - M - XL, S/500) | Tipo de prenda |
| ASSC X FRAGMENT DESIGN («M fit S», S/350) | Tipo de prenda (el otro ASSC sí dice «Tee») |
| YEEZY GAP BALENCIAGA NO SEAM («L fit XL», S/380) | Tipo de prenda |
| OFF WHITE OOO CRYSTAL PANDA (42 IT, S/4500) | Hay una fila siguiente sin nombre (42 IT, S/2000). No se sabe si es el mismo modelo ni cuál precio corresponde |
| Fila sin nombre (42 IT (9-9.5), S/2000), debajo de Crystal Panda | Nombre del modelo |
| JORDAN 1 X TRAVIS SCOTT TROPICAL PINK (tallas 8 (41), 8.5 (42), 9.5 (43) y precios S/1800 - S/1850 - S/1600) | Qué precio corresponde a cada talla |

## Decisiones tomadas (revisar)
- «TEE» se clasificó como Polos; «HOODIE» y «SUETER» como Poleras; «JORT» como Shorts; «PANTS» como Pantalones; «SOMBREROS BAD BUNNY» como Gorros (única subcategoría de Accesorios con producto).
- JORDAN 1 LOW TRAVIS SCOTT FRAGMENT aparecía repetido (misma talla y precio): se publicó una sola vez.
- En ADIDAS X BAD BUNNY GAZELLE BENITO la talla «6-5(39)» es ambigua (¿6.5?): se omitió. Se publicaron 4.5 (36.5), 5.5 (38) y 6 (38.5).
- Los números entre paréntesis tras una talla, p. ej. «(2)» o «(3)», NO se interpretaron como stock ni se muestran. Si son unidades, indícalo.
- Los guiones entre tallas («8(41) - 9(42.5)») se leyeron como tallas distintas disponibles, no como rangos.
- Tallas mostradas tal como figuran (IT, US, LV, Y). Falta confirmar el sistema de cada una; los números entre paréntesis se muestran igual que en el PDF.
- «L fit M», «M fit S», etc. se conservaron como indica el PDF cuando son un producto publicado (ej. «L (FIT M)»).
- Modelos con colores en filas distintas se unieron en un solo producto con variantes de color y sus tallas/precios: VALLEY DREAMS JORT (Negro S/800; Azul y Marrón S/950), VALLEY DREAMS PANTS, ADISTAR PW JELLYFISH, AIR FORCE 1 X SUPREME y AIR MAX 2001 X SUPREME.
- Únicamente «SOMBREROS BAD BUNNY» tiene stock explícito («uno en stock» → 1 unidad).
- Los precios usados son «PRECIO C/U» (ropa) y «PRECIO DE C/U (MAX-MIN)» (sneakers). Se editan en js/catalogo.js.
- Categorías ocultas por no tener productos: Tecnología (Baterías), Crocs, Medias, Bolsos, Llaveros.

## Fotos pendientes
Solo hay foto de OFF WHITE OOO REVERSE PANDA. Falta foto (modelo y color exactos) de los demás 58 productos publicados; la carpeta «fotos de las prendas» estaba vacía.
Cómo agregarlas: copia las imágenes a assets/img/productos/ y escribe sus rutas en el campo images del producto en js/catalogo.js (puedes poner varias).
