// Catálogo das atividades do diagrama TO-BE (Bizagi). Cada evento gravado
// no log usa um destes ids — é o que liga o sistema ao processo desenhado.
// x/y = centro do elemento no PNG, num sistema de 2576 × 941 (viewBox da tela /processo).
// forma: 'tarefa' (retângulo), 'evento' (círculo) ou 'gateway' (losango).

const T = (id, nome, raia, x, y) => ({ id, nome, raia, x, y, forma: 'tarefa' });
const E = (id, nome, raia, x, y) => ({ id, nome, raia, x, y, forma: 'evento' });
const G = (id, nome, raia, x, y) => ({ id, nome, raia, x, y, forma: 'gateway' });

export const ATIVIDADES = [
  // Cliente
  E('cli_inicio', 'Início', 'Cliente', 93, 79),
  T('cli_acessa', 'Acessa chatbot via WhatsApp / catálogo web', 'Cliente', 208, 79),
  T('cli_seleciona', 'Seleciona produtos, preenche dados e informa tipo', 'Cliente', 363, 79),
  T('cli_confirma', 'Confirma o pedido', 'Cliente', 518, 79),
  E('cli_aguarda_sinal', 'Aguardar cobrança do sinal', 'Cliente', 697, 79),
  T('cli_paga_sinal', 'Paga 50% do sinal e envia comprovante pelo chatbot', 'Cliente', 830, 79),
  E('cli_aviso_cancelamento', 'Receber aviso de cancelamento', 'Cliente', 1189, 79),
  E('cli_recebe_valor', 'Receber valor', 'Cliente', 1824, 79),
  T('cli_paga_saldo', 'Pagar saldo final e retirar pedido', 'Cliente', 1932, 79),
  E('cli_fim', 'Fim (cliente)', 'Cliente', 2100, 79),

  // Sistema
  E('sis_recebe', 'Pedido recebido', 'Sistema', 86, 289),
  T('sis_classifica', 'Classifica: escola, empresa ou individual', 'Sistema', 162, 289),
  T('sis_valida', 'Valida itens e duplicidades de pedidos', 'Sistema', 276, 289),
  G('sis_valido', 'Válido?', 'Sistema', 366, 289),
  T('sis_bloqueia', 'Bloqueia e informa o motivo', 'Sistema', 366, 372),
  T('sis_sazonalidade', 'Aplica regras de sazonalidade e ajusta prazo', 'Sistema', 475, 289),
  G('sis_avulso', 'Cliente individual / avulso?', 'Sistema', 572, 289),
  T('sis_cobra_sinal', 'Calcula e envia cobrança do sinal', 'Sistema', 697, 289),
  E('sis_comprovante', 'Comprovante recebido', 'Sistema', 830, 289),
  T('sis_aguardando', 'Status Aguardando Confirmação e notifica a Gestão', 'Sistema', 933, 289),
  E('sis_prazo', 'Prazo de validação expirado', 'Sistema', 1005, 381),
  T('sis_cancela', 'Cancela o pedido e avisa o cliente pelo chatbot', 'Sistema', 1107, 380),
  T('sis_libera', 'Altera status e libera pedido', 'Sistema', 1257, 289),
  T('sis_desmembra', 'Desmembra a comanda e libera tarefas para a produção', 'Sistema', 1389, 289),
  T('sis_ordena', 'Ordena a fila pelo horário de saída do motorista', 'Sistema', 1525, 289),
  G('sis_setores', 'Itens por setor', 'Sistema', 1636, 289),
  T('sis_calcula_peso', 'Calcula valor pelo peso', 'Sistema', 2111, 380),
  G('sis_pedido_avulso', 'Pedido avulso?', 'Sistema', 2111, 311),
  T('sis_cobra_saldo', 'Enviar cobrança do saldo restante', 'Sistema', 2111, 239),
  T('sis_consolida', 'Consolida o caixa e gera relatório', 'Sistema', 2241, 310),

  // Gestão
  T('ges_confere', 'Confere comprovante e clica em Validar Pagamento', 'Gestão', 933, 472),
  G('ges_confirmado', 'Pagamento confirmado?', 'Gestão', 1107, 473),
  T('ges_relatorios', 'Consultar e exportar relatórios para fechamento', 'Gestão', 2390, 481),
  E('ges_fim', 'Fim', 'Gestão', 2531, 481),

  // Produção
  T('pro_padeiro', 'Padeiro vê a cota de pães', 'Produção', 1715, 577),
  T('pro_padeiro_produz', 'Produz e marca Produzindo → Pronto (pães)', 'Produção', 1843, 577),
  T('pro_confeiteiro', 'Confeiteiro vê bolos e doces', 'Produção', 1715, 636),
  T('pro_confeiteiro_produz', 'Produz e marca Produzindo → Pronto (bolos e doces)', 'Produção', 1843, 636),
  T('pro_salgadeira', 'Salgadeira vê salgados e recheios', 'Produção', 1715, 694),
  T('pro_salgadeira_produz', 'Produz e marca Produzindo → Pronto (salgados)', 'Produção', 1843, 694),
  G('pro_todos_prontos', 'Todos prontos', 'Produção', 1957, 636),
  T('pro_pendente', 'Produzir item pendente', 'Produção', 2135, 679),

  // Conferência / Expedição
  T('con_confere', 'Confere itens com o pedido', 'Conferência', 2031, 799),
  G('con_completo', 'Completo?', 'Conferência', 2136, 800),
  T('con_pesa', 'Pesa itens e lança peso no sistema', 'Conferência', 2235, 799),
  T('con_libera', 'Liberar mercadoria (entrega)', 'Conferência', 2390, 799),
];

export const ATIVIDADE = Object.fromEntries(ATIVIDADES.map((a) => [a.id, a]));

/** Atividades "Produz e marca" e "vê a cota" por setor. */
export const ATIVIDADE_SETOR = {
  paes: { ve: 'pro_padeiro', produz: 'pro_padeiro_produz' },
  confeitaria: { ve: 'pro_confeiteiro', produz: 'pro_confeiteiro_produz' },
  salgados: { ve: 'pro_salgadeira', produz: 'pro_salgadeira_produz' },
};
