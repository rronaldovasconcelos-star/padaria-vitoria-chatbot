// TO-BE › Sistema › "Desmembra a comanda e libera tarefas para a produção",
// "Ordena a fila pelo horário de saída do motorista" e o join "Todos prontos".

export const SETORES = {
  paes: { nome: 'Pães', responsavel: 'Padeiro', atividade: 'Padeiro vê a cota de pães' },
  confeitaria: { nome: 'Bolos e doces', responsavel: 'Confeiteiro', atividade: 'Confeiteiro vê bolos e doces' },
  salgados: { nome: 'Salgados e recheios', responsavel: 'Salgadeira', atividade: 'Salgadeira vê salgados e recheios' },
};

/** Uma tarefa por item, no setor do produto. */
export function desmembrar(itens, produtos) {
  return itens.map((item) => {
    const p = produtos.find((x) => x.id === Number(item.produto_id ?? item.produtoId));
    if (!p) throw new Error(`Produto ${item.produto_id} não encontrado ao desmembrar.`);
    return { itemId: item.id, setor: p.setor, status: 'aguardando', pendente: 0 };
  });
}

/** Setores envolvidos no pedido (o gateway paralelo "Itens por setor"). */
export const setoresDoPedido = (tarefas) => [...new Set(tarefas.map((t) => t.setor))];

/**
 * Fila do setor: quem sai primeiro com o motorista é produzido primeiro.
 * Empate: item pendente (devolvido pela conferência) passa na frente.
 */
export function ordenarFila(tarefas) {
  return [...tarefas].sort((a, b) =>
    `${a.data_entrega} ${a.horario}`.localeCompare(`${b.data_entrega} ${b.horario}`)
    || (b.pendente - a.pendente)
    || (a.id - b.id));
}

export const todosProntos = (tarefas) =>
  tarefas.length > 0 && tarefas.every((t) => t.status === 'pronto');

const PROXIMO = { aguardando: 'produzindo', produzindo: 'pronto' };

/** Produz e marca Produzindo → Pronto (não pula etapa nem volta). */
export function proximoStatusTarefa(atual, pedido) {
  if (PROXIMO[atual] !== pedido) {
    throw new Error(`A tarefa está "${atual}" e não pode ir para "${pedido}".`);
  }
  return pedido;
}
