# Despliegue y salida a producción

Esta guía es el procedimiento operativo de Importadora Valiente para Supabase + Vercel. No sustituye un respaldo ni la certificación del proveedor de pago.

## 1. Preparar Supabase

Usa proyectos separados para desarrollo/staging y producción. Confirma región, plan, responsables y acceso con MFA. No conectes previews de Vercel a la base productiva; cada entorno debe tener sus propias claves.

## 2. Respaldar y aplicar migraciones

Antes de cambiar producción, ejecuta el procedimiento de `docs/BACKUP-RECOVERY.md`. Vincula la CLI al proyecto correcto y revisa el destino antes de continuar:

```bash
supabase login
supabase link --project-ref PROJECT_REF
supabase migration list
supabase db push
```

Las migraciones deben aplicarse en orden hasta `202608100007_release_hardening_seo.sql`. No ejecutes `supabase/seed.sql` en producción: contiene datos demo y su encabezado lo limita a desarrollo.

## 3. Configurar Storage

Verifica los buckets públicos `products`, `branding` y `banners`. La lectura es pública porque son assets del escaparate. JPG, PNG y WebP son los MIME permitidos; las escrituras, reemplazos y eliminaciones deben fallar para `anon`, `customer` y `operator`, y funcionar únicamente para `admin`.

## 4. Configurar variables

Carga en Vercel las variables de `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, secretos de webhook y credenciales del proveedor son secretos de servidor y nunca deben usar `NEXT_PUBLIC_`. Ejecuta localmente:

```bash
npm run validate:env
npm run validate:env:production
```

La segunda validación debe pasar con el conjunto productivo antes de autorizar el release.

## 5. Configurar entornos Vercel

- Local: Supabase local o proyecto de desarrollo, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, proveedor `test` opcional.
- Preview: proyecto Supabase de staging, URL propia de preview y secretos sandbox. Nunca webhooks productivos.
- Production: Supabase productivo, dominio definitivo y proveedor real. `PAYMENT_TEST_MODE_ENABLED` debe quedar ausente o `false`.

Mantén el Build Command predeterminado `npm run build` y no habilites `ignoreBuildErrors` ni omitas ESLint.

## 6. Preparar Auth y dominio

En Supabase Auth configura el dominio definitivo como Site URL y permite exactamente `https://DOMINIO/auth/callback`. Agrega previews solo al proyecto staging. Verifica registro, confirmación de correo, login, logout, persistencia de sesión y recuperación. Configura SMTP productivo antes de depender de correos transaccionales.

## 7. Configurar el webhook de pago

Endpoint: `POST https://DOMINIO/api/webhooks/payments/{provider}`.

El adaptador debe verificar la firma sobre el cuerpo raw, normalizar `eventId`, referencia, estado, monto y moneda, y procesar eventos equivalentes a actualización de pago. El repositorio solo incluye `TestPaymentProvider`, bloqueado en producción; seleccionar e implementar el gateway real, sus secretos y eventos oficiales es un bloqueo externo. Nunca copies el secreto en el cliente o en esta guía.

## 8. Verificación previa

```bash
npm ci
npm run release:check
```

Además, revisa en Supabase que todas las migraciones figuren aplicadas y ejecuta pruebas RLS con dos clientes distintos y un administrador.

## 9. Desplegar y verificar dominio

Despliega primero a Preview/staging. Cuando los smoke tests pasen, promueve exactamente el mismo commit a Production. Comprueba certificado HTTPS, canonical, `/robots.txt`, `/sitemap.xml`, favicon, imágenes y que ninguna URL generada apunte a localhost o al dominio de preview.

## 10. Smoke tests

Visitante: inicio, banners, catálogo, búsqueda, filtros, producto publicado y carrito. Confirma 404 para un producto inactivo.

Cliente: registro/login, perfil, dirección, checkout, cupón válido/inválido, método de entrega, pedido, pago sandbox autorizado y consulta del pedido. Con Cliente A intenta abrir el pedido/dirección de Cliente B: debe obtener 404/sin datos.

Administrador: dashboard, producto/SEO/imagen/variante/precio, stock con motivo, pedido y transición válida, cupón, banner y configuración. Con un customer intenta invocar las mismas RPC: deben ser rechazadas.

Compra crítica: comprueba coherencia entre `orders`, `order_items`, `payments`, `payment_webhook_events`, `inventory`, `inventory_movements`, `coupon_redemptions` y `shipments`. Repite el webhook y el token de checkout; no deben duplicarse orden, movimiento ni redención.

Responsive/accesibilidad: revisa inicio, catálogo, producto, carrito, checkout, cuenta y admin en 390 px, 768 px y escritorio; teclado, foco, labels, mensajes y ausencia de overflow. Valida Chrome, Edge, Firefox y Safari recientes.

## 11. Observabilidad posterior al release

Revisa logs de funciones Vercel por eventos JSON con `timestamp`, `level`, `event` y `errorCode`; revisa `payment_webhook_events` fallidos y `audit_logs` para precio, stock, pedido, configuración, cupón y rol. Configura alertas operativas según el plan contratado. Los logs no deben contener cookies, tokens, contraseñas, service role ni datos completos de tarjeta.

## 12. Rollback

1. Detén promociones/despliegues y conserva logs/IDs del incidente.
2. Si el fallo es de aplicación, usa el rollback de Vercel al deployment estable anterior.
3. No reviertas migraciones destructivamente. Publica una migración correctiva hacia adelante.
4. Si hubo corrupción o pérdida, aísla escrituras y sigue `docs/BACKUP-RECOVERY.md`; restaura primero en un proyecto aislado y valida integridad antes del cambio de tráfico.
5. Repite smoke tests y documenta causa, alcance y corrección.

