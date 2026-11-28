import { tr } from './region';

/**
 * Segmentos de estabelecimento, para o guia (filtro por segmento) e o perfil do painel.
 * O código fica gravado em `tenants.segment`: dá para renomear o rótulo à vontade, mas não o código.
 * O rótulo é um getter para sair no idioma do país da instância (BR ou PT).
 */
export const SEGMENTS = [
  { code: 'RESTAURANTE', label: 'Restaurante', group: 'Alimentação' },
  { code: 'LANCHONETE', get label() { return tr('Lanchonete e hamburgueria', 'Snack-bar e hamburgueria'); }, group: 'Alimentação' },
  { code: 'PIZZARIA', label: 'Pizzaria', group: 'Alimentação' },
  { code: 'JAPONESA', label: 'Comida japonesa', group: 'Alimentação' },
  { code: 'CAFETERIA', get label() { return tr('Cafeteria', 'Café'); }, group: 'Alimentação' },
  { code: 'PADARIA', get label() { return tr('Padaria e confeitaria', 'Padaria e pastelaria'); }, group: 'Alimentação' },
  { code: 'DOCERIA', get label() { return tr('Doceria e sorveteria', 'Doçaria e gelataria'); }, group: 'Alimentação' },
  { code: 'BAR', get label() { return tr('Bar e choperia', 'Bar e cervejaria'); }, group: 'Alimentação' },
  { code: 'BELEZA', get label() { return tr('Salão de beleza', 'Cabeleireiro e salão de beleza'); }, group: 'Beleza e bem-estar' },
  { code: 'BARBEARIA', label: 'Barbearia', group: 'Beleza e bem-estar' },
  { code: 'ESTETICA', label: 'Estética e manicure', group: 'Beleza e bem-estar' },
  { code: 'ACADEMIA', get label() { return tr('Academia e estúdio', 'Ginásio e estúdio'); }, group: 'Beleza e bem-estar' },
  { code: 'PET', get label() { return tr('Pet shop', 'Loja de animais'); }, group: 'Comércio e serviços' },
  { code: 'MERCADO', get label() { return tr('Mercado e empório', 'Mercearia e minimercado'); }, group: 'Comércio e serviços' },
  { code: 'LOJA', label: 'Loja', group: 'Comércio e serviços' },
  { code: 'SERVICOS', label: 'Serviços', group: 'Comércio e serviços' },
  { code: 'OUTRO', label: 'Outro', group: 'Comércio e serviços' },
] as const;

export type SegmentCode = (typeof SEGMENTS)[number]['code'];
export const SEGMENT_CODES = SEGMENTS.map((s) => s.code) as [SegmentCode, ...SegmentCode[]];
