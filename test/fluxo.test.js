// Fluxo de ponta a ponta pela API HTTP, seguindo os caminhos do TO-BE.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/servidor.js';

let srv; let base; let ctx; let pasta;
let relogio = new Date(2026, 10, 12, 10, 0); // 12/11/2026 10:00
const agora = () => relogio;

before(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'padaria-'));
  ctx = criarApp({ arquivoBanco: path.join(pasta, 'teste.db'), pastaUploads: path.join(pasta, 'up'), agora });
  ctx.banco.semear({ modoDemo: true });
  await new Promise((ok) => { srv = ctx.app.listen(0, ok); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => { srv.close(); ctx.parar(); rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, url, corpo) {
  const r = await fetch(base + url, {
    method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw Object.assign(new Error(json.erro), { status: r.status });
  return json;
}

const produtoId = (nome) => ctx.banco.um('SELECT id FROM produtos WHERE nome = ?', nome).id;
const atividades = (pedidoId) => ctx.banco.todos('SELECT atividade FROM eventos WHERE pedido_id = ? ORDER BY id', pedidoId).map((e) => e.atividade);
const mensagensBot = (id) => ctx.bot.mensagens(id).filter((m) => m.autor === 'bot');
const caixa = (pedidoId) => ctx.banco.todos('SELECT tipo, valor FROM caixa WHERE pedido_id = ? ORDER BY id', pedidoId).map((c) => ({ ...c }));

/** Percorre a conversa por botões, como o cliente faria. */
async function conversar({ tipo, nome, telefone, cnpj, itens, data = '2026-11-14', horario = '08:00' }) {
  const { id } = await api('POST', '/api/conversas');
  const b = (valor) => api('POST', `/api/conversas/${id}/entrada`, { tipo: 'botao', valor });
  const t = (texto) => api('POST', `/api/conversas/${id}/entrada`, { tipo: 'texto', texto });
  await b('pedido');
  await b(tipo);
  await t(nome);
  await t(telefone);
  if (cnpj) await t(cnpj);
  await api('POST', `/api/conversas/${id}/entrada`, { tipo: 'carrinho', itens });
  await b(data);
  await b(horario);
  await b('confirmar');
  const conversa = ctx.bot.carregar(id);
  return { id, pedido: ctx.processo.pedido(conversa.pedido_id) };
}

async function produzirTudo(pedidoId) {
  for (const t of ctx.banco.todos(`SELECT * FROM tarefas WHERE pedido_id = ? AND status <> 'pronto'`, pedidoId)) {
    if (t.status === 'aguardando') await api('POST', `/api/tarefas/${t.id}/status`, { status: 'produzindo' });
    await api('POST', `/api/tarefas/${t.id}/status`, { status: 'pronto' });
  }
}

const itensDe = (pedidoId) => ctx.banco.todos('SELECT * FROM itens WHERE pedido_id = ? ORDER BY id', pedidoId).map((c) => ({ ...c }));

test('Avulso: sinal → comprovante → gestão valida → produção → item pendente → pesagem → saldo → entrega', async () => {
  const pao = produtoId('Pão francês');
  const brig = produtoId('Brigadeiro');
  const { id, pedido } = await conversar({
    tipo: 'individual', nome: 'Ana', telefone: '(31) 99999-1111',
    itens: [{ produtoId: pao, qtd: 20 }, { produtoId: brig, qtd: 25 }],
  });
  // estimado = 20 × 0,05 kg × 18,90 + 25 × 2,20 = 18,90 + 55,00 = 73,90 → sinal 36,95
  assert.equal(pedido.status, 'AGUARDANDO_SINAL');
  assert.equal(pedido.valor_estimado, 73.9);
  assert.equal(pedido.sinal, 36.95);
  const cobranca = mensagensBot(id).find((m) => m.extra?.pix);
  assert.ok(cobranca, 'o chat precisa receber a cobrança PIX');
  assert.equal(cobranca.extra.pix.valor, 36.95);
  assert.match(cobranca.extra.pix.qr, /^data:image\/png;base64,/);

  // Gestão não pode validar antes do comprovante
  await assert.rejects(api('POST', `/api/pedidos/${pedido.id}/validar-pagamento`, { aprovado: true }), { status: 422 });

  await api('POST', `/api/conversas/${id}/comprovante-exemplo`);
  assert.equal(ctx.processo.pedido(pedido.id).status, 'AGUARDANDO_CONFIRMACAO');

  await api('POST', `/api/pedidos/${pedido.id}/validar-pagamento`, { aprovado: true });
  assert.equal(ctx.processo.pedido(pedido.id).status, 'EM_PRODUCAO');
  assert.deepEqual(caixa(pedido.id), [{ tipo: 'sinal', valor: 36.95 }]);

  const tarefas = ctx.banco.todos('SELECT * FROM tarefas WHERE pedido_id = ?', pedido.id);
  assert.deepEqual(tarefas.map((t) => t.setor).sort(), ['confeitaria', 'paes']);
  // Produção não pode pular de "aguardando" para "pronto"
  await assert.rejects(api('POST', `/api/tarefas/${tarefas[0].id}/status`, { status: 'pronto' }), { status: 422 });

  // Join: com só um setor pronto, o pedido continua em produção
  await api('POST', `/api/tarefas/${tarefas[0].id}/status`, { status: 'produzindo' });
  await api('POST', `/api/tarefas/${tarefas[0].id}/status`, { status: 'pronto' });
  assert.equal(ctx.processo.pedido(pedido.id).status, 'EM_PRODUCAO');
  await produzirTudo(pedido.id);
  assert.equal(ctx.processo.pedido(pedido.id).status, 'CONFERENCIA');

  // Pesagem sem conferência é recusada
  const [iPao, iBrig] = itensDe(pedido.id);
  await assert.rejects(api('POST', `/api/pedidos/${pedido.id}/pesagem`, { itens: [] }), { status: 422 });

  // Conferência incompleta: o brigadeiro volta para a produção como pendente
  await api('POST', `/api/pedidos/${pedido.id}/conferencia`, { itens: [{ itemId: iPao.id, ok: true }, { itemId: iBrig.id, ok: false }] });
  assert.equal(ctx.processo.pedido(pedido.id).status, 'EM_PRODUCAO');
  const fila = await api('GET', '/api/producao/confeitaria');
  assert.equal(fila.length, 1);
  assert.equal(fila[0].pendente, 1);
  assert.equal((await api('GET', '/api/producao/paes')).length, 0, 'o pão já pronto não volta para a fila');
  await produzirTudo(pedido.id);
  assert.equal(ctx.processo.pedido(pedido.id).status, 'CONFERENCIA');

  await api('POST', `/api/pedidos/${pedido.id}/conferencia`, { itens: [{ itemId: iPao.id, ok: true }, { itemId: iBrig.id, ok: true }] });
  // final = 1,1 kg × 18,90 + 25 × 2,20 = 20,79 + 55 = 75,79 → saldo = 75,79 − 36,95 = 38,84
  await api('POST', `/api/pedidos/${pedido.id}/pesagem`, { itens: [{ itemId: iPao.id, pesoKg: 1.1 }, { itemId: iBrig.id, pesoKg: 0.5 }] });
  const pesado = ctx.processo.pedido(pedido.id);
  assert.equal(pesado.status, 'AGUARDANDO_SALDO');
  assert.equal(pesado.valor_final, 75.79);
  assert.equal(pesado.saldo, 38.84);
  assert.ok(mensagensBot(id).some((m) => m.extra?.pix?.valor === 38.84), 'cobrança do saldo no chat');

  await api('POST', `/api/pedidos/${pedido.id}/liberar`);
  assert.equal(ctx.processo.pedido(pedido.id).status, 'ENTREGUE');
  assert.deepEqual(caixa(pedido.id), [{ tipo: 'sinal', valor: 36.95 }, { tipo: 'saldo', valor: 38.84 }]);

  // O log segue a ordem do diagrama
  const seq = atividades(pedido.id);
  const ordem = ['cli_confirma', 'sis_classifica', 'sis_valida', 'sis_sazonalidade', 'sis_avulso', 'sis_cobra_sinal',
    'cli_paga_sinal', 'sis_aguardando', 'ges_confere', 'sis_libera', 'sis_desmembra', 'sis_ordena',
    'pro_todos_prontos', 'con_confere', 'pro_pendente', 'con_pesa', 'sis_calcula_peso', 'sis_cobra_saldo', 'con_libera', 'cli_fim'];
  let pos = -1;
  for (const a of ordem) {
    const i = seq.indexOf(a, pos + 1);
    assert.ok(i > pos, `atividade fora de ordem ou ausente: ${a}`);
    pos = i;
  }
});

test('Escola: classificada pelo cadastro, sem sinal, prazo ajustado, faturada e fechada', async () => {
  const { pedido } = await conversar({
    tipo: 'empresa', nome: 'Colégio', telefone: '31988880001', cnpj: '11.222.333/0001-81',
    itens: [{ produtoId: produtoId('Mini coxinha'), qtd: 100 }], data: '2026-11-13', horario: '09:30',
  });
  assert.equal(pedido.tipo, 'escola', 'o cadastro prevalece sobre o tipo informado');
  assert.equal(pedido.status, 'EM_PRODUCAO', 'escola vai direto para a produção');
  assert.equal(pedido.sinal, 0);
  assert.equal(pedido.data_entrega, '2026-11-14', 'PJ precisa de 2 dias: 13/11 vira 14/11');
  assert.ok(!atividades(pedido.id).includes('sis_cobra_sinal'));

  await produzirTudo(pedido.id);
  const [item] = itensDe(pedido.id);
  await api('POST', `/api/pedidos/${pedido.id}/conferencia`, { itens: [{ itemId: item.id, ok: true }] });
  await api('POST', `/api/pedidos/${pedido.id}/pesagem`, { itens: [{ itemId: item.id, pesoKg: 2 }] });
  const pesado = ctx.processo.pedido(pedido.id);
  assert.equal(pesado.status, 'PRONTO_ENTREGA');
  assert.equal(pesado.valor_final, 110);
  assert.deepEqual(caixa(pedido.id), [{ tipo: 'faturar', valor: 110 }]);
  assert.ok(atividades(pedido.id).includes('sis_consolida'));

  await api('POST', `/api/pedidos/${pedido.id}/liberar`);
  const { fechados } = await api('POST', '/api/fechamento');
  assert.ok(fechados >= 1);
  assert.equal(ctx.processo.pedido(pedido.id).status, 'FECHADO');
  assert.ok(atividades(pedido.id).includes('ges_relatorios'));
});

test('Bloqueio: pedido duplicado e CNPJ inválido são barrados com o motivo no chat', async () => {
  const dados = { tipo: 'individual', nome: 'Bruno', telefone: '31977776666', itens: [{ produtoId: produtoId('Sonho'), qtd: 4 }] };
  const primeiro = await conversar(dados);
  assert.equal(primeiro.pedido.status, 'AGUARDANDO_SINAL');
  const segundo = await conversar(dados);
  assert.equal(segundo.pedido.status, 'BLOQUEADO');
  assert.match(segundo.pedido.motivo, /duplicado/);
  assert.ok(mensagensBot(segundo.id).some((m) => /duplicado/.test(m.texto)));

  const pj = await conversar({ tipo: 'empresa', nome: 'Firma', telefone: '31955554444', cnpj: '12.345.678/0001-00', itens: [{ produtoId: produtoId('Sonho'), qtd: 4 }] });
  assert.equal(pj.pedido.status, 'BLOQUEADO');
  assert.match(pj.pedido.motivo, /CNPJ/);
  assert.ok(!ctx.banco.um('SELECT 1 AS x FROM tarefas WHERE pedido_id = ?', pj.pedido.id), 'bloqueado não gera tarefa');
});

test('Cancelamento: gestão recusa o comprovante, e o prazo vencido cancela sozinho', async () => {
  const a = await conversar({ tipo: 'individual', nome: 'Caio', telefone: '31911112222', itens: [{ produtoId: produtoId('Sonho'), qtd: 2 }] });
  await api('POST', `/api/conversas/${a.id}/comprovante-exemplo`);
  await api('POST', `/api/pedidos/${a.pedido.id}/validar-pagamento`, { aprovado: false });
  assert.equal(ctx.processo.pedido(a.pedido.id).status, 'CANCELADO');
  assert.ok(mensagensBot(a.id).some((m) => /cancelado/.test(m.texto)));

  const b = await conversar({ tipo: 'individual', nome: 'Duda', telefone: '31933334444', itens: [{ produtoId: produtoId('Sonho'), qtd: 3 }] });
  ctx.processo.verificarPrazos();
  assert.equal(ctx.processo.pedido(b.pedido.id).status, 'AGUARDANDO_SINAL', 'antes do prazo não cancela');
  relogio = new Date(relogio.getTime() + 3 * 60_000); // modo demo: prazo de 2 min
  ctx.processo.verificarPrazos();
  const cancelado = ctx.processo.pedido(b.pedido.id);
  assert.equal(cancelado.status, 'CANCELADO');
  assert.ok(atividades(b.pedido.id).includes('sis_prazo'));
  await assert.rejects(api('POST', `/api/conversas/${b.id}/comprovante-exemplo`), { status: 422 }, 'pedido cancelado não aceita comprovante');
});

test('Relatório: totaliza o caixa e exporta CSV', async () => {
  const r = await api('GET', '/api/relatorios?de=2026-11-12&ate=2026-11-12');
  assert.ok(r.totalPedidos >= 6);
  assert.equal(Math.round(r.caixa.recebido * 100) / 100, 75.79);
  assert.equal(r.caixa.faturar, 110);
  const csv = await fetch(`${base}/api/relatorios.csv?de=2026-11-12&ate=2026-11-12`);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /PV-0001/);
});
