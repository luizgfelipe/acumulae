-- Essencial: R$ 59,90, até 2 funcionários (o gestor + 1) e 1 notificação por mês.
-- Quem já tem mais funcionários continua com todos; só não convida nem reativa além do limite.
UPDATE "plans"
SET "price_cents" = 5990, "max_staff" = 2, "max_announcements_per_month" = 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'ESSENCIAL';
