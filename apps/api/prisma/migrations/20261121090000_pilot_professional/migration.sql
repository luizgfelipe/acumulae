-- O PILOTO passa a liberar o mesmo que o PROFISSIONAL, de graça, com validade de 3 meses.
UPDATE "plans" SET
  "price_cents" = 0,
  "max_active_customers" = 1500,
  "max_active_programs" = 3,
  "included_stores" = 1,
  "extra_store_price_cents" = 3990,
  "max_staff" = NULL,
  "max_stamp_icons" = 15,
  "custom_stamp_image" = true,
  "card_customization" = true,
  "reports" = true,
  "customer_export" = true,
  "network_dashboard" = false,
  "support_channel" = 'WHATSAPP',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'PILOTO';

-- Pilotos sem validade: 3 meses a partir do cadastro, até o fim do dia (horário de Brasília).
UPDATE "tenants" SET "plan_expires_at" =
  (date_trunc('day', ("created_at" AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '3 months')
    + INTERVAL '1 day' - INTERVAL '1 millisecond') AT TIME ZONE 'America/Sao_Paulo'
WHERE "plan" = 'PILOTO' AND "plan_expires_at" IS NULL;
