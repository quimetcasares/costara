-- Migration: 20260811000002_seed_mandatory_reference_data.sql
-- Description: Insert mandatory universal catalog reference data for Costara domain.

-- 1. unit_dimensions
INSERT INTO public.unit_dimensions (code, name) VALUES
    ('mass', 'Masa'),
    ('volume', 'Volumen'),
    ('count', 'Conteo / Unidades discretas'),
    ('length', 'Longitud')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- 2. units
INSERT INTO public.units (dimension_id, code, name_singular, name_plural, symbol, factor_to_base, is_base) VALUES
    ((SELECT id FROM public.unit_dimensions WHERE code = 'mass'), 'g', 'gramo', 'gramos', 'g', 1, true),
    ((SELECT id FROM public.unit_dimensions WHERE code = 'mass'), 'mg', 'miligramo', 'miligramos', 'mg', 0.001, false),
    ((SELECT id FROM public.unit_dimensions WHERE code = 'mass'), 'kg', 'kilogramo', 'kilogramos', 'kg', 1000, false),

    ((SELECT id FROM public.unit_dimensions WHERE code = 'volume'), 'ml', 'mililitro', 'mililitros', 'ml', 1, true),
    ((SELECT id FROM public.unit_dimensions WHERE code = 'volume'), 'l', 'litro', 'litros', 'L', 1000, false),

    ((SELECT id FROM public.unit_dimensions WHERE code = 'count'), 'piece', 'pieza', 'piezas', 'pza', 1, true),

    ((SELECT id FROM public.unit_dimensions WHERE code = 'length'), 'mm', 'milímetro', 'milímetros', 'mm', 1, true),
    ((SELECT id FROM public.unit_dimensions WHERE code = 'length'), 'cm', 'centímetro', 'centímetros', 'cm', 10, false),
    ((SELECT id FROM public.unit_dimensions WHERE code = 'length'), 'm', 'metro', 'metros', 'm', 1000, false)
ON CONFLICT (code) DO UPDATE SET
    dimension_id = EXCLUDED.dimension_id,
    name_singular = EXCLUDED.name_singular,
    name_plural = EXCLUDED.name_plural,
    symbol = EXCLUDED.symbol,
    factor_to_base = EXCLUDED.factor_to_base,
    is_base = EXCLUDED.is_base;

-- 3. unit_aliases (Global aliases)
INSERT INTO public.unit_aliases (business_id, unit_id, alias) VALUES
    (NULL, (SELECT id FROM public.units WHERE code = 'kg'), 'KGS'),
    (NULL, (SELECT id FROM public.units WHERE code = 'g'), 'GRS'),
    (NULL, (SELECT id FROM public.units WHERE code = 'g'), 'GRS.'),
    (NULL, (SELECT id FROM public.units WHERE code = 'l'), 'LT'),
    (NULL, (SELECT id FROM public.units WHERE code = 'l'), 'LTS'),
    (NULL, (SELECT id FROM public.units WHERE code = 'piece'), 'PZA'),
    (NULL, (SELECT id FROM public.units WHERE code = 'piece'), 'PZAS')
ON CONFLICT DO NOTHING;
