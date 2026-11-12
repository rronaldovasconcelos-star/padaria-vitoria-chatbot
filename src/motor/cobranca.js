// TO-BE › Sistema › "Calcula e envia cobrança do sinal" e "Enviar cobrança do saldo restante".
import { round2 } from './util.js';

export const PERCENTUAL_SINAL = 0.5;

/** Só o cliente individual/avulso paga sinal (gateway "Cliente individual / avulso?"). */
export const precisaSinal = (tipo) => tipo === 'individual';

/** Valor de uma linha antes da pesagem (usa o peso médio do cadastro). */
export function valorEstimadoItem(produto, qtd) {
  if (produto.venda === 'kg') return round2(qtd * produto.peso_medio_kg * produto.preco);
  return round2(qtd * produto.preco);
}

export function calcularEstimado(itens, produtos) {
  return round2(itens.reduce((s, i) => {
    const p = produtos.find((x) => x.id === Number(i.produtoId));
    return s + (p ? valorEstimadoItem(p, i.qtd) : 0);
  }, 0));
}

export const calcularSinal = (estimado) => round2(estimado * PERCENTUAL_SINAL);

// ---------------------------------------------------------------- PIX (BR Code estático)
// Gerado offline, sem banco nem gateway: o QR é válido no formato, com chave fictícia.

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const limpar = (s, max) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, max);

export function pixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const corpo = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986')
    + campo('54', round2(valor).toFixed(2))
    + campo('58', 'BR')
    + campo('59', limpar(nome, 25))
    + campo('60', limpar(cidade, 15))
    + campo('62', campo('05', limpar(txid, 25).replace(/ /g, '') || '***'))
    + '6304';
  return corpo + crc16(corpo);
}
