-- Unidade adicional: R$ 59,90 no Profissional (e no Piloto, que libera o mesmo); a Rede continua em R$ 49,90.
-- Com 3 unidades ou mais, o painel recomenda a Rede (3 unidades inclusas).
UPDATE "plans" SET "extra_store_price_cents" = 5990, "updated_at" = CURRENT_TIMESTAMP WHERE "code" IN ('PROFISSIONAL', 'PILOTO');
UPDATE "plans" SET "extra_store_price_cents" = 4990, "updated_at" = CURRENT_TIMESTAMP WHERE "code" = 'REDE';
