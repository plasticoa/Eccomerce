-- Datos exclusivamente de desarrollo para Iteración 1.
-- `supabase db reset` ejecuta este archivo localmente. No usar en producción.

insert into public.categories (id, name, slug, description, active) values
  ('a0000000-0000-0000-0000-000000000001', 'Herramientas', 'herramientas', 'Herramientas confiables para proyectos y mantenimiento.', true),
  ('a0000000-0000-0000-0000-000000000002', 'Hogar', 'hogar', 'Soluciones prácticas para cada espacio de casa.', true),
  ('a0000000-0000-0000-0000-000000000003', 'Iluminación', 'iluminacion', 'Luz funcional y eficiente para interior y exterior.', true),
  ('a0000000-0000-0000-0000-000000000004', 'Organización', 'organizacion', 'Productos para mantener todo en su lugar.', true),
  ('a0000000-0000-0000-0000-000000000005', 'Jardín', 'jardin', 'Equipo esencial para cuidar áreas verdes.', true),
  ('a0000000-0000-0000-0000-000000000006', 'Temporada', 'temporada', 'Categoría desactivada para probar visibilidad pública.', false)
on conflict (id) do update set name=excluded.name, slug=excluded.slug, description=excluded.description, active=excluded.active;

insert into public.products (id, name, slug, description, active, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'Taladro percutor compacto', 'taladro-percutor-compacto', 'Taladro versátil con mango ergonómico para perforación y tareas domésticas.', true, '2026-08-01T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000002', 'Juego de destornilladores', 'juego-destornilladores', 'Set de puntas magnéticas y mangos antideslizantes para trabajo preciso.', true, '2026-07-30T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000003', 'Caja organizadora modular', 'caja-organizadora-modular', 'Módulos apilables con divisiones ajustables para herramientas y accesorios.', true, '2026-07-28T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000004', 'Lámpara LED de escritorio', 'lampara-led-escritorio', 'Iluminación regulable con brazo flexible y consumo eficiente.', true, '2026-07-25T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000005', 'Linterna recargable', 'linterna-recargable', 'Linterna compacta de alta intensidad para hogar, automóvil y exteriores.', true, '2026-07-22T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000006', 'Estantería multiuso', 'estanteria-multiuso', 'Estantería resistente de armado sencillo para organizar distintos espacios.', true, '2026-07-20T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000007', 'Manguera reforzada', 'manguera-reforzada', 'Manguera flexible con tejido reforzado para riego diario.', true, '2026-07-18T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000008', 'Tijera de poda profesional', 'tijera-poda-profesional', 'Cuchilla de precisión y agarre cómodo para mantenimiento de jardín.', true, '2026-07-15T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000009', 'Regleta protectora', 'regleta-protectora', 'Protección contra sobretensión para equipos de oficina y hogar.', true, '2026-07-12T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000010', 'Escalera plegable', 'escalera-plegable', 'Escalera liviana con peldaños antideslizantes y cierre compacto.', true, '2026-07-10T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000011', 'Contenedor hermético', 'contenedor-hermetico', 'Contenedor apilable para conservar alimentos y optimizar espacio.', true, '2026-07-08T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000012', 'Bombilla LED cálida', 'bombilla-led-calida', 'Bombilla de larga duración con luz cálida para ambientes acogedores.', true, '2026-07-05T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000013', 'Kit de llaves combinadas', 'kit-llaves-combinadas', 'Llaves métricas de acero endurecido en estuche compacto.', true, '2026-07-02T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000014', 'Maceta autorregable', 'maceta-autorregable', 'Maceta decorativa con reserva de agua para un cuidado sencillo.', true, '2026-06-28T12:00:00Z'),
  ('b0000000-0000-0000-0000-000000000015', 'Producto interno de prueba', 'producto-interno-prueba', 'Producto inactivo que nunca debe exponerse públicamente.', false, '2026-08-02T12:00:00Z')
on conflict (id) do update set name=excluded.name, slug=excluded.slug, description=excluded.description, active=excluded.active, created_at=excluded.created_at;

insert into public.product_variants (id, product_id, sku, variant_name, price, compare_at_price, active) values
  ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','HER-TAL-550','550 W',489.00,549.00,true),
  ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','HER-TAL-700','700 W',625.00,699.00,true),
  ('c0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000002','HER-DES-12','12 piezas',149.00,null,true),
  ('c0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002','HER-DES-24','24 piezas',229.00,259.00,true),
  ('c0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000003','ORG-CAJ-S','Pequeña',89.00,null,true),
  ('c0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000003','ORG-CAJ-L','Grande',159.00,null,true),
  ('c0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000004','ILU-LAM-NE','Negra',315.00,349.00,true),
  ('c0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000004','ILU-LAM-BL','Blanca',315.00,null,false),
  ('c0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000005','ILU-LIN-USB','USB-C',185.00,null,true),
  ('c0000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000006','ORG-EST-4','4 niveles',575.00,649.00,true),
  ('c0000000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000006','ORG-EST-5','5 niveles',725.00,null,true),
  ('c0000000-0000-0000-0000-000000000012','b0000000-0000-0000-0000-000000000007','JAR-MAN-15','15 metros',239.00,null,true),
  ('c0000000-0000-0000-0000-000000000013','b0000000-0000-0000-0000-000000000007','JAR-MAN-25','25 metros',349.00,389.00,true),
  ('c0000000-0000-0000-0000-000000000014','b0000000-0000-0000-0000-000000000008','JAR-TIJ-PRO','Estándar',179.00,null,true),
  ('c0000000-0000-0000-0000-000000000015','b0000000-0000-0000-0000-000000000009','HOG-REG-6','6 tomas',205.00,null,true),
  ('c0000000-0000-0000-0000-000000000016','b0000000-0000-0000-0000-000000000010','HOG-ESC-3','3 peldaños',445.00,499.00,true),
  ('c0000000-0000-0000-0000-000000000017','b0000000-0000-0000-0000-000000000010','HOG-ESC-4','4 peldaños',559.00,null,true),
  ('c0000000-0000-0000-0000-000000000018','b0000000-0000-0000-0000-000000000011','HOG-CON-1','1.2 litros',42.00,null,true),
  ('c0000000-0000-0000-0000-000000000019','b0000000-0000-0000-0000-000000000011','HOG-CON-2','2.5 litros',68.00,null,true),
  ('c0000000-0000-0000-0000-000000000020','b0000000-0000-0000-0000-000000000012','ILU-BOM-9','9 W',28.00,35.00,true),
  ('c0000000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000013','HER-LLA-08','8 piezas',279.00,null,true),
  ('c0000000-0000-0000-0000-000000000022','b0000000-0000-0000-0000-000000000014','JAR-MAC-20','20 cm',95.00,null,true),
  ('c0000000-0000-0000-0000-000000000023','b0000000-0000-0000-0000-000000000014','JAR-MAC-30','30 cm',145.00,null,true),
  ('c0000000-0000-0000-0000-000000000024','b0000000-0000-0000-0000-000000000015','INT-TEST-01','Interna',1.00,null,true)
on conflict (id) do update set product_id=excluded.product_id, sku=excluded.sku, variant_name=excluded.variant_name, price=excluded.price, compare_at_price=excluded.compare_at_price, active=excluded.active;

insert into public.inventory (variant_id, quantity, low_stock_threshold) values
  ('c0000000-0000-0000-0000-000000000001',8,3),('c0000000-0000-0000-0000-000000000002',2,3),
  ('c0000000-0000-0000-0000-000000000003',15,4),('c0000000-0000-0000-0000-000000000004',0,3),
  ('c0000000-0000-0000-0000-000000000005',10,2),('c0000000-0000-0000-0000-000000000006',4,2),
  ('c0000000-0000-0000-0000-000000000007',6,2),('c0000000-0000-0000-0000-000000000008',20,2),
  ('c0000000-0000-0000-0000-000000000009',0,3),('c0000000-0000-0000-0000-000000000010',3,2),
  ('c0000000-0000-0000-0000-000000000011',1,2),('c0000000-0000-0000-0000-000000000012',12,3),
  ('c0000000-0000-0000-0000-000000000013',5,2),('c0000000-0000-0000-0000-000000000014',2,3),
  ('c0000000-0000-0000-0000-000000000015',9,2),('c0000000-0000-0000-0000-000000000016',4,2),
  ('c0000000-0000-0000-0000-000000000017',0,2),('c0000000-0000-0000-0000-000000000018',18,4),
  ('c0000000-0000-0000-0000-000000000019',6,3),('c0000000-0000-0000-0000-000000000020',25,5),
  ('c0000000-0000-0000-0000-000000000021',0,2),('c0000000-0000-0000-0000-000000000022',7,2),
  ('c0000000-0000-0000-0000-000000000023',2,2),('c0000000-0000-0000-0000-000000000024',99,1)
on conflict (variant_id) do update set quantity=excluded.quantity, low_stock_threshold=excluded.low_stock_threshold;

insert into public.product_categories (product_id, category_id) values
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000005'),
  ('b0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000005'),
  ('b0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000014','a0000000-0000-0000-0000-000000000005'),
  ('b0000000-0000-0000-0000-000000000015','a0000000-0000-0000-0000-000000000006')
on conflict do nothing;

insert into public.product_images (id, product_id, storage_path, alt_text, sort_order, is_primary) values
  ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','https://placehold.co/900x900/F3EFE4/174C35/png?text=Taladro+percutor','Taladro percutor compacto',0,true),
  ('d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','https://placehold.co/900x900/E7EBDD/174C35/png?text=Vista+lateral','Vista lateral del taladro percutor',1,false),
  ('d0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','https://placehold.co/900x900/DFE6E0/174C35/png?text=Accesorios','Accesorios incluidos con el taladro',2,false),
  ('d0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002','https://placehold.co/900x900/F3EFE4/174C35/png?text=Destornilladores','Juego de destornilladores',0,true),
  ('d0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000003','https://placehold.co/900x900/F3EFE4/174C35/png?text=Organizador','Caja organizadora modular',0,true),
  ('d0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000004','https://placehold.co/900x900/F3EFE4/174C35/png?text=Lampara+LED','Lámpara LED de escritorio',0,true),
  ('d0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000005','https://placehold.co/900x900/F3EFE4/174C35/png?text=Linterna','Linterna recargable',0,true),
  ('d0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000006','https://placehold.co/900x900/F3EFE4/174C35/png?text=Estanteria','Estantería multiuso',0,true),
  ('d0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000007','https://placehold.co/900x900/F3EFE4/174C35/png?text=Manguera','Manguera reforzada',0,true),
  ('d0000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000008','https://placehold.co/900x900/F3EFE4/174C35/png?text=Tijera+de+poda','Tijera de poda profesional',0,true),
  ('d0000000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000009','https://placehold.co/900x900/F3EFE4/174C35/png?text=Regleta','Regleta protectora',0,true),
  ('d0000000-0000-0000-0000-000000000012','b0000000-0000-0000-0000-000000000010','https://placehold.co/900x900/F3EFE4/174C35/png?text=Escalera','Escalera plegable',0,true),
  ('d0000000-0000-0000-0000-000000000013','b0000000-0000-0000-0000-000000000011','https://placehold.co/900x900/F3EFE4/174C35/png?text=Contenedor','Contenedor hermético',0,true),
  ('d0000000-0000-0000-0000-000000000014','b0000000-0000-0000-0000-000000000012','https://placehold.co/900x900/F3EFE4/174C35/png?text=Bombilla+LED','Bombilla LED cálida',0,true),
  ('d0000000-0000-0000-0000-000000000015','b0000000-0000-0000-0000-000000000013','https://placehold.co/900x900/F3EFE4/174C35/png?text=Llaves','Kit de llaves combinadas',0,true),
  ('d0000000-0000-0000-0000-000000000016','b0000000-0000-0000-0000-000000000014','https://placehold.co/900x900/F3EFE4/174C35/png?text=Maceta','Maceta autorregable',0,true),
  ('d0000000-0000-0000-0000-000000000017','b0000000-0000-0000-0000-000000000015','https://placehold.co/900x900/F3EFE4/174C35/png?text=Privado','Imagen de producto interno',0,true)
on conflict (id) do update set product_id=excluded.product_id, storage_path=excluded.storage_path, alt_text=excluded.alt_text, sort_order=excluded.sort_order, is_primary=excluded.is_primary;

