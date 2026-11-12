// Ciclo de vida do pedido. Qualquer transição fora desta tabela é recusada:
// é a guarda determinística que impede o sistema de "pular" etapas do TO-BE.
import { ErroRegra } from './util.js';

export const STATUS = {
  RASCUNHO: 'RASCUNHO',
  BLOQUEADO: 'BLOQUEADO',
  AGUARDANDO_SINAL: 'AGUARDANDO_SINAL',
  AGUARDANDO_CONFIRMACAO: 'AGUARDANDO_CONFIRMACAO',
  CANCELADO: 'CANCELADO',
  LIBERADO: 'LIBERADO',
  EM_PRODUCAO: 'EM_PRODUCAO',
  CONFERENCIA: 'CONFERENCIA',
  AGUARDANDO_SALDO: 'AGUARDANDO_SALDO',
  PRONTO_ENTREGA: 'PRONTO_ENTREGA',
  ENTREGUE: 'ENTREGUE',
  FECHADO: 'FECHADO',
};

export const ROTULO_STATUS = {
  RASCUNHO: 'Rascunho',
  BLOQUEADO: 'Bloqueado',
  AGUARDANDO_SINAL: 'Aguardando sinal',
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  CANCELADO: 'Cancelado',
  LIBERADO: 'Liberado',
  EM_PRODUCAO: 'Em produção',
  CONFERENCIA: 'Em conferência',
  AGUARDANDO_SALDO: 'Aguardando saldo',
  PRONTO_ENTREGA: 'Pronto para entrega',
  ENTREGUE: 'Entregue',
  FECHADO: 'Fechado',
};

const TRANSICOES = {
  RASCUNHO: ['BLOQUEADO', 'AGUARDANDO_SINAL', 'LIBERADO'],
  AGUARDANDO_SINAL: ['AGUARDANDO_CONFIRMACAO', 'CANCELADO'],
  AGUARDANDO_CONFIRMACAO: ['LIBERADO', 'CANCELADO'],
  LIBERADO: ['EM_PRODUCAO'],
  EM_PRODUCAO: ['CONFERENCIA'],
  CONFERENCIA: ['EM_PRODUCAO', 'AGUARDANDO_SALDO', 'PRONTO_ENTREGA'],
  AGUARDANDO_SALDO: ['ENTREGUE'],
  PRONTO_ENTREGA: ['ENTREGUE'],
  ENTREGUE: ['FECHADO'],
  BLOQUEADO: [],
  CANCELADO: [],
  FECHADO: [],
};

/** Status em que o pedido ainda "existe" para fins de duplicidade. */
export const STATUS_ABERTOS = [
  'AGUARDANDO_SINAL', 'AGUARDANDO_CONFIRMACAO', 'LIBERADO', 'EM_PRODUCAO',
  'CONFERENCIA', 'AGUARDANDO_SALDO', 'PRONTO_ENTREGA',
];

export const podeTransitar = (de, para) => (TRANSICOES[de] ?? []).includes(para);

export function exigirTransicao(de, para) {
  if (!podeTransitar(de, para)) {
    throw new ErroRegra(
      `Transição não permitida pelo processo: ${ROTULO_STATUS[de] ?? de} → ${ROTULO_STATUS[para] ?? para}.`,
      'transicao',
    );
  }
}
