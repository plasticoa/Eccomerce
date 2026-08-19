# Importadora Valiente — E-commerce

Aplicación de comercio electrónico construida de forma incremental. La Iteración 2 incorpora el flujo de compra previo al pago sobre la base técnica, autenticación y catálogo existentes.

## Stack

- Next.js 16 con App Router y JavaScript (sin TypeScript)
- React
- Supabase: PostgreSQL, Auth, Row Level Security y Storage
- `@supabase/ssr` para sesiones basadas en cookies
- Vercel como destino de despliegue

La arquitectura es un monolito modular: Next.js concentra UI, renderizado, Server Actions, Route Handlers y lógica de servidor; Supabase concentra identidad, datos, autorización y archivos.

## Requisitos

- Node.js 20.9 o posterior (se recomienda Node.js 22 LTS)
- npm
- Un proyecto de Supabase
- Supabase CLI opcional para desarrollo local y migraciones por terminal
- Una cuenta de Vercel para publicar

## Instalación y ejecución

```bash
npm install
copy .env.example .env.local
npm run dev
```

En macOS/Linux, sustituye `copy` por `cp`. La aplicación queda disponible en `http://localhost:3000`.

Comandos de calidad y producción:

```bash
npm run lint
npm run build
npm start
```

## Variables de entorno

| Variable | Contexto | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Público | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Público | Clave publicable recomendada actualmente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público | Compatibilidad con proyectos que aún usan anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | Operaciones backend que omiten RLS |
| `NEXT_PUBLIC_SITE_URL` | Público | Origen de la app, sin `/` final |

El código prioriza `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y usa `NEXT_PUBLIC_SUPABASE_ANON_KEY` como alternativa. No es necesario configurar ambas. La `service role` está aislada en `src/lib/supabase/admin.js`, que importa `server-only`; nunca debe llevar el prefijo `NEXT_PUBLIC_` ni usarse desde un Client Component.

`.env.local` está ignorado por Git. No copies secretos al README ni a commits.

## Configuración de Supabase

1. Crea o selecciona un proyecto existente en Supabase.
2. Copia la URL y clave publicable desde **Project Settings → API Keys** a `.env.local`.
3. Ejecuta la migración `supabase/migrations/202608100001_initial_schema.sql`.
4. En **Authentication → URL Configuration**, configura:
   - Site URL local: `http://localhost:3000`
   - Redirect URL local: `http://localhost:3000/auth/callback`
   - Site URL de producción: el dominio definitivo de Vercel
   - Redirect URL de producción: `https://TU-DOMINIO/auth/callback`
5. Mantén habilitado el proveedor Email y decide si exigirás confirmación de correo.
6. Para producción, configura SMTP propio; el envío de prueba integrado de Supabase tiene límites bajos.

El registro y la recuperación usan PKCE: Supabase redirige a `/auth/callback`, el Route Handler intercambia el `code` por una sesión en cookies y continúa a `/cuenta` o a `/auth/actualizar-contrasena`.

### Ejecutar migraciones

Con Supabase CLI vinculado a un proyecto remoto:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

Para desarrollo local:

```bash
supabase start
supabase db reset
```

Si no tienes Supabase CLI instalado globalmente, puedes usar `npx supabase start` y `npx supabase db reset`. `supabase/config.toml` contiene los puertos y la configuración local versionada del proyecto.

También puedes pegar el contenido de la migración en **SQL Editor** y ejecutarlo una sola vez. La CLI es preferible porque conserva el historial versionado.

### Crear el primer administrador

Todo registro público nace como `customer`. Después de crear y confirmar la cuenta, promueve al primer administrador desde SQL Editor usando una sesión de propietario de base de datos:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'correo-del-admin@ejemplo.com');
```

No existe una pantalla cliente para asignar roles. Las promociones futuras deberán ejecutarse desde backend confiable con `service role` o por un operador de base de datos.

## Seguridad de roles y RLS

La autorización combina cuatro defensas:

1. El trigger de alta inserta siempre `role = 'customer'`; ignora cualquier rol enviado en metadatos.
2. `profiles` permite a cada usuario leer su fila y actualizar solo `full_name` y `phone`.
3. `profiles_protect_role` rechaza cualquier cambio de rol salvo desde `service_role` o administración directa de la base.
4. `/admin` obtiene el usuario y el perfil en servidor y exige `operator` o `admin`; no depende de ocultar enlaces en el navegador.

Las funciones `is_internal_user()` e `is_admin()` son `SECURITY DEFINER`, tienen `search_path` vacío y consultan `profiles` sin recursión RLS. Su ejecución pública está revocada y solo se concede a sesiones autenticadas.

RLS está activo en las 20 tablas del esquema público:

- visitantes: solo contenido activo de categorías, productos, variantes, imágenes, banners vigentes y configuración pública;
- clientes: su perfil, direcciones, carrito y consultas de sus pedidos, pagos, envíos y redenciones;
- clientes no pueden escribir pedidos, pagos, envíos, inventario ni auditoría;
- personal interno: políticas preparadas para administración de las entidades operativas;
- auditoría: lectura limitada a `admin`; las escrituras se reservan al backend confiable.

La clave `service role` omite RLS por diseño de Supabase, por eso solo existe en el cliente servidor aislado.

## Base de datos

La migración inicial crea:

- identidad: `profiles`, `addresses`;
- catálogo: `categories`, `products`, `product_categories`, `product_variants`, `product_images`;
- inventario: `inventory`, `inventory_movements`;
- carrito: `carts`, `cart_items`;
- pedidos: `orders`, `order_items`;
- operación: `payments`, `shipments`;
- promociones: `coupons`, `coupon_redemptions`;
- personalización: `site_settings`, `banners`;
- trazabilidad: `audit_logs`.

Las órdenes conservan snapshots de SKU, nombre y precio. Las referencias históricas sensibles usan `RESTRICT` o `SET NULL`; `CASCADE` se limita a composiciones claras como producto-variante, carrito-items y pedido-items. Hay restricciones monetarias y de cantidades no negativas, unicidad para slugs/SKU/número de orden, una sola imagen principal y un solo carrito activo por cuenta.

## Storage

La migración prepara los buckets `products`, `branding` y `banners`, con límites de tamaño y MIME de imagen. Los archivos son públicamente legibles porque están destinados al escaparate; las políticas de escritura, modificación y borrado exigen un rol interno. Esta iteración no incluye uploader.

## Arquitectura de carpetas

```text
src/
  app/                 rutas, layouts, Server Components y callback
  components/          UI compartida por tienda, auth y administración
  features/auth/       Server Actions de autenticación
  features/*/          límites vacíos para módulos de iteraciones futuras
  lib/auth/            helpers de identidad y roles
  lib/supabase/        clientes browser, server, admin y propagación de sesión
  repositories/        acceso a datos futuro
  services/            orquestación de negocio futura
  utils/               utilidades futuras
supabase/
  migrations/          SQL versionado
  seed.sql             semillas locales futuras
```

Next.js 16 renombró Middleware a Proxy. Por ello `src/proxy.js` propaga/refresca la sesión, mientras la autorización definitiva se vuelve a verificar en los layouts de servidor de `/cuenta` y `/admin`.

## Rutas implementadas

| Ruta | Acceso | Estado |
|---|---|---|
| `/` | Público | Placeholder profesional de la tienda |
| `/auth/login` | Público, redirige si ya hay sesión | Login |
| `/auth/registro` | Público, redirige si ya hay sesión | Registro customer |
| `/auth/recuperar` | Público | Solicitud de recuperación |
| `/auth/callback` | Público | Intercambio PKCE y cookies |
| `/auth/actualizar-contrasena` | Sesión de recuperación | Cambio de contraseña |
| `/cuenta` | Usuario autenticado | Perfil y estado de sesión |
| `/admin` | `operator` o `admin` | Dashboard placeholder protegido |
| `/no-autorizado` | Público | Respuesta a falta de permisos |

Los formularios muestran carga, deshabilitan el botón, evitan envíos duplicados y presentan confirmaciones o errores comprensibles.

## Despliegue en Vercel

1. Importa este repositorio en Vercel; Framework Preset debe detectar **Next.js**.
2. No cambies Build Command (`npm run build`) ni Output Directory.
3. Agrega las variables del `.env.example` en **Project Settings → Environment Variables** para Production y Preview. La `SUPABASE_SERVICE_ROLE_KEY` debe mantenerse secreta.
4. Define `NEXT_PUBLIC_SITE_URL` con el dominio de producción.
5. Despliega.
6. Añade el dominio real y la URL `/auth/callback` a las URLs permitidas en Supabase Auth.
7. Si usarás previews con autenticación, agrega sus URLs explícitas o un patrón de preview limitado en Supabase.

No hay archivos de vínculo `.vercel` porque no existía un proyecto enlazado en este repositorio. Vincula uno existente con `vercel link` si corresponde; no crees un proyecto duplicado.

## Alcance de la Iteración 0

Incluido: base Next.js, Supabase SSR, auth por correo/contraseña, logout, recuperación, sesión persistente, rutas protegidas, roles, migración completa, RLS, Storage, layouts responsive, accesibilidad básica y documentación operativa.

Fuera de alcance: catálogo navegable, búsqueda, filtros, ficha de producto, carrito visual, checkout, pagos/webhooks, descuento operativo de inventario, CRUD administrativos, promociones operativas, reportes/KPIs, personalizador, auditoría automática completa y SEO avanzado. Los enlaces administrativos futuros son placeholders no interactivos.

## Iteración 1 — Catálogo público

La Iteración 1 convierte la página pública inicial en un catálogo navegable, manteniendo el carrito y toda operación de compra fuera de alcance.

### Rutas del catálogo

| Ruta | Función |
|---|---|
| `/` | Home con categorías y ocho productos activos recientes |
| `/productos` | Catálogo paginado con filtros por categoría, precio y disponibilidad |
| `/productos/[slug]` | Galería, descripción, variantes, SKU, precio y existencias |
| `/categorias` | Listado de categorías activas |
| `/categorias/[slug]` | Productos activos asociados a una categoría activa |
| `/buscar?q=termino` | Búsqueda compartible por nombre o SKU |

Las páginas de detalle y categoría usan `generateMetadata()` y `notFound()`. Las rutas de catálogo incluyen `loading.js`; el layout público incluye un límite de error que no expone mensajes internos.

### Acceso a datos y consultas

Las páginas no consultan Supabase directamente. Los repositorios viven en:

- `src/repositories/products/index.js`
- `src/repositories/categories/index.js`

`catalog_product_page()` recibe parámetros tipados, aplica búsqueda y filtros en PostgreSQL, pagina primero y devuelve únicamente IDs y el total. Después, una sola consulta relacional recupera productos, variantes, inventario, imágenes y categorías para esos IDs. Esto evita consultas por producto y mantiene páginas de 12 elementos.

La búsqueda:

- normaliza y limita el término a 80 caracteres;
- busca `products.name` y `product_variants.sku`;
- excluye productos y variantes inactivos;
- devuelve cada producto una sola vez aunque varias variantes coincidan;
- no concatena SQL desde la aplicación.

Los filtros se representan mediante URL, por ejemplo:

```text
/productos?categoria=hogar&disponible=true&min=100&max=500&page=2
```

### Variantes, precio y disponibilidad

`ProductVariantSelector` es un Client Component con estado local. Los datos de todas las variantes públicas se entregan en la carga inicial; cambiar la selección no provoca otra consulta. La interfaz actualiza:

- nombre de variante;
- precio y precio comparativo;
- SKU;
- disponibilidad;
- cantidad visible;
- estado visual del CTA.

Las variantes inactivas quedan excluidas por consulta y RLS. Las tarjetas calculan `Desde Q…` cuando existe más de un precio. La moneda se presenta centralmente con `formatCurrency()` y usa GTQ mientras no exista otra configuración cargada.

El botón **Agregar al carrito** nació como CTA preparado en esta iteración y fue conectado al carrito real en la Iteración 2.

### Imágenes y Storage

`ProductGallery` utiliza `next/image`, miniaturas accesibles y fallback. Para rutas relativas, `getProductImageUrl()` genera la URL pública del bucket `products` sin `service role`. Las imágenes absolutas se aceptan para el seed controlado. `next.config.mjs` permite `placehold.co` y, durante el build, el host exacto configurado en `NEXT_PUBLIC_SUPABASE_URL`.

En producción, sube las imágenes al bucket `products` y guarda en `product_images.storage_path` una ruta como `catalogo/taladro/principal.webp`.

### Nueva migración RLS

`supabase/migrations/202608100002_public_catalog.sql` agrega:

- política `inventory_public_read`, que permite leer inventario únicamente cuando la variante está activa y pertenece a un producto publicado;
- permiso `SELECT` de inventario para `anon`;
- función `catalog_product_page()` como `SECURITY INVOKER`, por lo que todas sus consultas siguen sujetas a RLS;
- permisos de ejecución de la función para `anon` y `authenticated`.

No se modificó la migración ya existente y no se usa `service role` para renderizar el catálogo.

### Datos de desarrollo

`supabase/seed.sql` contiene seis categorías y quince productos con datos deterministas. Incluye:

- categoría y producto inactivos;
- productos con una y varias variantes;
- variante inactiva;
- productos y variantes agotadas;
- stock bajo;
- precios distintos y precios comparativos;
- relaciones de múltiples categorías;
- galería con varias imágenes.

Para cargar los datos localmente:

```bash
supabase db reset
```

En un proyecto remoto de desarrollo, aplica primero las migraciones y ejecuta manualmente `supabase/seed.sql` desde SQL Editor. No ejecutes el seed en producción.

### Pruebas del catálogo

```bash
npm test
npm run lint
npm run build
```

Las pruebas unitarias cubren moneda, sanitización de búsqueda, parámetros de filtros, precio mínimo, normalización de variantes y disponibilidad.

Para una validación integrada después de cargar el seed:

1. Abre `/productos` sin sesión y confirma que aparecen 14 productos activos.
2. Busca `taladro` y el SKU `HER-TAL-700`.
3. Confirma que `producto-interno-prueba` devuelve 404 y no aparece en búsquedas.
4. Abre `/categorias/temporada` y confirma que no se expone.
5. Prueba filtros y paginación desde sus URLs.
6. En el detalle del taladro, cambia entre 550 W y 700 W.
7. Con la anon key, intenta actualizar `products` e `inventory`; ambas escrituras deben ser rechazadas.

## Iteración 2 — Compra

Esta iteración conecta el catálogo con un flujo completo de pedido pendiente. Incluye carrito de visitante y autenticado, cuenta de cliente, direcciones, checkout, entrega, creación transaccional de orden, confirmación e historial.

### Rutas de compra y cuenta

| Ruta | Acceso | Función |
|---|---|---|
| `/carrito` | Público | Artículos, cantidades, disponibilidad y subtotal provisional |
| `/checkout` | Autenticado | Dirección, entrega, intención de pago y resumen final |
| `/pedido/confirmacion/[orderNumber]` | Propietario | Confirmación del pedido creado |
| `/cuenta` | Autenticado | Resumen de perfil, direcciones y pedidos |
| `/cuenta/perfil` | Autenticado | Edición limitada a nombre y teléfono |
| `/cuenta/direcciones` | Autenticado | CRUD y dirección predeterminada |
| `/cuenta/pedidos` | Autenticado | Historial del cliente |
| `/cuenta/pedidos/[orderNumber]` | Propietario | Detalle histórico del pedido |

### Estrategia del carrito

El visitante conserva en `localStorage` únicamente un objeto versionado con `variantId` y `quantity`. Nombres, precios, estado del producto y existencias se consultan nuevamente a Supabase; los valores del navegador nunca son autoridad comercial. Un `CartProvider` centraliza persistencia, validación, indicador de unidades y mensajes accesibles.

El usuario autenticado utiliza `carts` y `cart_items`. Las escrituras pasan por funciones SQL `SECURITY DEFINER` pequeñas que derivan la identidad de `auth.uid()`, comprueban producto/variante activos, bloquean la fila de inventario mientras validan y respetan el carrito activo único existente. `reconcile_active_cart()` limita en una sola operación cantidades que hayan quedado por encima de stock y la interfaz muestra la advertencia.

Al iniciar sesión, `merge_guest_cart()` suma las cantidades local y remota por variante, aplica el stock como máximo y evita líneas duplicadas. El UUID del carrito local se registra en `last_merge_token`; repetir la fusión con el mismo token no vuelve a sumar. El carrito local solo se borra después de una fusión exitosa. Cerrar sesión no borra el carrito persistido en la base.

### Perfil y direcciones

El perfil solo actualiza `full_name` y `phone`; el trigger y los privilegios de columnas de la migración inicial siguen protegiendo `role`. Las direcciones reutilizan todos los campos existentes en `addresses`. El trigger `addresses_single_default` desmarca las demás direcciones del mismo perfil dentro de la transacción, y el índice parcial `addresses_one_default_per_profile` garantiza como máximo una predeterminada incluso ante concurrencia.

RLS conserva `profile_id = auth.uid()` para CRUD de direcciones. Las Server Actions vuelven a obtener el usuario y filtran por propietario; nunca reciben un `profile_id` autoritativo del navegador.

### Checkout, entrega y totales

El checkout requiere sesión y conserva `next=/checkout` durante el login. Las opciones implementadas son:

- entrega local: `Q35.00`;
- retiro en tienda: `Q0.00`;
- método de pago preparado: `pending_gateway`.

El navegador calcula únicamente una vista previa. `create_order_from_cart()` vuelve a leer y bloquear carrito, variantes e inventario; usa el precio vigente de `product_variants`, fija descuento en cero y calcula shipping/total en PostgreSQL. No acepta precio, subtotal, shipping, total ni identidad enviados por el cliente.

La función crea de forma atómica `orders`, todos los `order_items` y el `shipment` inicial, y convierte el carrito. Si cualquier validación o inserción falla, la transacción completa revierte. El número legible usa una secuencia y el formato `IV-AAAA-000001`, además de la restricción única ya existente. Un `checkout_token` UUID con índice único por perfil hace idempotente el reenvío del formulario.

Cada `order_item` guarda snapshots de SKU, nombre de producto, nombre de variante, precio unitario, cantidad y total de línea. `orders.shipping_address` conserva un snapshot JSONB de la dirección para que editarla o eliminarla después no altere el pedido histórico. También se guarda el método de entrega y un shipment `pending`.

La orden inicia siempre con `status = 'pending'` y `payment_status = 'pending'`. No se crea un registro de pago aprobado.

### Migración de compra

Aplica, después de las dos migraciones anteriores:

```text
supabase/migrations/202608100003_purchase_flow.sql
```

Agrega tokens de merge y checkout, métodos preparados de entrega/pago, snapshot de variante, datos básicos de shipment, secuencia de pedidos, índices de idempotencia y las RPC seguras de carrito/checkout. Las políticas directas de carrito pasan a lectura para clientes; las mutaciones validadas quedan en RPC.

```bash
supabase db push
```

En local, `supabase db reset` aplica todas las migraciones y vuelve a cargar el seed. Haz respaldo antes de aplicar migraciones a una base con datos reales.

### Seguridad y RLS

- `addresses`, `carts`, `orders`, `order_items` y `shipments` solo exponen filas propias al cliente.
- Los clientes no tienen políticas de escritura para órdenes, items, shipments ni totales.
- Las mutaciones derivan la identidad de `auth.uid()`; las funciones tienen `search_path` vacío y `EXECUTE` revocado para `public` y `anon`.
- La `service role` no se utiliza para catálogo, carrito, cuenta ni checkout.
- Buscar por `order_number` sigue sujeto a RLS, de modo que un pedido ajeno resulta indistinguible de uno inexistente.

### Pruebas

```bash
npm test
npm run lint
npm run build
```

Las pruebas unitarias cubren agregar/incrementar/eliminar, límites de cantidad, normalización, subtotal, variantes inactivas, fusiones vacías y coincidentes, límite de stock, checkout vacío/inválido, precio vigente, shipping y total. Las pruebas de contrato inspeccionan la migración para verificar identidad por `auth.uid()`, snapshots, estados pendientes, idempotencia, ausencia de descuento de inventario y políticas RLS esperadas.

Prueba manual recomendada después de aplicar la migración y seed:

1. Como visitante, agrega dos variantes, navega, cambia cantidades y recarga `/carrito`.
2. Continúa al checkout, inicia sesión y confirma que el carrito se fusionó una sola vez.
3. Crea dos direcciones, marca la segunda como predeterminada, edítala y elimina la primera.
4. Elige entrega local y crea el pedido; verifica confirmación, historial y detalle.
5. Comprueba en SQL que existen una orden, sus items y un shipment pendiente; el inventario debe conservar exactamente las cantidades anteriores.
6. Con dos usuarios, intenta leer por API los IDs de carrito, dirección y pedido del otro; las consultas deben devolver cero filas.
7. Intenta actualizar `orders.total`, `orders.payment_status` e `inventory.quantity` con una sesión customer; RLS debe denegarlo.
8. Envía dos veces el mismo `checkout_token`; debe existir una sola orden.

### Límites expresos

La Iteración 3 agrega la arquitectura de pago, webhook e inventario. El proveedor financiero definitivo sigue pendiente, por lo que no debe confundirse el proveedor técnico de prueba con un cobro real.

## Iteración 3 — Pago e inventario

La Iteración 3 conecta una orden pendiente con intentos de pago, webhook verificado y confirmación transaccional de la venta. No se eligió arbitrariamente un gateway: el repositorio no contenía uno configurado, así que se implementó `TestPaymentProvider`, identificado visualmente como proveedor de prueba y sin comunicación financiera externa.

### Arquitectura

```text
PaymentPanel / Server Action
  -> PaymentService
    -> PaymentProvider (contrato)
      -> TestPaymentProvider (solo desarrollo)
    -> OrderService
      -> InventoryService
        -> RPC transaccional PostgreSQL

POST /api/webhooks/payments/[provider]
  -> verificación del cuerpo RAW y firma
  -> normalización del evento
  -> payment_webhook_events + pago + orden + inventario
```

Las responsabilidades se separan de la siguiente forma:

- `PaymentProvider`: contrato para crear transacciones, verificar/interpretar webhooks, consultar estado y preparar futuros refunds.
- `PaymentService`: inicia intentos, elige adaptador, adjunta la referencia y procesa eventos normalizados.
- `OrderService`: controla qué eventos pueden confirmar una orden.
- `InventoryService`: coordina el commit de venta; la mutación crítica se delega a PostgreSQL.
- `process_payment_webhook()`: garantiza atomicidad e idempotencia persistente.

El futuro adaptador real podrá implementar el mismo contrato sin trasladar lógica específica a órdenes o inventario.

### Proveedor configurado

`TestPaymentProvider` puede simular `pending`, `approved`, `failed` y `cancelled`. Firma el cuerpo exacto con HMAC-SHA256 sobre:

```text
timestamp.rawBody
```

Los headers utilizados son `x-test-timestamp` y `x-test-signature`. La firma vence después de cinco minutos y se compara en tiempo constante. El JSON se interpreta únicamente después de verificar la firma.

Proveedor definitivo pendiente de configuración. El proveedor de prueba no cobra dinero, no tokeniza tarjetas y no debe presentarse como integración financiera de producción.

### Variables nuevas

| Variable | Alcance | Uso |
|---|---|---|
| `PAYMENT_PROVIDER` | Servidor | `test` durante desarrollo; en producción debe ser el adaptador real seleccionado |
| `PAYMENT_TEST_WEBHOOK_SECRET` | Servidor secreto | Firma HMAC de eventos de prueba, mínimo 16 caracteres |
| `PAYMENT_TEST_MODE_ENABLED` | Servidor | `true` habilita controles de simulación fuera de producción |

Ninguna usa el prefijo `NEXT_PUBLIC_`. El webhook también utiliza `SUPABASE_SERVICE_ROLE_KEY`, ya aislada en `src/lib/supabase/admin.js`, para invocar la RPC que no está concedida a `anon` ni `authenticated`.

Configuración local orientativa, solo en `.env.local`:

```text
PAYMENT_PROVIDER=test
PAYMENT_TEST_WEBHOOK_SECRET=GENERA_UN_SECRETO_LOCAL_LARGO
PAYMENT_TEST_MODE_ENABLED=true
```

En producción no se habilitan los controles de simulación aunque esas variables se envíen incorrectamente.

### Inicio, reintentos e historial

El detalle y la confirmación muestran **Pagar pedido**. La Server Action revalida sesión y formato; `create_payment_attempt()` vuelve a obtener propietario, total y moneda directamente desde `orders`.

- Una orden conserva múltiples intentos fallidos/cancelados.
- Un intento pendiente o procesando se reutiliza para evitar cobros simultáneos.
- `(order_id, provider, idempotency_key)` evita duplicados de doble clic.
- Una orden aprobada no admite otro inicio accidental.
- Reintentar no crea una segunda orden.

El detalle muestra estado, proveedor, referencia no sensible, importe y fecha. `/api/payments/[paymentId]/status` devuelve únicamente el estado mínimo de un pago visible por RLS para su propietario. `/pago/resultado?pedido=...` nunca confía en un `status` del navegador: relee la orden y muestra “Estamos confirmando tu pago” hasta recibir confirmación autoritativa.

### Webhook e idempotencia

El endpoint es:

```text
POST /api/webhooks/payments/[provider]
```

Lee `request.text()` una sola vez y entrega el cuerpo RAW al adaptador. Una firma inválida responde 401 y no crea eventos. Los eventos verificados se guardan en `payment_webhook_events` con estados `processing`, `processed`, `failed` o `ignored`.

La restricción única `(provider, provider_event_id)` funciona entre procesos e instancias Vercel. Un evento repetido o simultáneo responde 2xx sin repetir transiciones ni inventario. Solo se conservan metadatos normalizados; no se guarda el payload completo, PAN, CVV, cookies, secretos ni tokens.

### Confirmación e inventario

`process_payment_webhook()` se concede únicamente a `service_role` y ejecuta en una transacción:

1. registra/idempotentiza el evento;
2. bloquea orden y payment attempt;
3. valida referencia, monto y moneda contra `payments` y `orders`;
4. bloquea inventario por variante en orden consistente;
5. vuelve a validar todas las cantidades;
6. descuenta con `quantity >= cantidad` como condición;
7. crea un `inventory_movement` por variante;
8. marca payment `approved`, orden `confirmed` y `payment_status = approved`;
9. registra auditoría mínima.

La convención de movimiento es cantidad firmada: una venta de dos unidades guarda `quantity = -2` y `movement_type = 'out'`. `reference_type = 'order'` y `reference_id = order.id` explican el motivo. El índice único por orden/variante impide un segundo movimiento de venta.

El `CHECK inventory.quantity >= 0`, los bloqueos `FOR UPDATE`, el orden consistente de locks y el `UPDATE ... WHERE quantity >= requerida` impiden stock negativo incluso si dos órdenes intentan consumir la última unidad.

Si el proveedor reporta aprobación pero falta stock, monto o moneda no coinciden, el sistema no inventa un refund: payment queda `approved`, la orden pasa a `payment_review`, no se descuenta inventario y el evento registra el código de inconsistencia para intervención posterior.

Eventos `failed` o `cancelled` solo actualizan el intento. La orden permanece pendiente y no se crean movimientos. Un evento tardío no puede degradar un pago ya aprobado.

### Nueva migración y RLS

Aplica después de las migraciones anteriores:

```text
supabase/migrations/202608100004_payments_inventory.sql
```

Agrega campos de moneda, idempotencia, estado del proveedor, error, metadata segura y timestamps a `payments`; crea `payment_webhook_events`; amplía estados controlados; añade índices de intento/evento/movimiento y las RPCs de inicio, referencia y procesamiento.

RLS permanece habilitado:

- clientes solo leen payments pertenecientes a sus órdenes;
- clientes no insertan ni actualizan payments directamente;
- clientes no leen ni mutan eventos webhook;
- clientes no actualizan inventory ni insertan movimientos de venta;
- `create_payment_attempt()` y `set_payment_provider_reference()` derivan identidad de `auth.uid()`;
- la confirmación crítica solo puede ejecutarla el backend con `service_role`.

### Simulación local

1. Configura las tres variables de prueba en `.env.local`.
2. Aplica migraciones y seed con `supabase db reset`.
3. Crea una orden desde checkout.
4. En confirmación, pulsa **Pagar pedido**.
5. Usa **Simular aprobación**, **Simular fallo** o **Simular cancelación**.
6. Verifica el intento, evento, orden, inventario y movimiento en Supabase.

Los botones de simulación generan internamente el mismo cuerpo y firma que verifica `PaymentService`. Para invocar el webhook directamente, calcula HMAC-SHA256 de `timestamp.rawBody` con `PAYMENT_TEST_WEBHOOK_SECRET` y envía ambos headers; nunca coloques el secreto en código cliente o documentación compartida.

### Pruebas

```bash
npm test
npm run lint
npm run build
```

Las pruebas cubren normalización, contrato, firma válida/inválida/caducada, modificación del raw body, creación de intento con monto del servidor, separación de pago fallido/aprobado, stock suficiente/insuficiente y configuración de producción. Las pruebas de contrato SQL verifican idempotencia, monto, moneda, locks, update condicional, movimiento negativo, `payment_review`, RLS y acceso exclusivo del backend.

Después de configurar Supabase, prueba además dos webhooks simultáneos, dos órdenes sobre una sola unidad y acceso cruzado con dos usuarios. Esas pruebas requieren PostgreSQL real para validar el comportamiento concurrente, no solo mocks.

### Límites y siguiente iteración

No se implementan gateway real, tarjetas, refunds, conciliación avanzada, reservas temporales, devoluciones, administración manual ni dashboard. La restauración de stock queda expresamente preparada pero bloqueada hasta definir una transición autorizada.

La Iteración 4 podrá construir CRUD y operación administrativa de pedidos, inventario, clientes, catálogo y roles sobre esta trazabilidad. Antes de desplegar pagos reales debe seleccionarse el proveedor definitivo, implementar su adaptador/SDK y firma oficial, configurar secretos en Vercel y realizar pruebas sandbox/certificación del proveedor.
