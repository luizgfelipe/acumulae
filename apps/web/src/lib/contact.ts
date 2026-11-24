/** E-mail do Acumulaê para contato comercial e suporte aos estabelecimentos. */
export const CONTACT_EMAIL = 'acumulae@gmail.com';

/** Link mailto: com assunto preenchido. */
export const mailtoContact = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
