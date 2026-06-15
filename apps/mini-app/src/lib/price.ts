// Єдине місце форматування ціни послуги (фіксована або діапазон «від–до»).

export type PriceType = 'fixed' | 'range';

export interface PricedService {
  priceType?: PriceType;
  price: number | string;
  priceMax?: number | string | null;
  currency?: string;
}

function symbol(currency?: string): string {
  return !currency || currency === 'UAH' ? '₴' : currency;
}

function num(v: number | string | null | undefined): number {
  return Math.round(Number(v ?? 0));
}

/** "350 ₴" або "500–1000 ₴". */
export function formatPrice(s: PricedService): string {
  const cur = symbol(s.currency);
  if (s.priceType === 'range' && s.priceMax != null) {
    return `${num(s.price)}–${num(s.priceMax)} ${cur}`;
  }
  return `${num(s.price)} ${cur}`;
}

/** Короткий варіант для прев'ю: "від 500 ₴" для діапазону. */
export function formatPriceShort(s: PricedService): string {
  const cur = symbol(s.currency);
  if (s.priceType === 'range' && s.priceMax != null) {
    return `від ${num(s.price)} ${cur}`;
  }
  return `${num(s.price)} ${cur}`;
}
