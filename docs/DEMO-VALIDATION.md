# Demostración de Importadora Valiente

Implementación lista para carga controlada. Se ejecutó el seed varias veces y se validó el flujo en PostgreSQL en memoria (PGlite), con las migraciones reales del repositorio. No se cargaron datos en Supabase remoto: el entorno contiene únicamente `.env.example`, sin conexión/credenciales de la base publicada. Tampoco se realizó una sesión de navegador contra producción. Las pruebas de interfaz son lógicas, ejecutan componentes reales con hooks/IO controlados.

## 1. Estructura actual del catálogo

`products` almacena identidad, nombre, slug, descripción y publicación. `product_categories` relaciona productos y `categories`. `product_variants` contiene SKU único, presentación, precio y estado; `inventory` contiene una fila por variante y su umbral bajo. `inventory_movements` registra entradas/salidas. `product_images` es opcional y no se modifica en el seed.

El admin crea productos mediante RPCs validadas, incluyendo inventario/movimiento inicial. El catálogo público pagina/busca/filtra con `catalog_product_page`, bajo RLS. Las variantes se seleccionan por su ID; carrito y checkout vuelven a validar producto, precio y stock en servidor. El seed es una operación SQL administrativa explícita, no una nueva vía pública de escritura.

## 2–3. Carga demo y archivo

Archivo: **`supabase/seed-demo.sql`**. Transacción única con bloqueo para serializar ejecuciones del seed; usa slugs, SKU y código de cupón como claves naturales.

- Primera ejecución: 25 productos, 61 variantes, 61 inventarios, 61 movimientos iniciales, un tag, 25 relaciones de tag y un cupón.
- Segunda ejecución: conserva IDs, cantidades y movimientos; no duplica registros.
- Después de una venta: conserva stock consumido, pedidos, precios históricos y cambios manuales.
- No modifica precios/descripciones/estados de demos ya existentes ni reinicia un cupón editado; esas decisiones administrativas se conservan.
- Reutiliza categorías por slug o nombre normalizado (mayúsculas/acentos). Activa las categorías reutilizadas sin cambiar sus nombres, slugs válidos o descripciones.
- Si un slug/SKU pertenece a otro producto, o el cupón ya existe fuera de este seed, aborta sin apropiarse de los datos reales. No hay TRUNCATE, borrado de usuarios/pedidos ni desactivación de RLS.
- No se ejecuta desde React, arranque, migraciones de esquema ni el seed anterior. Las pruebas usan una base descartable.

## 4–6. Categorías, productos y variantes

Categorías: **Tecnología, Hogar, Accesorios, Oficina y Viaje**. Se crearon y verificaron **25 productos y 61 variantes en la base de pruebas**. En remoto se crearán al ejecutar el archivo.

Los precios son importes en la moneda configurada por `site_settings.currency` (GTQ en las migraciones actuales). No se modifica la moneda ni se introducen conversiones.

| Producto | Categoría | Variantes | Rango de precio |
| --- | --- | ---: | ---: |
| Audífonos Bluetooth Demo | Tecnología | 3 | 199–209 |
| Power Bank Demo | Tecnología | 2 | 159–269 |
| Cargador USB-C Demo | Tecnología | 3 | 89–189 |
| Smartwatch Demo | Tecnología | 3 | 499–529 |
| Cable USB-C Demo | Tecnología | 3 | 35–65 |
| Termo Acero Inoxidable Demo | Hogar | 3 | 99–159 |
| Lámpara LED de Escritorio Demo | Hogar | 2 | 179–189 |
| Organizador Multipropósito Demo | Hogar | 3 | 45–95 |
| Báscula Digital Demo | Hogar | 1 | 149–149 |
| Botella Deportiva Demo | Hogar | 2 | 59–79 |
| Mochila Urbana Demo | Accesorios | 3 | 249–259 |
| Billetera Demo | Accesorios | 2 | 89–95 |
| Gorra Ajustable Demo | Accesorios | 3 | 65–69 |
| Paraguas Automático Demo | Accesorios | 3 | 99–109 |
| Lentes de Sol Demo | Accesorios | 3 | 119–139 |
| Mouse Inalámbrico Demo | Oficina | 2 | 89–99 |
| Teclado Inalámbrico Demo | Oficina | 2 | 189–199 |
| Soporte para Laptop Demo | Oficina | 2 | 209–229 |
| Hub USB-C Demo | Oficina | 3 | 199–399 |
| Pad de Escritorio Demo | Oficina | 3 | 69–139 |
| Organizador de Equipaje Demo | Viaje | 2 | 99–169 |
| Almohada de Viaje Demo | Viaje | 3 | 89–95 |
| Adaptador Universal Demo | Viaje | 1 | 159–159 |
| Báscula para Equipaje Demo | Viaje | 1 | 119–119 |
| Mochila de Viaje Demo | Viaje | 3 | 349–599 |

Todos los SKU comienzan con `DEMO-`. Hay productos de una, dos y tres variantes. Los 25 se publican al insertarse por primera vez.

## 7. Tag demo

No existía un sistema de etiquetas de productos. Se añadieron las tablas normalizadas `tags` y `product_tags`, con unicidad por slug y por pareja producto/tag, claves foráneas, índice y RLS. Los repositorios públicos recuperan las etiquetas como datos del producto.

Identificación SQL real:

```sql
select p.id, p.name, p.slug, v.sku
from public.products p
join public.product_tags pt on pt.product_id = p.id
join public.tags t on t.id = pt.tag_id
join public.product_variants v on v.product_id = p.id
where t.slug = 'demo' and v.sku like 'DEMO-%'
order by p.name, v.sku;
```

No se simula el tag mediante texto en la descripción. No se añadió una interfaz de edición de tags ni un segundo catálogo.

## 8–9. PruebaEstudiante y resultado del 10%

Se almacena como **PRUEBAESTUDIANTE**, siguiendo la normalización existente; el cliente puede escribir **PruebaEstudiante**. Tipo `percentage`, valor `10`, activo, mínimo `0`, sin límite de usos y sin fechas obligatorias.

Resultados comprobados:

- Subtotal 100: descuento 10; retiro gratuito: total 90.
- Pedido A: subtotal 159; descuento 15.90; envío existente de prueba 35; total 178.10.
- Pedido B sin cupón: subtotal 599; descuento 0; envío 35; total 634.
- Código `PruebaEstudianteIncorrecto`: preview inválido y checkout rechazado, sin crear pedido.
- `orders.discount` y `coupon_redemptions.amount_discounted` conservan el descuento. El propietario y el administrador pueden consultarlo; otro cliente no.
- Checkout, detalle del cliente y detalle administrativo ya muestran subtotal/descuento/envío/total y usan los snapshots existentes. No se cambió su fórmula ni se aceptan totales enviados por el navegador.

## 10. Inventario

Cada variante tiene inventario inicial positivo y movimiento `in` con referencia `demo_seed`. Tres variantes de audífonos tienen cantidad 2 y umbral 3. Las demás cantidades varían entre 5 y 30. No hay imágenes almacenadas ni solicitudes a un placeholder externo por ausencia de imagen.

Pruebas aprobadas: agregar variante concreta; exceso de stock rechazado; pedido pendiente no descuenta stock; webhook de aprobación descuenta una vez y registra salida; evento repetido no repite descuento; stock agotado después del checkout produce `payment_review`, sin stock negativo ni salida indebida. Repetir el seed después de una venta no repone stock.

La lógica productiva existente no se alteró. El simulador de pago funciona solamente fuera de producción; el proveedor real continúa pendiente. En Vercel se pueden crear pedidos pendientes, pero este trabajo no habilita una pasarela real ni elimina la protección del simulador.

## 11–15. Usuarios, pedidos y aislamiento

- Usuario A crea Pedido A usando Power Bank de 10,000 mAh con el cupón; se guardan propietario, número, estado, fecha, moneda, importes, líneas y variante.
- Usuario B crea Pedido B con Mochila de Viaje de 40 litros sin cupón.
- A consulta solo A. B consulta solo B.
- Consultas directas por ID/número de orden ajena y por `order_items.order_id` ajeno devuelven cero filas para ambos.
- Admin consulta ambos pedidos y el detalle del pedido con descuento, cliente, variante, cantidades e importes.
- La edición posterior del precio de catálogo no cambia `order_items.unit_price` ni el total histórico.
- Las acciones/repositorios mantienen `getUser()`, filtro de propietario en cuenta y verificación de rol en administración. No se introdujo un parámetro de usuario controlado por el navegador.

La prueba ejecuta RLS/RPCs reales bajo roles PostgreSQL. Auth/Storage y el contexto JWT se suministran mediante el harness de prueba; no se prueba aquí GoTrue/PostgREST remoto ni sesiones HTTP de Vercel. Las pruebas anteriores de funciones del servidor y autorización también siguen pasando.

## 16. RLS revisada/modificada

`orders`, `order_items` y `profiles` conservan la reparación `202609190001_account_admin_isolation.sql`: propietario para clientes; lectura operativa para admin/operator; gestión de roles solo admin y escrituras críticas por RPC. La consulta administrativa no añade `auth.uid()` como filtro de propietario. Los errores siguen siendo errores, no listas vacías.

Nueva RLS: etiquetas visibles cuando corresponden a productos públicos; relaciones de productos no publicados ocultas al público; escritura de tags/relaciones solo admin. Se probaron acceso anónimo, ocultamiento y rechazo de escritura de cliente. No se añadieron políticas abiertas a pedidos.

## 17–19. Archivos, migración y scripts

- `supabase/migrations/202609190002_product_tags.sql`: tablas/índice/privilegios/RLS de etiquetas.
- `supabase/seed-demo.sql`: carga SQL completa independiente.
- `src/repositories/products/index.js`, `src/features/catalog/catalog-utils.js`: consulta/normalización de tags y ausencia de imagen representada por null.
- `src/components/store/product-image-fallback.js`, `product-card.js`, `product-gallery.js`, `src/components/cart/cart-item.js`, `src/app/globals.css`: fallback neutro “Imagen no disponible”, sin archivos ni URLs falsas.
- `src/components/store/product-variant-selector.js`: reinicia cantidad al cambiar variante, evitando conservar una cantidad mayor al nuevo stock.
- `tests/demo-flow.test.mjs`: seed repetido, catálogo, cupón, checkout, RLS, snapshots, pagos y movimientos en PostgreSQL.
- `tests/demo-ui.test.mjs`: ejecuta el selector real y comprueba cambio de SKU/precio/stock/cantidad y galería sin imagen.
- `docs/DEMO-VALIDATION.md`: este informe; `docs/SECURITY.md`: matriz RLS actualizada con las etiquetas.

No se creó un script de borrado ni se modificaron usuarios/pedidos reales. No se cambiaron dependencias; se reutilizan PGlite, React y el compilador de Next ya instalados.

## 20. Comando exacto de carga

Desde la raíz del repositorio, en PowerShell, con `psql` instalado y `SUPABASE_DB_URL` definido en tu terminal con la conexión PostgreSQL de tu proyecto (no la URL HTTP de Supabase):

```powershell
psql "$env:SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql
```

Alternativa sin CLI: abrir el SQL Editor del proyecto Supabase, pegar el **archivo completo** `supabase/seed-demo.sql` y ejecutarlo con el rol administrativo postgres. El resumen devuelve productos/variantes y moneda. La carga completa revierte si encuentra un conflicto.

## 21. Limpieza

No se creó un comando de eliminación: los movimientos de inventario y los pedidos existentes mantienen referencias que deben preservarse. La consulta del apartado 7 identifica los datos. Se pueden despublicar los productos identificados desde administración para retirarlos del catálogo conservando todo el historial.

## 22–23. Validaciones técnicas

- `npm install`: correcto; auditoría de instalación con 0 vulnerabilidades.
- `npm run lint`: correcto.
- `npm run build`: correcto, Next.js 16.3.5.
- `npm test`: **99 pruebas aprobadas, 0 fallos y 0 omitidas**; incluye las pruebas nuevas de demo y las existentes.
- No existe script `test:e2e`. No se afirma una validación visual o HTTP en producción.

## 24. Pasos manuales en Supabase/Vercel

1. Confirmar que Vercel apunta al Supabase esperado y que las migraciones anteriores, incluida la reparación de cuentas, están aplicadas.
2. Aplicar **`supabase/migrations/202609190002_product_tags.sql` una vez**, antes de desplegar la consulta que utiliza tags. Con CLI:
   ```powershell
   psql "$env:SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/202609190002_product_tags.sql
   ```
   También puede ejecutarse completo en SQL Editor. Si utilizas el historial de Supabase CLI, aplica las migraciones pendientes mediante su flujo habitual.
3. Ejecutar el seed con el comando del apartado 20.
4. Desplegar el código actualizado a Vercel. El SQL directo no invalida los tags de caché de Next: las categorías/detalles tienen revalidación de 300 segundos; sitemap de 3.600. Esperar su revalidación si se prueba sobre un despliegue existente. El listado paginado se consulta directamente.
5. Verificar `/productos?q=Demo` (paginado), las cinco categorías y dos cuentas independientes; crear pedidos reales de demostración y comprobarlos en cuenta/admin.
6. Cargar imágenes manualmente cuando se desee. Volver a ejecutar el seed no las borra ni agrega imágenes falsas.

No ejecutar `supabase db reset` ni `supabase/seed.sql` sobre la base productiva para esta carga.

## 25. Variables de entorno

Ninguna variable nueva para la aplicación/Vercel. `SUPABASE_DB_URL` es solo una variable opcional de la terminal para el comando psql; no se agrega a archivos ni al frontend. Con SQL Editor no se necesita. Se mantienen la configuración pública de Supabase y los secretos existentes de pagos, siempre privados.
