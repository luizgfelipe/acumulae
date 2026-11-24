-- Cor padrão do cartão passa a ser o rosa da marca. Quem já tem cor salva não muda.
ALTER TABLE "tenant_branding" ALTER COLUMN "primary_color" SET DEFAULT '#FC3B7F';
