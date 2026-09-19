# Auditoría de seguridad y matriz RLS

Estado efectivo esperado después de aplicar todas las migraciones hasta `202609190001_account_admin_isolation.sql`. “Cliente CRUD” se limita siempre a filas cuya propiedad deriva de `auth.uid()`; la tabla puede imponer además RPC para mutaciones.

| Tabla | RLS | Público SELECT | Cliente SELECT | Cliente INSERT/UPDATE/DELETE | Administración |
|---|---:|---:|---:|---|---|
| `profiles` | Sí | No | Propio | UPDATE propio de nombre/teléfono, sin `role`/`email`; sin INSERT/DELETE | Lectura interna; rol por RPC auditada |
| `addresses` | Sí | No | Propias | CRUD propio, propietario inmutable | SELECT normal propio; lectura operativa por `admin_customer_addresses`, validada por rol |
| `categories` | Sí | Solo activas | Activas | No | Admin |
| `products` | Sí | Solo publicados | Publicados | No | Admin |
| `product_categories` | Sí | Relaciones activas | Relaciones activas | No | Admin |
| `product_variants` | Sí | Activas de producto publicado | Igual | No | Admin |
| `product_images` | Sí | De producto publicado | Igual | No | Admin |
| `inventory` | Sí | De variante/producto activos | Igual | No | Lectura interna; ajuste admin por RPC |
| `inventory_movements` | Sí | No | No | No | Lectura interna; escritura RPC/admin |
| `carts` | Sí | No | Propios | RPC de carrito | Admin |
| `cart_items` | Sí | No | Del carrito propio | RPC de carrito | Admin |
| `orders` | Sí | No | Propias | No | Lectura interna; transición por RPC |
| `order_items` | Sí | No | De orden propia | No | Lectura interna |
| `payments` | Sí | No | De orden propia | No | Lectura interna; backend/RPC |
| `payment_webhook_events` | Sí | No | No | No | Lectura interna; service role procesa |
| `shipments` | Sí | No | De orden propia | No | Lectura interna; admin/RPC |
| `coupons` | Sí | No | Solo si posee redención | No | Admin/RPC |
| `coupon_redemptions` | Sí | No | Propias | No | Admin; checkout RPC crea |
| `site_settings` | Sí | Sí | Sí | No | Admin/RPC |
| `banners` | Sí | Solo activos y vigentes | Igual | No | Admin/RPC |
| `shipping_methods` | Sí | Solo activos | Igual | No | Admin/RPC |
| `audit_logs` | Sí | No | No | No | Solo admin lee; RPC escriben |

## Controles complementarios

- `/admin` valida sesión/rol en layout de servidor; páginas sensibles usan además `AdminOnlyLayout`.
- Cada Server Action administrativa llama `requireAdmin()` o `requireInternal()` y las RPC vuelven a comprobar el rol.
- `profiles.role` es la única fuente de autoridad (`customer`, `operator`, `admin`). El servidor verifica `getUser()`, perfil y coherencia con el helper RLS. Un perfil faltante o un error de permisos produce un error explícito.
- Las consultas personales de direcciones, pedidos y pagos filtran por usuario incluso cuando la sesión es administrativa.
- Auth crea perfiles y sincroniza únicamente su correo; el backfill conserva IDs, roles y datos existentes. La administración usa `profiles` y no necesita enumerar `auth.users` con la service role.
- `/cuenta/*` y `/admin/*` son dinámicas. Los clientes privados usan `no-store`; el proxy conserva los encabezados anticaché al refrescar cookies.
- `SUPABASE_SERVICE_ROLE_KEY` solo se importa desde `src/lib/supabase/admin.js`, marcado `server-only`.
- Storage es públicamente legible pero solo `admin` puede escribir/eliminar; MIME, tamaño y ruta se validan en servidor.
- Checkout relee precios, cupón, envío y stock en PostgreSQL. El navegador solo presenta una vista previa.
- Webhooks verifican firma/raw body antes de parsear y usan unicidad de evento, locks y movimientos únicos.
- Los snapshots de `order_items` y dirección conservan historia aunque cambie el catálogo.

## Verificaciones obligatorias en un entorno real

Usa Cliente A y Cliente B para consultar manualmente por UUID ajeno `profiles`, `addresses`, `carts`, `orders`, `order_items`, `payments`, `shipments` y redenciones; el resultado debe ser cero filas/404. Prueba también que customer/operator no puedan cambiar catálogo, stock, pago, configuración, cupón, banner o rol. `tests/account-rls.test.mjs` ejecuta todas las migraciones, políticas, triggers y checkout en PostgreSQL en memoria (PGlite), con un esquema mínimo de Auth/Storage y JWT simulados. `tests/account-server.test.mjs` ejecuta funciones del servidor con dependencias de red controladas. No sustituyen la validación HTTP con Supabase Auth/PostgREST y Vercel publicados. Consulta `ACCOUNT-ADMIN-REPAIR.md` y el diagnóstico SQL de solo lectura para aplicar la reparación.

