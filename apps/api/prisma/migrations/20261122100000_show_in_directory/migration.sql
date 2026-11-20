-- O estabelecimento aparece no guia do app por padrão; o gestor pode desligar no Perfil.
ALTER TABLE "tenants" ADD COLUMN "show_in_directory" BOOLEAN NOT NULL DEFAULT true;
