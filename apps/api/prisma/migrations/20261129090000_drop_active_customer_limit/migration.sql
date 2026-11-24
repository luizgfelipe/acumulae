-- Os planos deixam de limitar os clientes ativos. A contagem continua como indicador no painel da rede.
ALTER TABLE "plans" DROP COLUMN "max_active_customers";
