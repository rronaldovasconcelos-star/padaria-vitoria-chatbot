// Orquestrador do TO-BE: liga o motor de regras (puro) ao banco, ao chat e aos painéis.
// Toda etapa grava um evento com o id da atividade do diagrama (src/motor/atividades.js).
import QRCode from 'qrcode';
import { ATIVIDADE, ATIVIDADE_SETOR } from './motor/atividades.js';
import { STATUS, STATUS_ABERTOS, ROTULO_STATUS, exigirTransicao } from './motor/estados.js';
import { classificar, ROTULO_TIPO } from './motor/classificar.js';
import { validarPedido, assinaturaItens } from './motor/validar.js';
import { aplicarSazonalidade } from './motor/sazonalidade.js';
import {
  calcularEstimado, calcularSinal, precisaSinal, valorEstimadoItem, pixCopiaECola,
} from './motor/cobranca.js';
import { desmembrar, setoresDoPedido, ordenarFila, todosProntos, proximoStatusTarefa, SETORES } from './motor/comanda.js';
import { avaliarConferencia, calcularValorFinal, calcularSaldo } from './motor/pesagem.js';
import { prazoValidacao, pedidosVencidos } from './motor/timer.js';
import { ErroRegra, dataBR, dataLocal, dinheiro } from './motor/util.js';

export function criarProcesso({ banco, agora = () => new Date(), notificar = () => {} }) {
  const { todos, um, exec, transacao, config } = banco;
  const iso = () => agora().toISOString();

  // ------------------------------------------------------------- utilidades
  function registrar(pedidoId, atividadeId, detalhe = '') {
    const a = ATIVIDADE[atividadeId];
    if (!a) throw new Error(`Atividade desconhecida no TO-BE: ${atividadeId}`);
    exec('INSERT INTO eventos (pedido_id, atividade, raia, detalhe, em) VALUES (?,?,?,?,?)',
      pedidoId, atividadeId, a.raia, detalhe, iso());
  }

  const pedido = (id) => um('SELECT * FROM pedidos WHERE id = ?', Number(id));

  function exigirPedido(id) {
    const p = pedido(id);
    if (!p) throw new ErroRegra('Pedido não encontrado.', 'nao_encontrado');
    return p;
  }

  function mudarStatus(p, novo, extras = {}) {
    exigirTransicao(p.status, novo);
    const campos = { ...extras, status: novo, atualizado_em: iso() };
    const sets = Object.keys(campos).map((k) => `${k} = ?`).join(', ');
    exec(`UPDATE pedidos SET ${sets} WHERE id = ?`, ...Object.values(campos), p.id);
    Object.assign(p, campos);
    return p;
  }

  function falar(conversaId, texto, extra = null, autor = 'bot') {
    if (!conversaId) return;
    exec('INSERT INTO mensagens (conversa_id, autor, texto, extra, em) VALUES (?,?,?,?,?)',
      conversaId, autor, texto, extra ? JSON.stringify(extra) : null, iso());
    notificar({ tipo: 'mensagem', conversaId });
  }

  const avisarPainel = (p, texto) =>
    notificar({ tipo: 'pedido', pedidoId: p.id, codigo: p.codigo, status: p.status, texto });

  async function cobrancaPix(p, valor, rotulo) {
    const copiaECola = pixCopiaECola({
      chave: config('pix_chave'), nome: config('pix_nome'), cidade: config('pix_cidade'),
      valor, txid: `${p.codigo}${rotulo}`,
    });
    const qr = await QRCode.toDataURL(copiaECola, { margin: 1, width: 240, color: { dark: '#3b2414', light: '#fffaf2' } });
    return { valor, copiaECola, qr, rotulo };
  }

  const itensDoPedido = (id) => todos(
    `SELECT i.*, p.nome, p.icone, p.venda, p.setor, p.preco, p.peso_medio_kg FROM itens i
       JOIN produtos p ON p.id = i.produto_id WHERE i.pedido_id = ? ORDER BY i.id`, id);

  const minutosPrazo = () => Number(config(Number(config('modo_demo')) ? 'prazo_validacao_min_demo' : 'prazo_validacao_min'));

  // ------------------------------------------------------------- Sistema: pedido recebido
  /**
   * Executa, em ordem, o trecho do TO-BE que vai de "Confirma o pedido"
   * até a cobrança do sinal (avulso) ou a liberação para a produção (escola/empresa).
   */
  async function criarPedido(conversaId, dados) {
    const produtos = banco.produtos();
    const resultado = transacao(() => {
      const agoraISO = iso();
      exec(`INSERT INTO pedidos (conversa_id, cliente_nome, telefone, cnpj, tipo, status, data_entrega,
              horario, data_pedida, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      conversaId, dados.nome, dados.telefone, dados.cnpj ?? null, dados.tipo, STATUS.RASCUNHO,
      dados.dataEntrega, dados.horario, dados.dataEntrega, agoraISO, agoraISO);
      const id = Number(um('SELECT last_insert_rowid() AS id').id);
      const codigo = `PV-${String(id).padStart(4, '0')}`;
      exec('UPDATE pedidos SET codigo = ? WHERE id = ?', codigo, id);
      const p = pedido(id);

      registrar(id, 'cli_inicio', 'Conversa iniciada');
      registrar(id, 'cli_acessa', 'Chat web da Padaria Vitória');
      registrar(id, 'cli_seleciona', `${ROTULO_TIPO[dados.tipo] ?? dados.tipo} · ${dados.nome}`);
      registrar(id, 'cli_confirma', `${dados.itens.length} produto(s) no carrinho`);
      registrar(id, 'sis_recebe', `Pedido ${codigo} recebido pelo chatbot`);

      // Classifica
      const cadastrosPJ = todos('SELECT * FROM clientes WHERE cadastrado = 1');
      const cls = classificar({ tipoInformado: dados.tipo, cnpj: dados.cnpj }, cadastrosPJ);
      exec('UPDATE pedidos SET tipo = ?, cnpj = ? WHERE id = ?', cls.tipo, cls.cnpj, id);
      p.tipo = cls.tipo; p.cnpj = cls.cnpj;
      registrar(id, 'sis_classifica', `${ROTULO_TIPO[cls.tipo]}${cls.cadastrado ? ` — cliente cadastrado: ${cls.nomeCadastro}` : ''}`);

      // Cliente
      let cliente = cls.cnpj
        ? um('SELECT * FROM clientes WHERE cnpj = ?', cls.cnpj)
        : um('SELECT * FROM clientes WHERE telefone = ? AND tipo = ?', dados.telefone, 'individual');
      if (!cliente) {
        exec('INSERT INTO clientes (nome, tipo, cnpj, telefone) VALUES (?,?,?,?)',
          cls.nomeCadastro ?? dados.nome, cls.tipo, cls.cnpj, dados.telefone);
        cliente = { id: Number(um('SELECT last_insert_rowid() AS id').id) };
      }
      exec('UPDATE pedidos SET cliente_id = ? WHERE id = ?', cliente.id, id);

      // Valida itens e duplicidade
      const abertos = todos(
        `SELECT codigo, telefone, cnpj, data_entrega AS dataEntrega, assinatura FROM pedidos
          WHERE id <> ? AND status IN (${STATUS_ABERTOS.map(() => '?').join(',')})`, id, ...STATUS_ABERTOS);
      const v = validarPedido({
        pedido: { ...dados, tipo: cls.tipo, cnpj: cls.cnpj }, produtos, pedidosAbertos: abertos, agora: agora(),
      });
      for (const item of v.itens) {
        const prod = produtos.find((x) => x.id === item.produtoId);
        if (!prod) continue;
        exec('INSERT INTO itens (pedido_id, produto_id, qtd, valor_estimado) VALUES (?,?,?,?)',
          id, item.produtoId, item.qtd, valorEstimadoItem(prod, item.qtd));
      }
      exec('UPDATE pedidos SET assinatura = ? WHERE id = ?', assinaturaItens(v.itens), id);
      registrar(id, 'sis_valida', v.valido ? 'Itens e duplicidade conferidos' : v.motivos.join(' '));
      registrar(id, 'sis_valido', v.valido ? 'Sim' : 'Não');

      if (!v.valido) {
        mudarStatus(p, STATUS.BLOQUEADO, { motivo: v.motivos.join(' ') });
        registrar(id, 'sis_bloqueia', v.motivos.join(' '));
        return { p, bloqueado: true, motivos: v.motivos };
      }

      // Sazonalidade e prazo
      const s = aplicarSazonalidade({
        tipo: cls.tipo, itens: v.itens, dataEntrega: dados.dataEntrega, agora: agora(),
        regras: todos('SELECT * FROM sazonalidade'),
      });
      exec('UPDATE pedidos SET data_entrega = ?, prazo_regra = ? WHERE id = ?',
        s.dataEntrega, s.motivos.join(', ') || null, id);
      p.data_entrega = s.dataEntrega;
      registrar(id, 'sis_sazonalidade', s.ajustado
        ? `Prazo mínimo de ${s.prazoDias} dia(s)${s.motivos.length ? ` (${s.motivos.join(', ')})` : ''}: entrega ajustada de ${dataBR(dados.dataEntrega)} para ${dataBR(s.dataEntrega)}`
        : `Prazo de ${s.prazoDias} dia(s) atendido${s.regra ? ` — ${s.regra}` : ''}`);

      const estimado = calcularEstimado(v.itens, produtos);
      exec('UPDATE pedidos SET valor_estimado = ? WHERE id = ?', estimado, id);
      p.valor_estimado = estimado;

      const avulso = precisaSinal(cls.tipo);
      registrar(id, 'sis_avulso', avulso ? 'Sim — cobra sinal de 50%' : `Não — ${ROTULO_TIPO[cls.tipo]}, faturado sem sinal`);

      if (avulso) {
        const sinal = calcularSinal(estimado);
        mudarStatus(p, STATUS.AGUARDANDO_SINAL, { sinal, prazo_validacao_ate: prazoValidacao(agora(), minutosPrazo()) });
        registrar(id, 'sis_cobra_sinal', `Sinal de ${dinheiro(sinal)} (50% de ${dinheiro(estimado)})`);
        registrar(id, 'cli_aguarda_sinal', `Prazo para pagar e validar: ${minutosPrazo()} min`);
      } else {
        liberarParaProducao(p, 'Escola/empresa: sem sinal');
      }
      return { p, bloqueado: false, sazonalidade: s, avulso };
    });

    const p = pedido(resultado.p.id);
    avisarPainel(p, `Novo pedido ${p.codigo} — ${ROTULO_STATUS[p.status]}`);

    if (resultado.bloqueado) {
      falar(conversaId, `❌ Não consegui registrar o pedido ${p.codigo}:\n• ${resultado.motivos.join('\n• ')}`,
        { botoes: [{ rotulo: '🛒 Fazer um novo pedido', valor: 'pedido' }, { rotulo: '🏠 Menu', valor: 'menu' }] });
      return p;
    }
    if (resultado.sazonalidade.ajustado) {
      falar(conversaId, `📅 Ajustei a data de entrega para ${dataBR(p.data_entrega)}: precisamos de ${resultado.sazonalidade.prazoDias} dia(s) de antecedência${resultado.sazonalidade.motivos.length ? ` (${resultado.sazonalidade.motivos.join(', ')})` : ''}.`);
    }
    if (resultado.avulso) {
      const pix = await cobrancaPix(p, p.sinal, 'SINAL');
      falar(conversaId,
        `✅ Pedido ${p.codigo} registrado! Para iniciar a produção, pague o sinal de 50%: ${dinheiro(p.sinal)}.\nDepois envie o comprovante aqui. Você tem ${minutosPrazo()} minutos.`,
        { pix, upload: 'sinal', prazoAte: p.prazo_validacao_ate });
    } else {
      falar(conversaId,
        `✅ Pedido ${p.codigo} confirmado e já liberado para a produção!\nComo ${ROTULO_TIPO[p.tipo].toLowerCase()} cadastrada, ele é faturado: não precisa de sinal. Entrega em ${dataBR(p.data_entrega)}, saída do motorista às ${p.horario}.`,
        { botoes: [{ rotulo: '📦 Acompanhar pedido', valor: 'acompanhar' }] });
    }
    return p;
  }

  // ------------------------------------------------------------- Liberação e comanda
  function liberarParaProducao(p, detalhe) {
    mudarStatus(p, STATUS.LIBERADO);
    registrar(p.id, 'sis_libera', detalhe);
    const itens = todos('SELECT * FROM itens WHERE pedido_id = ?', p.id);
    const tarefas = desmembrar(itens, banco.produtos());
    for (const t of tarefas) {
      exec('INSERT INTO tarefas (pedido_id, item_id, setor, status, pendente, atualizado_em) VALUES (?,?,?,?,?,?)',
        p.id, t.itemId, t.setor, t.status, t.pendente, iso());
    }
    const setores = setoresDoPedido(tarefas);
    registrar(p.id, 'sis_desmembra', `${tarefas.length} tarefa(s) em ${setores.length} setor(es)`);
    mudarStatus(p, STATUS.EM_PRODUCAO);
    registrar(p.id, 'sis_ordena', `Saída do motorista: ${dataBR(p.data_entrega)} às ${p.horario}`);
    registrar(p.id, 'sis_setores', setores.map((s) => SETORES[s].nome).join(', '));
    for (const s of setores) registrar(p.id, ATIVIDADE_SETOR[s].ve, 'Tarefa na fila do setor');
  }

  // ------------------------------------------------------------- Comprovantes
  function receberComprovante(pedidoId, arquivoUrl) {
    const p = exigirPedido(pedidoId);
    if (p.status === STATUS.AGUARDANDO_SINAL) {
      transacao(() => {
        registrar(p.id, 'cli_paga_sinal', 'Comprovante enviado pelo chatbot');
        registrar(p.id, 'sis_comprovante', arquivoUrl);
        mudarStatus(p, STATUS.AGUARDANDO_CONFIRMACAO, { comprovante_sinal: arquivoUrl });
        registrar(p.id, 'sis_aguardando', 'Gestão notificada');
      });
      falar(p.conversa_id, '🧾 Recebi seu comprovante! A gestão vai conferir o pagamento e eu te aviso assim que o pedido entrar em produção.');
      avisarPainel(p, `🧾 Comprovante do ${p.codigo} aguardando validação`);
      return p;
    }
    if (p.status === STATUS.AGUARDANDO_SALDO) {
      exec('UPDATE pedidos SET comprovante_saldo = ?, atualizado_em = ? WHERE id = ?', arquivoUrl, iso(), p.id);
      registrar(p.id, 'cli_recebe_valor', 'Comprovante do saldo enviado — conferir na retirada');
      falar(p.conversa_id, '🧾 Comprovante do saldo recebido! É só apresentar na retirada.');
      avisarPainel(p, `🧾 ${p.codigo} enviou o comprovante do saldo`);
      return p;
    }
    throw new ErroRegra(`O pedido ${p.codigo} não está aguardando pagamento (${ROTULO_STATUS[p.status]}).`);
  }

  // ------------------------------------------------------------- Gestão
  function validarPagamento(pedidoId, aprovado) {
    const p = exigirPedido(pedidoId);
    if (p.status !== STATUS.AGUARDANDO_CONFIRMACAO) {
      throw new ErroRegra(`O pedido ${p.codigo} não está aguardando confirmação (${ROTULO_STATUS[p.status]}).`);
    }
    if (!aprovado) return cancelar(p, 'O comprovante do sinal não foi confirmado pela gestão.', false);
    transacao(() => {
      registrar(p.id, 'ges_confere', 'Comprovante conferido');
      registrar(p.id, 'ges_confirmado', 'Sim');
      exec('INSERT INTO caixa (pedido_id, tipo, valor, em) VALUES (?,?,?,?)', p.id, 'sinal', p.sinal, iso());
      liberarParaProducao(p, `Sinal de ${dinheiro(p.sinal)} confirmado`);
      exec('UPDATE pedidos SET prazo_validacao_ate = NULL WHERE id = ?', p.id);
    });
    falar(p.conversa_id, `💚 Pagamento confirmado! O pedido ${p.codigo} já está na fila da produção para ${dataBR(p.data_entrega)} às ${p.horario}.`,
      { botoes: [{ rotulo: '📦 Acompanhar pedido', valor: 'acompanhar' }] });
    avisarPainel(p, `${p.codigo} liberado para a produção`);
    return pedido(p.id);
  }

  function cancelar(p, motivo, porPrazo) {
    transacao(() => {
      if (porPrazo) {
        registrar(p.id, 'sis_prazo', 'Sinal não pago/validado no prazo');
      } else {
        registrar(p.id, 'ges_confere', 'Comprovante conferido');
        registrar(p.id, 'ges_confirmado', 'Não');
      }
      mudarStatus(p, STATUS.CANCELADO, { motivo, prazo_validacao_ate: null });
      registrar(p.id, 'sis_cancela', motivo);
      registrar(p.id, 'cli_aviso_cancelamento', 'Aviso enviado pelo chatbot');
      registrar(p.id, 'cli_fim', 'Pedido cancelado');
    });
    falar(p.conversa_id, `⚠️ O pedido ${p.codigo} foi cancelado: ${motivo}\nSe quiser, é só fazer um novo pedido.`,
      { botoes: [{ rotulo: '🛒 Fazer um novo pedido', valor: 'pedido' }] });
    avisarPainel(p, `${p.codigo} cancelado`);
    return pedido(p.id);
  }

  function verificarPrazos() {
    const candidatos = todos(`SELECT * FROM pedidos WHERE status IN ('AGUARDANDO_SINAL','AGUARDANDO_CONFIRMACAO')`);
    return pedidosVencidos(candidatos, agora())
      .map((p) => cancelar(p, 'o sinal não foi pago e validado dentro do prazo.', true));
  }

  // ------------------------------------------------------------- Produção
  function filaSetor(setor) {
    const tarefas = todos(
      `SELECT t.*, p.codigo, p.cliente_nome, p.tipo, p.data_entrega, p.horario,
              i.qtd, pr.nome AS produto, pr.icone, pr.venda
         FROM tarefas t JOIN pedidos p ON p.id = t.pedido_id
         JOIN itens i ON i.id = t.item_id JOIN produtos pr ON pr.id = i.produto_id
        WHERE t.setor = ? AND p.status = 'EM_PRODUCAO' AND t.status <> 'pronto'`, setor);
    return ordenarFila(tarefas);
  }

  function atualizarTarefa(tarefaId, novoStatus) {
    const t = um('SELECT * FROM tarefas WHERE id = ?', Number(tarefaId));
    if (!t) throw new ErroRegra('Tarefa não encontrada.', 'nao_encontrado');
    const p = exigirPedido(t.pedido_id);
    if (p.status !== STATUS.EM_PRODUCAO) throw new ErroRegra(`O pedido ${p.codigo} não está em produção.`);
    let foiParaConferencia = false;
    transacao(() => {
      try {
        proximoStatusTarefa(t.status, novoStatus);
      } catch (e) { throw new ErroRegra(e.message); }
      exec('UPDATE tarefas SET status = ?, atualizado_em = ? WHERE id = ?', novoStatus, iso(), t.id);
      const item = um('SELECT i.qtd, pr.nome FROM itens i JOIN produtos pr ON pr.id = i.produto_id WHERE i.id = ?', t.item_id);
      registrar(p.id, t.pendente ? 'pro_pendente' : ATIVIDADE_SETOR[t.setor].produz,
        `${item.qtd}× ${item.nome}: ${novoStatus === 'produzindo' ? 'Produzindo' : 'Pronto'}`);
      const tarefas = todos('SELECT * FROM tarefas WHERE pedido_id = ?', p.id);
      if (todosProntos(tarefas)) {
        registrar(p.id, 'pro_todos_prontos', 'Todos os setores concluíram');
        mudarStatus(p, STATUS.CONFERENCIA, { conferido: 0 });
        foiParaConferencia = true;
      }
    });
    if (foiParaConferencia) {
      falar(p.conversa_id, `🥐 Tudo pronto na produção! O pedido ${p.codigo} está em conferência e pesagem.`);
    }
    avisarPainel(p, foiParaConferencia ? `${p.codigo}: todos os setores terminaram, pronto para conferência` : undefined);
    return pedido(p.id);
  }

  // ------------------------------------------------------------- Conferência / Expedição
  function conferir(pedidoId, checklist) {
    const p = exigirPedido(pedidoId);
    if (p.status !== STATUS.CONFERENCIA) throw new ErroRegra(`O pedido ${p.codigo} não está em conferência.`);
    const itens = todos('SELECT * FROM itens WHERE pedido_id = ?', p.id);
    const r = avaliarConferencia(itens, checklist);
    transacao(() => {
      registrar(p.id, 'con_confere', `${itens.length - r.faltantes.length} de ${itens.length} item(ns) conferido(s)`);
      registrar(p.id, 'con_completo', r.completo ? 'Sim' : 'Não');
      if (r.completo) {
        exec('UPDATE pedidos SET conferido = 1 WHERE id = ?', p.id);
      } else {
        for (const itemId of r.faltantes) {
          exec(`UPDATE tarefas SET status = 'aguardando', pendente = 1, atualizado_em = ? WHERE item_id = ?`, iso(), itemId);
        }
        mudarStatus(p, STATUS.EM_PRODUCAO, { conferido: 0 });
        registrar(p.id, 'pro_pendente', `${r.faltantes.length} item(ns) devolvido(s) para a produção`);
      }
    });
    avisarPainel(p, r.completo ? `${p.codigo} conferido` : `${p.codigo}: item pendente voltou para a produção`);
    return { pedido: pedido(p.id), ...r };
  }

  async function pesar(pedidoId, pesos) {
    const p = exigirPedido(pedidoId);
    if (p.status !== STATUS.CONFERENCIA || !p.conferido) {
      throw new ErroRegra(`O pedido ${p.codigo} precisa ser conferido antes da pesagem.`);
    }
    const itens = todos('SELECT * FROM itens WHERE pedido_id = ?', p.id);
    let calc;
    try {
      calc = calcularValorFinal(itens, banco.produtos(), pesos);
    } catch (e) { throw new ErroRegra(e.message); }
    const avulso = precisaSinal(p.tipo);
    const { saldo, credito } = calcularSaldo(calc.total, avulso ? p.sinal : 0);
    transacao(() => {
      for (const l of calc.linhas) {
        exec('UPDATE itens SET peso_kg = ?, valor_final = ? WHERE id = ?', l.pesoKg, l.valor, l.itemId);
      }
      const pesoTotal = calc.linhas.reduce((s, l) => s + l.pesoKg, 0);
      registrar(p.id, 'con_pesa', `Peso total ${pesoTotal.toFixed(3).replace('.', ',')} kg`);
      registrar(p.id, 'sis_calcula_peso', `Valor final ${dinheiro(calc.total)} (estimado era ${dinheiro(p.valor_estimado)})`);
      registrar(p.id, 'sis_pedido_avulso', avulso ? 'Sim' : 'Não');
      if (avulso) {
        mudarStatus(p, STATUS.AGUARDANDO_SALDO, { valor_final: calc.total, saldo, credito });
        registrar(p.id, 'sis_cobra_saldo', `Saldo de ${dinheiro(saldo)} (final ${dinheiro(calc.total)} − sinal ${dinheiro(p.sinal)})`);
        registrar(p.id, 'cli_recebe_valor', 'Cobrança do saldo enviada pelo chatbot');
      } else {
        exec('INSERT INTO caixa (pedido_id, tipo, valor, em) VALUES (?,?,?,?)', p.id, 'faturar', calc.total, iso());
        mudarStatus(p, STATUS.PRONTO_ENTREGA, { valor_final: calc.total, saldo: 0, credito: 0 });
        registrar(p.id, 'sis_consolida', `${dinheiro(calc.total)} lançado no caixa como faturado`);
      }
    });
    const atual = pedido(p.id);
    if (avulso) {
      if (saldo > 0) {
        const pix = await cobrancaPix(atual, saldo, 'SALDO');
        falar(p.conversa_id,
          `⚖️ Pedido ${p.codigo} pesado: total de ${dinheiro(calc.total)}. Já descontei o sinal de ${dinheiro(p.sinal)}.\nFalta pagar ${dinheiro(saldo)}: pague pelo PIX abaixo ou no balcão, na retirada (${dataBR(p.data_entrega)} às ${p.horario}).`,
          { pix, upload: 'saldo' });
      } else {
        falar(p.conversa_id, `⚖️ Pedido ${p.codigo} pesado: total de ${dinheiro(calc.total)}. O sinal já cobriu tudo${credito > 0 ? ` e você tem ${dinheiro(credito)} de crédito` : ''}. É só retirar em ${dataBR(p.data_entrega)} às ${p.horario}!`);
      }
    } else {
      falar(p.conversa_id, `📦 Pedido ${p.codigo} conferido e pesado (${dinheiro(calc.total)}, faturado). Sai com o motorista em ${dataBR(p.data_entrega)} às ${p.horario}.`);
    }
    avisarPainel(atual, `${p.codigo} pesado: ${dinheiro(calc.total)}`);
    return atual;
  }

  function liberarMercadoria(pedidoId) {
    const p = exigirPedido(pedidoId);
    if (![STATUS.AGUARDANDO_SALDO, STATUS.PRONTO_ENTREGA].includes(p.status)) {
      throw new ErroRegra(`O pedido ${p.codigo} ainda não pode ser liberado (${ROTULO_STATUS[p.status]}).`);
    }
    transacao(() => {
      if (p.status === STATUS.AGUARDANDO_SALDO) {
        if (p.saldo > 0) exec('INSERT INTO caixa (pedido_id, tipo, valor, em) VALUES (?,?,?,?)', p.id, 'saldo', p.saldo, iso());
        registrar(p.id, 'cli_paga_saldo', p.saldo > 0 ? `Saldo de ${dinheiro(p.saldo)} recebido` : 'Nada a pagar');
      }
      registrar(p.id, 'con_libera', p.tipo === 'individual' ? 'Retirada no balcão' : 'Saiu com o motorista');
      mudarStatus(p, STATUS.ENTREGUE);
      if (p.tipo === 'individual') registrar(p.id, 'cli_fim', 'Pedido retirado');
    });
    falar(p.conversa_id, `🎉 Pedido ${p.codigo} entregue. Obrigado por comprar na Padaria Vitória!`,
      { botoes: [{ rotulo: '🛒 Fazer outro pedido', valor: 'pedido' }] });
    avisarPainel(p, `${p.codigo} entregue`);
    return pedido(p.id);
  }

  // ------------------------------------------------------------- Relatórios e fechamento
  function relatorio({ de, ate } = {}) {
    const hoje = dataLocal(agora());
    const inicio = de || hoje;
    const fim = ate || hoje;
    const pedidos = todos('SELECT * FROM pedidos ORDER BY id')
      .filter((p) => { const d = dataLocal(new Date(p.criado_em)); return d >= inicio && d <= fim; });
    const ids = new Set(pedidos.map((p) => p.id));
    const caixa = todos('SELECT * FROM caixa').filter((c) => ids.has(c.pedido_id));
    const soma = (tipo) => caixa.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.valor, 0);
    const porStatus = {};
    for (const p of pedidos) porStatus[p.status] = (porStatus[p.status] ?? 0) + 1;
    const porTipo = {};
    for (const p of pedidos) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;
    const porProduto = todos(
      `SELECT pr.nome, pr.icone, pr.venda, SUM(i.qtd) AS qtd, SUM(COALESCE(i.peso_kg,0)) AS peso,
              SUM(COALESCE(i.valor_final, 0)) AS valor
         FROM itens i JOIN produtos pr ON pr.id = i.produto_id JOIN pedidos p ON p.id = i.pedido_id
        WHERE p.status IN ('AGUARDANDO_SALDO','PRONTO_ENTREGA','ENTREGUE','FECHADO','LIBERADO','EM_PRODUCAO','CONFERENCIA')
        GROUP BY pr.id ORDER BY qtd DESC`)
      .filter(() => true);
    return {
      periodo: { de: inicio, ate: fim },
      totalPedidos: pedidos.length,
      porStatus,
      porTipo,
      caixa: { sinais: soma('sinal'), saldos: soma('saldo'), faturar: soma('faturar'), recebido: soma('sinal') + soma('saldo') },
      porProduto,
      ocorrencias: pedidos.filter((p) => ['BLOQUEADO', 'CANCELADO'].includes(p.status))
        .map((p) => ({ codigo: p.codigo, status: p.status, cliente: p.cliente_nome, motivo: p.motivo })),
      pedidos,
    };
  }

  function fechamento() {
    const entregues = todos(`SELECT * FROM pedidos WHERE status = 'ENTREGUE'`);
    transacao(() => {
      for (const p of entregues) {
        mudarStatus(p, STATUS.FECHADO);
        registrar(p.id, 'ges_relatorios', 'Relatório exportado no fechamento');
        registrar(p.id, 'ges_fim', 'Processo encerrado');
      }
    });
    notificar({ tipo: 'pedido', texto: `Fechamento: ${entregues.length} pedido(s) encerrado(s)` });
    return entregues.length;
  }

  // ------------------------------------------------------------- Consultas
  function detalhes(pedidoId) {
    const p = exigirPedido(pedidoId);
    return {
      ...p,
      itens: itensDoPedido(p.id),
      tarefas: todos('SELECT * FROM tarefas WHERE pedido_id = ?', p.id),
      eventos: todos('SELECT * FROM eventos WHERE pedido_id = ? ORDER BY id', p.id),
    };
  }

  const listarPedidos = () => todos('SELECT * FROM pedidos ORDER BY id DESC');

  return {
    registrar, falar, criarPedido, receberComprovante, validarPagamento, verificarPrazos,
    filaSetor, atualizarTarefa, conferir, pesar, liberarMercadoria, relatorio, fechamento,
    detalhes, listarPedidos, itensDoPedido, pedido, minutosPrazo,
  };
}
