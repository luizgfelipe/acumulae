-- O Profissional (e o Piloto, que libera o mesmo) passa a permitir até 5 funcionários.
-- Quem já tem mais continua com todos; só não convida nem reativa além do limite.
UPDATE "plans" SET "max_staff" = 5, "updated_at" = CURRENT_TIMESTAMP WHERE "code" IN ('PROFISSIONAL', 'PILOTO');
