-- O código postal português tem 7 dígitos: char(8) acrescentaria um espaço. O cast de char para varchar tira o preenchimento.
ALTER TABLE "stores" ALTER COLUMN "cep" TYPE VARCHAR(8);
