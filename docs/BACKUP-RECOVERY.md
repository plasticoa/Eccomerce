# Política de respaldo y recuperación

## Alcance y responsables

Debe respaldarse PostgreSQL completo —incluidos Auth, esquema `public`, historial de migraciones, pedidos, pagos, eventos, inventario y auditoría— y los objetos de Storage de `products`, `branding` y `banners`. El responsable operativo designado por Importadora Valiente ejecuta y verifica respaldos; el responsable técnico valida restauraciones y consistencia.

## Frecuencia prevista

- Base de datos: respaldo automático diario si el plan de Supabase contratado lo incluye; en caso contrario, exportación lógica cifrada diaria mediante un job controlado.
- Storage: copia incremental diaria y copia completa semanal a una ubicación separada.
- Antes de migraciones/releases: respaldo verificable obligatorio.
- Prueba de restauración: trimestral y antes de cambios críticos de proveedor/plan.

La disponibilidad exacta de backups administrados, retención y recuperación a un punto en el tiempo depende del plan real de Supabase y debe confirmarse en el panel/contrato. No se asume que PITR esté incluido.

## Procedimiento

1. Registra proyecto, fecha, responsable, versión de aplicación y última migración.
2. Genera el respaldo por el mecanismo disponible del plan o por `supabase db dump`/`pg_dump` con credenciales protegidas.
3. Exporta Storage conservando bucket y ruta. No hagas públicos los respaldos.
4. Cifra, restringe acceso, define retención y verifica checksum/tamaño.
5. Restaura siempre primero en un proyecto aislado compatible.
6. Aplica migraciones faltantes y verifica conteos/relaciones de órdenes, líneas, pagos, eventos, inventario, movimientos, redenciones y envíos.
7. Ejecuta pruebas RLS con dos clientes, smoke tests y una compra sandbox.
8. Solo después autoriza cambio de tráfico o recuperación productiva.

## Objetivos operativos pendientes

RPO, RTO, retención, ubicación secundaria y automatización deben aprobarse según impacto comercial y plan contratado. Hasta documentar y probar estos valores, RNF-10 permanece cumplido parcialmente.

Nunca uses `supabase db reset`, `TRUNCATE` ni `seed.sql` sobre producción. Una limpieza de datos demo debe realizarse con un script revisado, backup previo y IDs explícitos; este repositorio no borra automáticamente datos existentes.

