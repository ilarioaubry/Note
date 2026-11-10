/** Conversion des nombres en toutes lettres (0 – 999 999), pour compter « 16 » = « seize ». */

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n) {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t];
    return u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${below100(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${below100(n - 80)}`;
}

function below1000(n) {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100), r = n % 100;
  const head = h === 1 ? 'cent' : `${UNITS[h]} cent`;
  return r === 0 ? head : `${head} ${below100(r)}`;
}

export function numberToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n > 999999) return String(n);
  if (n < 1000) return below1000(n);
  const k = Math.floor(n / 1000), r = n % 1000;
  const head = k === 1 ? 'mille' : `${below1000(k)} mille`;
  return r === 0 ? head : `${head} ${below1000(r)}`;
}
