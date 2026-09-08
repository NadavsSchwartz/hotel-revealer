// Supported provider currencies with two decimal minor units. No client-side conversion.
export const CURRENCIES = Object.freeze({
  USD: 'US dollar',
  EUR: 'Euro',
  GBP: 'British pound',
  CAD: 'Canadian dollar',
  AUD: 'Australian dollar',
});

export const isCurrency = value => typeof value === 'string' && Object.hasOwn(CURRENCIES, value);
