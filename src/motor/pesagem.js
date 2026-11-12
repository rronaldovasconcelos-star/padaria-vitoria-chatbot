// TO-BE › Conferência › "Confere itens com o pedido" / "Completo?" e
// Sistema › "Calcula valor pelo peso".
import { round2 } from './util.js';

/** checklist: [{ itemId, ok }] → itens faltantes voltam para a produção. */
export function avaliarConferencia(itens, checklist) {
  const marcados = new Map(checklist.map((c) => [Number(c.itemId), Boolean(c.ok)]));
  const faltantes = itens.filter((i) => marcados.get(i.id) !== true).map((i) => i.id);
  return { completo: faltantes.length === 0, faltantes };
}

/** Produto a quilo: peso × preço/kg. Produto por unidade: quantidade × preço. */
export function valorFinalItem(produto, item, pesoKg) {
  if (produto.venda === 'kg') return round2(pesoKg * produto.preco);
  return round2(item.qtd * produto.preco);
}

export function calcularValorFinal(itens, produtos, pesos) {
  const pesoDe = new Map(pesos.map((p) => [Number(p.itemId), Number(p.pesoKg)]));
  const linhas = itens.map((item) => {
    const produto = produtos.find((p) => p.id === item.produto_id);
    const pesoKg = pesoDe.get(item.id);
    if (!(pesoKg > 0)) throw new Error(`Falta o peso do item ${produto?.nome ?? item.id}.`);
    return { itemId: item.id, pesoKg: round2(pesoKg * 1000) / 1000, valor: valorFinalItem(produto, item, pesoKg) };
  });
  return { linhas, total: round2(linhas.reduce((s, l) => s + l.valor, 0)) };
}

/** Saldo = valor final − sinal. Se o sinal cobriu tudo, o excedente vira crédito. */
export function calcularSaldo(valorFinal, sinal) {
  const diferenca = round2(valorFinal - sinal);
  return { saldo: Math.max(0, diferenca), credito: Math.max(0, -diferenca) };
}
