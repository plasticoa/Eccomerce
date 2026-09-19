# Entrega: pedidos, pagos manuales e inventario apartado

Implementado en el repositorio el 19/09/2026. Validado con PostgreSQL embebido (PGlite); no se aplicaron cambios a un proyecto Supabase remoto ni se desplegó a Vercel.

1. **Antes:** `create_order_from_cart` creaba pedido, snapshots, envío y cupón sin reservar inventario. El adaptador de desarrollo `TestPaymentProvider` simulaba pagos; `process_payment_webhook` aprobaba y descontaba stock. No había un proveedor financiero real integrado.
2. **Pasarela desacoplada:** checkout/confirmación/cuenta ya no montan `PaymentPanel` ni cargan configuración del proveedor. Las dos Server Actions antiguas devuelven un mensaje de deshabilitado. El webhook devuelve HTTP 410 sin procesar eventos. La migración elimina las tres RPC ejecutables de pasarela. Se preservan los registros históricos, la tabla de eventos y módulos antiguos sin consumidores activos en el flujo de compra. La ruta antigua de resultado redirige a la cuenta. Las variables PAYMENT_* dejan de ser requeridas.
3. **Checkout:** selección de dirección, entrega, cupón y pago, seguida de “Confirmar pedido” y confirmación inmediata. La RPC vuelve a validar actividad, variantes, cantidades, precios, entrega y cupón; calcula todos los importes en PostgreSQL.
4. **Métodos:** `cash_on_delivery` (Pago contra entrega) e `in_person` (Pago presencial). Se amplía el CHECK existente y se centralizan las opciones UI en `PAYMENT_METHODS`. `pending_gateway` solo se conserva para datos históricos; la RPC no lo acepta en pedidos nuevos.
5. **Pagos:** nuevos registros `pending`, registro manual `approved` (etiqueta “Pagado”, reutilizando el estado existente), cancelación `cancelled`. Los demás estados históricos se conservan.
6. **Pedidos:** `pending → confirmed → processing → ready → shipped → delivered`. Retiro en tienda: `ready → delivered`. Cancelación permitida desde estados previos a entregado si no hubo pago. `payment_review` se conserva como histórico. El pago no cambia automáticamente el estado logístico.
7. **Reserva:** la misma transacción de creación incrementa `inventory.reserved_quantity`, agrega movimientos `reservation`, guarda `orders.inventory_status='reserved'` y crea un pago manual pendiente.
8. **Disponible:** `quantity - reserved_quantity`, calculado, no almacenado. Lo usan normalización pública, ficha/selector, carrito, RPCs del carrito, checkout y filtro de catálogo. Se retiró la caché persistente de la ficha para evitar publicar existencias antiguas entre clientes; se mantiene memoización por petición.
9. **Registrar pago:** solo `admin`, con autorización en Server Action y RPC. Monto exacto del total histórico, método del pedido, referencia/observación opcionales, fecha del servidor y administrador autenticado. En una transacción baja físico y apartado, registra `out`, marca `committed` y pago `approved`.
10. **Cancelar pendiente:** baja únicamente apartado, registra `release`, marca reserva `released`, pago y pedido `cancelled`. Un pedido pagado no se puede cancelar mediante esta acción; no se reintegra stock automáticamente.
11. **Sin doble descuento:** bloqueo de fila del pedido, verificación de pago previo y conservación del índice único existente de venta por pedido/variante. El segundo registro retorna `alreadyPaid` sin tocar inventario.
12. **Sin doble liberación:** bloqueo del pedido y retorno inmediato si ya tiene el estado solicitado; liberación solo de `reserved`. Índice único de movimientos reservation/release por pedido/variante.
13. **Concurrencia:** bloqueo transaccional de inventario en orden de variante y actualización condicional sobre stock disponible. Un advisory lock por usuario serializa reintentos de checkout antes de leer el carrito. CHECK impide `reserved > quantity`. La prueba local de solicitudes competidoras pasa; PGlite serializa su única conexión y no prueba contención entre dos sesiones reales.
14. **Inventory:** `reserved_quantity integer NOT NULL DEFAULT 0`, CHECK entre cero y físico. Los ajustes administrativos no pueden consumir unidades apartadas. La lectura administrativa muestra físico/apartado/disponible.
15. **Inventory_movements:** CHECK ampliado con `reservation` y `release`; venta reutiliza `out`. Motivo, usuario, pedido y fecha permanecen en las columnas existentes. Reservas/releases usan cantidades positivas; ventas usan negativas.
16. **Orders:** columna `inventory_status` con `legacy/reserved/committed/released`, ampliación de métodos y estado `ready`. No se borran ni recalculan pedidos anteriores. La migración los deja en `legacy`, sin inventar reservas ni inferir salidas. Sus pagos manuales nuevos quedan bloqueados para revisión operativa; los que ya estaban pagados se reconocen sin volver a descontar.
17. **Payments:** se reutiliza la tabla, agregando `method`, `reference`, `notes`, `recorded_by`; proveedor interno `manual`. `amount`, `status`, `processed_at` y moneda se reutilizan. Índice único de pago manual por orden. No se capturan tarjetas ni datos sensibles.
18. **UI checkout/cuenta:** dos métodos seleccionables, confirmación sin pasarela, método/estado visibles en detalle e historial. La consulta por `profile_id` y RLS siguen vigentes.
19. **Admin pedidos:** listado muestra método y reserva; detalle muestra cantidades apartadas, salida/liberación/histórico, formulario de pago para admin, fecha/monto/referencia/observación/autor y transiciones permitidas según entrega y pago. Operadores conservan gestión logística según la autorización previa; no registran pagos.
20. **Admin inventario:** tres columnas (físico, apartado, disponible), alerta de bajo stock sobre disponible, movimientos trazables y ajustes limitados por reservas.
21. **Migración nueva:** `supabase/migrations/202609190003_manual_payments_reservations.sql`. Transaccional, sin TRUNCATE, eliminación de usuarios/pedidos/inventario ni modificación de migraciones previas.
22. **RPCs:** nueva `admin_record_payment(uuid,numeric,text,text)`; adaptadas `create_order_from_cart`, `cart_add_item`, `cart_set_quantity`, `reconcile_active_cart`, `merge_guest_cart`, `catalog_product_page`, `admin_inventory_page`, `admin_adjust_inventory`, `admin_change_order_status`. Se retiran `create_payment_attempt`, `set_payment_provider_reference`, `process_payment_webhook`.
23. **RLS:** no se desactiva ni se modifica ninguna política de aislamiento. RPC nueva sin acceso de public/anon, con validación interna de admin. Se reafirman restricciones de escritura directa sobre inventario/movimientos para authenticated. No se usa service role desde el navegador ni para pagos manuales.
24. **Archivos:** listado más abajo. Se conservaron modificaciones locales previas de catálogo, imágenes, documentación de seguridad y seed demo. El seed existente obtiene `reserved_quantity=0` por DEFAULT y sus ejecuciones posteriores conservan reservas/ventas.
25. **Reserva:** pruebas 10/0/10 → 10/3/7 → 10/8/2 aprobadas; rechazo de 8 unidades y checkout con carrito desactualizado aprobados.
26. **Pago:** 10/8/2 → 7/5/2 aprobado. Repetición no descuenta, monto incorrecto se rechaza, cliente/operator no autorizados; método presencial también probado.
27. **Cancelación:** 7/5/2 → 7/0/7 aprobado; repetición no altera existencias; no se puede pagar cancelado ni cancelar pagado.
28. **Dos clientes:** pedidos independientes, reserva sobre la misma variante y permisos probados. Solicitudes por la última unidad: un éxito y un rechazo en PGlite. Falta prueba multisesión en PostgreSQL real.
29. **Aislamiento:** confirmado en pruebas RLS ejecutadas como `authenticated`, con identidades A/B: pedidos, líneas y pagos ajenos no visibles. No es una afirmación sobre una base remota sin migrar.
30. **Admin:** confirmado en pruebas RLS que ve ambos pedidos y detalle. También se verifica lectura del inventario con apartado/disponible.
31. **Lint:** `npm run lint` aprobado sin errores.
32. **Build:** `npm run build` aprobado (Next.js 16.3.5). `npm install` correcto; `npm test`: 109 pruebas aprobadas, 0 fallos. No existe script `test:e2e`. No se ejecutó navegación autenticada en Supabase remoto.
33. **Aplicación manual:** con Supabase CLI ya vinculado al proyecto correcto, ejecutar `supabase db push` para las migraciones pendientes en orden. Antes, respaldar y revisar los pedidos históricos. Desplegar después el código a Vercel; no volver a desplegar una versión antigua que invoque las RPC retiradas. No es necesario volver a sembrar datos. En staging, probar simultáneamente dos sesiones reales sobre la última unidad antes de producción.

## Archivos de esta entrega

- `.env.example`, `README.md`, `docs/DEPLOYMENT.md`, `docs/RELEASE-CHECKLIST.md`, este reporte.
- `scripts/validate-env.mjs`.
- `supabase/migrations/202609190003_manual_payments_reservations.sql`.
- `src/services/checkout/calculations.js`.
- `src/features/checkout/actions.js`, `src/features/payments/actions.js`, `src/features/admin/actions.js`, `src/features/catalog/catalog-utils.js`.
- `src/lib/validation/admin.js`.
- `src/repositories/products/index.js`, `src/repositories/carts/index.js`, `src/repositories/orders/index.js`, `src/repositories/admin/index.js`.
- `src/components/checkout/checkout-form.js`, `src/components/orders/order-detail.js`, `src/components/orders/order-status.js`.
- `src/app/(store)/pedido/confirmacion/[orderNumber]/page.js`, `src/app/(store)/pago/resultado/page.js`.
- `src/app/cuenta/pedidos/page.js`, `src/app/cuenta/pedidos/[orderNumber]/page.js`.
- `src/app/admin/pedidos/page.js`, `src/app/admin/pedidos/[id]/page.js`, `src/app/admin/inventario/page.js`.
- `src/app/api/webhooks/payments/[provider]/route.js`.
- `tests/manual-orders.test.mjs`, `tests/demo-flow.test.mjs`, `tests/admin-domain.test.mjs`, `tests/release-quality.test.mjs`.

## Evidencia reproducible

`npm test` aplica todas las migraciones sobre PGlite, ejecuta el seed demo idempotente, prueba reserva/pago/cancelación y ejecuta SELECT/RPC bajo roles anon/authenticated con identidades distintas. Las comprobaciones de pasarela en suites antiguas documentan la arquitectura histórica; el flujo vigente se comprueba en `manual-orders.test.mjs` y `demo-flow.test.mjs`.

La promoción PruebaEstudiante conserva 10% y el importe histórico; 3 unidades de Q159 producen subtotal Q477, descuento Q47.70 y total Q429.30 con retiro gratuito. Las cantidades reservadas permanecen en 3, independientemente del descuento.
