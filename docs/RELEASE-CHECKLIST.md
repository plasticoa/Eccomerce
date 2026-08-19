# Checklist de release MVP

No marques un punto con evidencia local si depende de Supabase/Vercel reales.

## Automatizado

- [ ] `npm ci`
- [ ] `npm run validate:env:production`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Todas las migraciones aplicadas hasta 007

## Seguridad e integridad

- [ ] RLS cruzada con Cliente A/B
- [ ] Customer y operator no ejecutan acciones admin no permitidas
- [ ] Secrets ausentes de bundles/respuestas/logs
- [ ] Webhook inválido 401; duplicado 2xx sin segundo movimiento
- [ ] Checkout ignora precios/totales manipulados
- [ ] Dos compras concurrentes no dejan stock negativo
- [ ] Orden conserva snapshots y dirección histórica
- [ ] Ajuste manual registra cantidad, motivo, usuario y fecha
- [ ] Transiciones inválidas de pedido son rechazadas

## Compra crítica y MVP

- [ ] Descubrir producto publicado por catálogo/búsqueda/categoría
- [ ] Agregar/actualizar/eliminar carrito y persistirlo
- [ ] Login, dirección, entrega, cupón y checkout
- [ ] Orden única con líneas/totales/dirección/envío
- [ ] Pago sandbox autorizado y evento trazable
- [ ] Inventario/movimiento coherentes
- [ ] Pedido visible para cliente y administración
- [ ] Administración de producto, imágenes, precios, stock y pedidos
- [ ] Identidad visual/SEO administrables

## Web, operaciones y recuperación

- [ ] Canonical, Open Graph, Twitter, sitemap y robots en dominio real
- [ ] Producto/categoría inactivos fuera de catálogo, búsqueda y sitemap
- [ ] Mobile/tablet/desktop sin overflow en rutas principales
- [ ] Teclado, foco, labels, alt y errores revisados
- [ ] Chrome, Edge, Firefox y Safari recientes
- [ ] Logs Vercel, eventos webhook y auditoría consultables
- [ ] Backup previo verificado y restauración ensayada
- [ ] Rollback de Vercel y responsables confirmados

