// Utilidades puras usadas pelo motor de regras.

export class ErroRegra extends Error {
  constructor(mensagem, codigo = 'regra') {
    super(mensagem);
    this.codigo = codigo;
  }
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const dinheiro = (n) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data local no formato AAAA-MM-DD. */
export function dataLocal(d = new Date()) {
  const x = new Date(d);
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${mm}-${dd}`;
}

export function somaDias(dataISO, dias) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const x = new Date(a, m - 1, d);
  x.setDate(x.getDate() + dias);
  return dataLocal(x);
}

/** '2026-12-24' -> '12-24' */
export const mesDia = (dataISO) => dataISO.slice(5, 10);

/** '2026-12-24' -> '24/12/2026' */
export function dataBR(dataISO) {
  if (!dataISO) return '';
  const [a, m, d] = dataISO.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** '12-24' -> '24/12' */
export const mesDiaBR = (md) => `${md.slice(3, 5)}/${md.slice(0, 2)}`;

/** Período MM-DD..MM-DD, aceitando virada de ano (ex.: 12-15..01-10). */
export function dentroPeriodo(md, inicio, fim) {
  if (!inicio || !fim) return true;
  if (inicio <= fim) return md >= inicio && md <= fim;
  return md >= inicio || md <= fim;
}

export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
