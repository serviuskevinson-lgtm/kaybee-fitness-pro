/**
 * Calcule le prix final après remise
 */
export const calculateDiscountedPrice = (originalPrice, discount) => {
  const price = typeof originalPrice === 'number' ? originalPrice : parseFloat(originalPrice) || 0;

  if (!discount || !discount.value || discount.value <= 0) return price;

  if (discount.type === 'percent') {
    const factor = (100 - discount.value) / 100;
    return Math.max(0, price * factor);
  }

  if (discount.type === 'amount') {
    return Math.max(0, price - discount.value);
  }

  return price;
};

/**
 * Détermine la devise en fonction de la localisation (Ville/Pays)
 */
export const getCurrencyFromLocation = (locationData) => {
  if (!locationData || !locationData.country || typeof locationData.country !== 'string') return '€';

  const country = locationData.country.trim().toUpperCase();
  const currencyMap = {
    'FRANCE': '€',
    'FR': '€',
    'CANADA': '$',
    'CA': '$',
    'USA': '$',
    'US': '$',
    'UNITED STATES': '$',
    'SPAIN': '€',
    'ES': '€',
    'BELGIUM': '€',
    'BE': '€',
    'SWITZERLAND': 'CHF',
    'CH': 'CHF',
    'UK': '£',
    'GB': '£',
    'GREAT BRITAIN': '£',
    'UNITED KINGDOM': '£',
  };

  return currencyMap[country] || '€';
};

/**
 * Formate l'affichage du prix avec devise dynamique
 */
export const formatPrice = (price, currency = '€') => {
  const num = typeof price === 'number' ? price : parseFloat(price) || 0;
  return `${num.toFixed(2)}${currency}`;
};
