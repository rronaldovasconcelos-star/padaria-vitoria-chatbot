// TO-BE › Sistema › "Aplica regras de sazonalidade e ajusta prazo".
import { dataLocal, dentroPeriodo, mesDia, somaDias } from './util.js';

export const PRAZO_BASE = { individual: 1, pj: 2 };
export const LIMITE_VOLUME = 200; // unidades: acima disso, +1 dia de produção

/**
 * Calcula o prazo mínimo de produção e, se a data pedida for cedo demais,
 * empurra a entrega para a primeira data possível (não bloqueia: ajusta).
 */
export function aplicarSazonalidade({ tipo, itens, dataEntrega, agora = new Date(), regras = [] }) {
  const hoje = dataLocal(agora);
  const totalUnidades = itens.reduce((s, i) => s + Number(i.qtd), 0);
  let base = tipo === 'individual' ? PRAZO_BASE.individual : PRAZO_BASE.pj;
  const motivos = [];
  if (totalUnidades > LIMITE_VOLUME) {
    base += 1;
    motivos.push(`pedido grande (${totalUnidades} unidades)`);
  }

  let data = dataEntrega;
  let regra = null;
  let prazoDias = base;
  // Duas passadas: ajustar a data pode fazê-la cair dentro de um período sazonal.
  for (let i = 0; i < 2; i += 1) {
    regra = regras.find((r) => dentroPeriodo(mesDia(data), r.inicio, r.fim)) ?? null;
    prazoDias = Math.max(base, regra ? regra.prazo_dias : 0);
    const minima = somaDias(hoje, prazoDias);
    if (data < minima) data = minima;
  }
  if (regra) motivos.push(`período de ${regra.nome}`);

  return {
    dataEntrega: data,
    ajustado: data !== dataEntrega,
    prazoDias,
    regra: regra?.nome ?? null,
    motivos,
  };
}
