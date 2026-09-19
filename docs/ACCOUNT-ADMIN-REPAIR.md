# Corrección de aislamiento de cuentas y administración

Implementada y validada en el repositorio el 18/19 de septiembre de 2026. La migración se validó sobre PostgreSQL en memoria; no se aplicó al Supabase publicado ni se desplegó a Vercel desde esta sesión. El entorno contiene solamente `.env.example`, sin credenciales de la base de datos. No fue posible inspeccionar filas, políticas instaladas ni sesiones reales de producción.

## 1. Causa raíz de las direcciones

Confirmada en el código: `getAddresses()` consultaba `addresses` sin condición de propietario. La migración inicial permitía acceso interno global, y la migración 005 conservó la lectura global con `addresses_internal_read`. PostgreSQL combina políticas permisivas con OR: la cuenta admin podía recibir direcciones de cualquier cliente en `/cuenta/direcciones`, el resumen y el checkout. No es evidencia de que el INSERT hubiera asignado el propietario incorrectamente: la acción ya obtenía `profile_id` del usuario verificado.

Corregido con filtro explícito por `user.id` y políticas de direcciones exclusivamente del propietario para SELECT, INSERT, UPDATE y DELETE. El trigger impide transferir una dirección a otro perfil. La consulta operativa de direcciones en el detalle administrativo ahora usa una RPC separada, limitada a un cliente y protegida por rol tanto en servidor como en PostgreSQL.

También se encontró y corrigió la omisión del filtro en la lista/detalle de pedidos personales y en la consulta personal de pagos. Los administradores conservan los pedidos globales en `/admin`, pero sus consultas de `/cuenta` se limitan a su propietario.

## 2. Causa de `/admin/pedidos`

La causa específica en producción no se puede confirmar sin consultar esa base. En el código versionado, `getAdminOrders()` ya consulta todos los pedidos, sin filtro de propietario, y comprueba errores. La migración 005 ya define lectura global para `operator` y `admin`. Los joins son opcionales, no `inner`, y el checkout usa `auth.uid()` al crear pedidos.

Por tanto, una lista vacía con pedidos existentes contradice el estado esperado de las migraciones. Es necesario verificar políticas efectivas, rol/perfil real, filtros de URL y que Vercel apunte al mismo Supabase donde se crearon los pedidos. No se presenta ninguna de estas hipótesis como un hallazgo confirmado.

La nueva migración restablece helpers y políticas coherentes para `orders` y `order_items`. El servidor también verifica el helper que utiliza RLS, de modo que una discrepancia de autorización se reporta como error y no como lista vacía. Las pruebas crean pedidos con la RPC real de checkout y verifican lectura global administrativa y lectura personal aislada.

## 3. Causa de `/admin/clientes`

La consulta usa `profiles` con `role = 'customer'`. Ya existía trigger de registro, pero no backfill de usuarios anteriores o perfiles faltantes. La búsqueda de correos enumeraba solamente los primeros 1.000 usuarios de Auth e ignoraba el error en esa consulta; además dependía de la service role para mostrar correos. Estos problemas están confirmados en el código. La existencia concreta de usuarios sin perfil en producción sigue pendiente de diagnóstico.

La reparación crea solo perfiles faltantes con el mismo ID de Auth y rol inicial `customer`, conserva los perfiles/roles existentes, sincroniza `profiles.email` desde Auth y consulta los correos mediante RLS. Un fallo de consulta o perfil faltante se registra en servidor y se devuelve como error seguro.

## 4. Causa de `/admin/usuarios`

La fuente era `profiles`, limitada a 1.000 filas. Aunque la consulta incluía clientes, la página solo mostraba las cuentas internas y colocaba a los clientes dentro de una sección cerrada. Esta discrepancia con el listado de registrados está confirmada. La ausencia real de perfiles o de permisos en producción no se pudo confirmar.

Ahora muestra clientes, operadores y administradores en un listado con búsqueda y paginación de 20 filas, sin el corte global de 1.000. Solo admin puede acceder a esta operación y asignar roles. Se conserva la RPC existente, su auditoría y la protección del último administrador.

## 5. Archivos modificados/agregados

| Archivos | Cambio |
| --- | --- |
| `src/lib/auth/index.js` | Usuario verificado, lectura de perfil reutilizable, error explícito de perfil faltante |
| `src/services/admin/authorization.js` | Perfil como autoridad y comprobación del helper RLS |
| `src/repositories/addresses/index.js` | Propietario explícito y errores registrados |
| `src/repositories/orders/index.js` | Lista y detalle personales filtrados por propietario |
| `src/repositories/payments/index.js` | Pago personal filtrado por propietario de la orden |
| `src/repositories/admin/index.js` | Datos de perfiles/correos bajo RLS, paginación, RPC de direcciones, búsqueda y errores |
| `src/features/account/actions.js` | Errores de CRUD y detección de mutaciones sin filas afectadas |
| `src/features/auth/actions.js` | Fallos de cierre de sesión explícitos |
| `src/lib/validation/purchase.js`, `src/app/auth/callback/route.js` | Rechazo de redirecciones externas mediante barras invertidas/caracteres de control |
| `src/lib/supabase/server.js`, `src/lib/supabase/admin.js` | Fetch privado sin caché |
| `src/lib/supabase/proxy.js` | Conservación de encabezados anticaché del SDK al refrescar cookies y protección de respuestas privadas |
| `src/app/cuenta/layout.js`, `src/app/admin/layout.js` | Renderizado dinámico explícito |
| `src/app/cuenta/error.js` | Estado de error distinto de una lista vacía |
| `src/app/admin/usuarios/page.js` | Lista visible de registrados con búsqueda y paginación |
| `supabase/migrations/202609190001_account_admin_isolation.sql` | Reparación transaccional de perfiles, permisos, políticas y triggers |
| `supabase/diagnostics/account_admin.sql` | Diagnóstico de solo lectura sin datos personales |
| `tests/account-rls.test.mjs` | Pruebas PostgreSQL de migraciones, checkout, roles y aislamiento |
| `tests/account-server.test.mjs` | Pruebas de funciones del servidor, errores, propietario y caché |
| `package.json`, `package-lock.json` | PGlite de desarrollo, Next.js/ESLint Next 16.3.5 y parches compatibles de dependencias |
| `docs/SECURITY.md`, `docs/ACCOUNT-ADMIN-REPAIR.md` | Matriz y reporte operativo |

## 6. Migración SQL

Se agregó `supabase/migrations/202609190001_account_admin_isolation.sql`. Las siete migraciones anteriores se mantienen intactas. La nueva migración puede ejecutarse nuevamente: no duplica perfiles, no borra datos ni modifica IDs/roles existentes. Sincroniza el correo con Auth; los registros nuevos/faltantes se crean como clientes, nunca como administradores inferidos de metadatos.

Además de las políticas, crea `profiles.email`, reinstala el trigger de altas, añade el trigger de cambios de correo, actualiza el control de dirección predeterminada y crea `admin_customer_addresses(uuid)`. Utiliza `SECURITY DEFINER` con `search_path` vacío y nombres SQL calificados. Revoca ejecución pública de funciones privadas y limita la RPC a sesiones autenticadas con rol interno validado dentro de la función.

## 7. Políticas y privilegios

Se reemplaza **todo el conjunto de políticas de las cuatro tablas** para que una política permisiva antigua/adicional no anule el aislamiento. RLS permanece habilitado.

| Tabla | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `profiles` | Propio o personal interno | Solo trigger/backend | Propio, solo nombre y teléfono; rol mediante RPC admin | Sin acceso de sesión |
| `addresses` | Solo propietario, también para admin | Solo propietario | Solo propietario; propietario inmutable | Solo propietario |
| `orders` | Propietario o personal interno | RPC de checkout | RPC administrativa/pago | Sin escritura directa de sesión |
| `order_items` | Propietario de la orden o personal interno | RPC de checkout | Sin escritura directa de sesión | Sin escritura directa de sesión |

Políticas finales: `profiles_owner_read`, `profiles_internal_read`, `profiles_owner_update`; `addresses_owner_read`, `addresses_owner_insert`, `addresses_owner_update`, `addresses_owner_delete`; `orders_owner_read`, `orders_internal_read`; `order_items_owner_read`, `order_items_internal_read`.

`payments`, `shipments` y `coupon_redemptions` ya derivan acceso personal de la orden/perfil, con acceso operativo por rol. Se revisaron sus políticas y las restricciones de escritura de las migraciones 004–006; no se cambian en esta reparación. No se agregó ningún `USING (true)` a tablas privadas.

## 8. Autenticación y autorización

Se conserva `profiles.role` con los roles `customer`, `operator` y `admin`. `getUser()` valida la sesión en servidor. `readProfile()` centraliza la lectura; `requireInternal()`/`requireAdmin()` verifican el perfil y el helper SQL correspondiente. Cada repositorio/acción administrativa verifica permisos independientemente del layout.

El operador conserva su alcance operativo existente: pedidos y atención al cliente, sin asignación de roles. `admin_customer_addresses` permite ese acceso de atención; nunca concede lectura global de direcciones a una consulta de cuenta personal. El navegador no determina IDs ni roles confiables.

La administración de usuarios/clientes ya no importa ni utiliza `supabase.auth.admin`. La service role sigue exclusivamente en el módulo `server-only` utilizado por el procesamiento servidor de pagos. No se añadieron secretos públicos. La revisión de `.next/static` no encontró `SUPABASE_SERVICE_ROLE_KEY` ni `createAdminClient`.

## 9. Caché y SSR

No se encontró caché global de perfiles/direcciones/pedidos; `unstable_cache` estaba limitado a contenido público con clientes sin sesión. El uso previo de `cookies()` ya hacía dinámicas las rutas personales. La fuga reproducible de direcciones se debe al alcance de consulta/RLS, no a una caché demostrada.

Como refuerzo: `force-dynamic` en ambos layouts privados; `cache: 'no-store'` en los clientes de servidor y privilegiado; respuestas privadas con `Cache-Control: private, no-store`; conservación de `Expires`, `Pragma` y demás encabezados anticaché que entrega `@supabase/ssr` al escribir cookies. Los clientes SSR se crean por llamada y toman sus cookies de la petición, sin singleton global de servidor.

La compilación confirmó que `/cuenta/*` y `/admin/*` son dinámicas. El patrón sigue la [documentación oficial de SSR de Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) y la documentación incluida con la versión instalada de Next.js.

## 10. Pruebas

`npm test`: **81 pruebas aprobadas, 0 fallos, 0 omitidas**.

Los escenarios obligatorios 1–10 se ejecutaron a nivel PostgreSQL: altas de A/B, dirección propia, consultas cruzadas denegadas, checkout real para cada usuario, pedidos propios, pedidos globales admin, perfiles de clientes, usuarios registrados, RPC administrativa denegada y falsificación del propietario bloqueada.

Se probaron además: administración de roles legítima/auditada, protección del último admin, restricciones del operador, CRUD propio, dirección predeterminada aislada, acceso anónimo, backfill repetible, correo actualizado desde Auth, metadatos que intentan asignar admin, mutaciones directas prohibidas y RLS habilitado.

Las pruebas del servidor ejecutan las funciones de los módulos con dependencias de IO controladas: cambio de sesión A/B/admin, consultas administrativas, paginación posterior a 1.000 registros, errores versus vacío, perfil faltante, discrepancia RLS/rol, acciones administrativas directas de cliente, propietario adulterado, clientes SSR por petición y encabezados del proxy.

**Alcance:** PGlite ejecuta PostgreSQL real en memoria según su [documentación](https://pglite.dev/docs/). El harness suministra esquemas mínimos de Auth/Storage y contexto JWT; no ejecuta GoTrue/PostgREST ni un navegador con usuarios reales. Solo se omite `CREATE EXTENSION pgcrypto` del bootstrap de pruebas: el código usa `gen_random_uuid()` nativo. No hay prueba HTTP/E2E de las cuatro URLs publicadas ni confirmación de sus datos de producción.

## 11. Lint

`npm run lint`: **aprobado, 0 errores y 0 advertencias**. Se corrigieron los dos errores de nombre reservado detectados en el nuevo archivo de pruebas; sus nueve pruebas también se ejecutaron nuevamente y pasaron.

## 12. Build y dependencias

`npm run build` con Next.js 16.3.5: **aprobado**, incluyendo generación de rutas y comprobación de módulos de servidor.

`npm install`: completado. El primer intento encontró restricciones de caché/red del entorno; la instalación posterior autorizada se completó. Se agregaron pruebas PostgreSQL con `@electric-sql/pglite` 0.5.8 como dependencia de desarrollo.

La auditoría inicial informó tres vulnerabilidades de dependencias existentes. Se actualizó Next.js/ESLint Next de 16.3.0 a 16.3.5 y se aplicaron parches compatibles. La auditoría final de npm informó **0 vulnerabilidades**. No se utilizó `audit fix --force`.

## 13. Pasos pendientes en Supabase y Vercel

1. En el SQL Editor del proyecto Supabase utilizado por Vercel, ejecutar `supabase/diagnostics/account_admin.sql`. Revisar conteos de Auth/perfiles, perfiles faltantes, roles, pedidos, triggers y políticas. El script no devuelve correos ni direcciones.
2. Verificar que estén aplicadas las migraciones 001–007 del repositorio. Aplicar las pendientes en su orden; no ejecutar el seed de pruebas en producción.
3. Ejecutar **el archivo completo** `supabase/migrations/202609190001_account_admin_isolation.sql`. Contiene `BEGIN`/`COMMIT`, backfill, políticas y recarga del esquema PostgREST. No requiere editar UUIDs o correos.
4. Repetir el diagnóstico: `missing_profiles = 0`, las cuatro tablas con RLS activo y políticas finales de esta reparación. Si el usuario legítimamente administrador no tiene ese rol, revisar la asignación real; el backfill no concede privilegios automáticamente.
5. Desplegar el código actualizado a Vercel **después de aplicar la migración**, porque las consultas administrativas ya usan `profiles.email` y la RPC nueva. Confirmar que URL/clave pública y backend de pagos correspondan al mismo proyecto Supabase.
6. Validar con sesiones independientes de cliente A, cliente B y administrador las cuatro páginas solicitadas, pedidos/direcciones cruzados, mutaciones HTTP adulteradas, cambios de sesión y gestión de roles. Los formularios administrativos deben rechazar a clientes incluso por invocación directa.

Si se gestiona la base mediante Supabase CLI, revisar primero `supabase migration list` y `supabase db push --dry-run` en el proyecto correctamente vinculado; `supabase db push` aplica las migraciones pendientes. No ejecutar reset/recrear la base como parte de esta reparación.

## 14. Variables de entorno

No hay variables nuevas. Se conservan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o la alternativa ANON) y las existentes de sitio/pagos. `SUPABASE_SERVICE_ROLE_KEY` permanece privada y necesaria para el backend de pagos; los listados administrativos ya no dependen de ella para obtener correos. No configurar ninguna variable `NEXT_PUBLIC_*` con esa clave.
