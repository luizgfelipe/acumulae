/**
 * Segmentos de estabelecimento, para o guia (filtro por segmento) e o perfil do painel.
 * O código fica gravado em `tenants.segment`: dá para renomear o rótulo à vontade, mas não o código.
 */
export const SEGMENTS = [
  { code: 'RESTAURANTE', label: 'Restaurante', group: 'Alimentação' },
  { code: 'LANCHONETE', label: 'Lanchonete e hamburgueria', group: 'Alimentação' },
  { code: 'PIZZARIA', label: 'Pizzaria', group: 'Alimentação' },
  { code: 'JAPONESA', label: 'Comida japonesa', group: 'Alimentação' },
  { code: 'CAFETERIA', label: 'Cafeteria', group: 'Alimentação' },
  { code: 'PADARIA', label: 'Padaria e confeitaria', group: 'Alimentação' },
  { code: 'DOCERIA', label: 'Doceria e sorveteria', group: 'Alimentação' },
  { code: 'BAR', label: 'Bar e choperia', group: 'Alimentação' },
  { code: 'BELEZA', label: 'Salão de beleza', group: 'Beleza e bem-estar' },
  { code: 'BARBEARIA', label: 'Barbearia', group: 'Beleza e bem-estar' },
  { code: 'ESTETICA', label: 'Estética e manicure', group: 'Beleza e bem-estar' },
  { code: 'ACADEMIA', label: 'Academia e estúdio', group: 'Beleza e bem-estar' },
  { code: 'PET', label: 'Pet shop', group: 'Comércio e serviços' },
  { code: 'MERCADO', label: 'Mercado e empório', group: 'Comércio e serviços' },
  { code: 'LOJA', label: 'Loja', group: 'Comércio e serviços' },
  { code: 'SERVICOS', label: 'Serviços', group: 'Comércio e serviços' },
  { code: 'OUTRO', label: 'Outro', group: 'Comércio e serviços' },
] as const;

export type SegmentCode = (typeof SEGMENTS)[number]['code'];
export const SEGMENT_CODES = SEGMENTS.map((s) => s.code) as [SegmentCode, ...SegmentCode[]];
