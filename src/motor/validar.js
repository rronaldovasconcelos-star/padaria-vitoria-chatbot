// TO-BE › Sistema › "Valida itens e duplicidades de pedidos" + gateway "Válido?".
import { validarCNPJ } from './classificar.js';
import { dataLocal, dentroPeriodo, mesDia, mesDiaBR, dataBR } from './util.js';

export const HORARIO_MIN = '06:00';
export const HORARIO_MAX = '19:00';

/** Assinatura dos itens, independente da ordem: "3x10|7x2". */
export function assinaturaItens(itens) {
  return [...itens]
    .map((i) => `${Number(i.produtoId)}x${Number(i.qtd)}`)
    .sort()
    .join('|');
}

/** Junta linhas repetidas do mesmo produto. */
export function consolidarItens(itens = []) {
  const mapa = new Map();
  for (const i of itens) {
    const id = Number(i.produtoId);
    mapa.set(id, (mapa.get(id) ?? 0) + Number(i.qtd));
  }
  return [...mapa].map(([produtoId, qtd]) => ({ produtoId, qtd }));
}

/**
 * @param pedido  { tipo, cnpj, telefone, itens:[{produtoId,qtd}], dataEntrega, horario }
 * @param produtos lista do cadastro
 * @param pedidosAbertos [{ codigo, telefone, cnpj, dataEntrega, assinatura }]
 * @returns { valido, motivos[] }
 */
export function validarPedido({ pedido, produtos, pedidosAbertos = [], agora = new Date() }) {
  const motivos = [];
  const hoje = dataLocal(agora);
  const itens = consolidarItens(pedido.itens);

  if (pedido.tipo !== 'individual' && !validarCNPJ(pedido.cnpj)) {
    motivos.push('O CNPJ informado é inválido. Pedidos de escola ou empresa precisam de um CNPJ válido.');
  }

  if (itens.length === 0) motivos.push('O pedido não tem nenhum item.');

  for (const item of itens) {
    const p = produtos.find((x) => x.id === item.produtoId);
    if (!p || !p.ativo) {
      motivos.push(`O produto #${item.produtoId} não está disponível no catálogo.`);
      continue;
    }
    if (!Number.isInteger(item.qtd) || item.qtd < p.qtd_min) {
      motivos.push(`${p.nome}: a quantidade mínima é ${p.qtd_min}.`);
    } else if (item.qtd > p.qtd_max) {
      motivos.push(`${p.nome}: a quantidade máxima por pedido é ${p.qtd_max}.`);
    }
    if (p.sazonal_inicio && pedido.dataEntrega
      && !dentroPeriodo(mesDia(pedido.dataEntrega), p.sazonal_inicio, p.sazonal_fim)) {
      motivos.push(`${p.nome} é sazonal e só é produzido de ${mesDiaBR(p.sazonal_inicio)} a ${mesDiaBR(p.sazonal_fim)}.`);
    }
  }

  if (!pedido.dataEntrega || !/^\d{4}-\d{2}-\d{2}$/.test(pedido.dataEntrega)) {
    motivos.push('A data de entrega não foi informada.');
  } else if (pedido.dataEntrega < hoje) {
    motivos.push(`A data de entrega (${dataBR(pedido.dataEntrega)}) já passou.`);
  }

  if (!pedido.horario || pedido.horario < HORARIO_MIN || pedido.horario > HORARIO_MAX) {
    motivos.push(`O horário precisa estar entre ${HORARIO_MIN} e ${HORARIO_MAX}.`);
  }

  // Duplicidade: mesmo cliente, mesma data, mesmos itens, com pedido ainda aberto.
  const assinatura = assinaturaItens(itens);
  const duplicado = pedidosAbertos.find((a) =>
    a.dataEntrega === pedido.dataEntrega
    && a.assinatura === assinatura
    && ((pedido.cnpj && a.cnpj === pedido.cnpj) || (pedido.telefone && a.telefone === pedido.telefone)));
  if (duplicado) {
    motivos.push(`Pedido duplicado: já existe o pedido ${duplicado.codigo} com os mesmos itens para ${dataBR(pedido.dataEntrega)}.`);
  }

  return { valido: motivos.length === 0, motivos, itens };
}
