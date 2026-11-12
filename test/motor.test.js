// Regras do TO-BE, uma a uma, como funções puras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar, validarCNPJ } from '../src/motor/classificar.js';
import { validarPedido, assinaturaItens } from '../src/motor/validar.js';
import { aplicarSazonalidade } from '../src/motor/sazonalidade.js';
import { calcularEstimado, calcularSinal, precisaSinal, pixCopiaECola, crc16 } from '../src/motor/cobranca.js';
import { desmembrar, ordenarFila, todosProntos, proximoStatusTarefa } from '../src/motor/comanda.js';
import { avaliarConferencia, calcularValorFinal, calcularSaldo } from '../src/motor/pesagem.js';
import { pedidosVencidos } from '../src/motor/timer.js';
import { podeTransitar, exigirTransicao } from '../src/motor/estados.js';

const AGORA = new Date(2026, 10, 12, 10, 0); // 12/11/2026 10:00 (horário local)

const PRODUTOS = [
  { id: 1, nome: 'Pão francês', setor: 'paes', venda: 'kg', preco: 20, peso_medio_kg: 0.05, qtd_min: 10, qtd_max: 3000, ativo: 1 },
  { id: 2, nome: 'Brigadeiro', setor: 'confeitaria', venda: 'un', preco: 2, peso_medio_kg: 0.02, qtd_min: 25, qtd_max: 2000, ativo: 1 },
  { id: 3, nome: 'Panetone', setor: 'confeitaria', venda: 'un', preco: 40, peso_medio_kg: 0.75, qtd_min: 1, qtd_max: 200, ativo: 1, sazonal_inicio: '11-01', sazonal_fim: '12-31' },
  { id: 4, nome: 'Ovo de Páscoa', setor: 'confeitaria', venda: 'un', preco: 50, peso_medio_kg: 0.35, qtd_min: 1, qtd_max: 200, ativo: 1, sazonal_inicio: '03-01', sazonal_fim: '04-30' },
  { id: 5, nome: 'Coxinha', setor: 'salgados', venda: 'un', preco: 1, peso_medio_kg: 0.02, qtd_min: 25, qtd_max: 3000, ativo: 0 },
];
const REGRAS = [{ nome: 'Natal', inicio: '12-01', fim: '12-31', prazo_dias: 3 }];

const pedidoBase = (extra = {}) => ({
  tipo: 'individual', telefone: '31999990000', cnpj: null,
  itens: [{ produtoId: 1, qtd: 20 }], dataEntrega: '2026-11-14', horario: '08:00', ...extra,
});

test('Classifica: o cadastro da padaria prevalece sobre o tipo informado', () => {
  const cad = [{ nome: 'Colégio X', tipo: 'escola', cnpj: '11222333000181' }];
  assert.equal(classificar({ tipoInformado: 'empresa', cnpj: '11.222.333/0001-81' }, cad).tipo, 'escola');
  assert.equal(classificar({ tipoInformado: 'empresa', cnpj: '11444777000161' }, cad).tipo, 'empresa');
  assert.equal(classificar({ tipoInformado: 'individual' }, cad).avulso, true);
});

test('CNPJ: confere os dígitos verificadores', () => {
  assert.equal(validarCNPJ('11.222.333/0001-81'), true);
  assert.equal(validarCNPJ('11.222.333/0001-82'), false);
  assert.equal(validarCNPJ('00000000000000'), false);
});

test('Valida: pedido correto passa', () => {
  const r = validarPedido({ pedido: pedidoBase(), produtos: PRODUTOS, agora: AGORA });
  assert.deepEqual(r.motivos, []);
  assert.equal(r.valido, true);
});

test('Valida: bloqueia produto inativo, quantidade fora do limite e item fora de época', () => {
  const r = validarPedido({
    pedido: pedidoBase({ itens: [{ produtoId: 5, qtd: 30 }, { produtoId: 2, qtd: 10 }, { produtoId: 4, qtd: 1 }] }),
    produtos: PRODUTOS, agora: AGORA,
  });
  assert.equal(r.valido, false);
  assert.equal(r.motivos.length, 3);
  assert.match(r.motivos.join(' '), /não está disponível/);
  assert.match(r.motivos.join(' '), /mínima é 25/);
  assert.match(r.motivos.join(' '), /sazonal/);
});

test('Valida: produto sazonal dentro do período é aceito', () => {
  const r = validarPedido({ pedido: pedidoBase({ itens: [{ produtoId: 3, qtd: 2 }] }), produtos: PRODUTOS, agora: AGORA });
  assert.equal(r.valido, true);
});

test('Valida: bloqueia data passada, horário fora do expediente e CNPJ inválido de PJ', () => {
  const r = validarPedido({
    pedido: pedidoBase({ tipo: 'escola', cnpj: '11222333000182', dataEntrega: '2026-11-01', horario: '22:00' }),
    produtos: PRODUTOS, agora: AGORA,
  });
  assert.equal(r.motivos.length, 3);
});

test('Valida: bloqueia pedido duplicado (mesmo cliente, data e itens) e aceita se os itens mudam', () => {
  const aberto = { codigo: 'PV-0001', telefone: '31999990000', cnpj: null, dataEntrega: '2026-11-14', assinatura: assinaturaItens([{ produtoId: 1, qtd: 20 }]) };
  const dup = validarPedido({ pedido: pedidoBase(), produtos: PRODUTOS, pedidosAbertos: [aberto], agora: AGORA });
  assert.equal(dup.valido, false);
  assert.match(dup.motivos[0], /duplicado.*PV-0001/);
  const outro = validarPedido({ pedido: pedidoBase({ itens: [{ produtoId: 1, qtd: 30 }] }), produtos: PRODUTOS, pedidosAbertos: [aberto], agora: AGORA });
  assert.equal(outro.valido, true);
});

test('Sazonalidade: ajusta a data quando o prazo não é suficiente (não bloqueia)', () => {
  const r = aplicarSazonalidade({ tipo: 'escola', itens: [{ qtd: 20 }], dataEntrega: '2026-11-13', agora: AGORA, regras: REGRAS });
  assert.equal(r.ajustado, true);
  assert.equal(r.dataEntrega, '2026-11-14'); // PJ: 2 dias
});

test('Sazonalidade: período de Natal exige 3 dias', () => {
  const agoraDez = new Date(2026, 11, 10, 10, 0);
  const r = aplicarSazonalidade({ tipo: 'individual', itens: [{ qtd: 5 }], dataEntrega: '2026-12-11', agora: agoraDez, regras: REGRAS });
  assert.equal(r.dataEntrega, '2026-12-13');
  assert.equal(r.regra, 'Natal');
});

test('Sazonalidade: pedido grande ganha +1 dia', () => {
  const r = aplicarSazonalidade({ tipo: 'individual', itens: [{ qtd: 500 }], dataEntrega: '2026-11-13', agora: AGORA, regras: [] });
  assert.equal(r.dataEntrega, '2026-11-14');
});

test('Cobrança: só o avulso paga sinal, e o sinal é 50% do estimado', () => {
  assert.equal(precisaSinal('individual'), true);
  assert.equal(precisaSinal('escola'), false);
  assert.equal(precisaSinal('empresa'), false);
  const est = calcularEstimado([{ produtoId: 1, qtd: 20 }, { produtoId: 2, qtd: 25 }], PRODUTOS);
  assert.equal(est, 70); // 20 × 0,05 kg × 20 + 25 × 2
  assert.equal(calcularSinal(est), 35);
});

test('PIX: BR Code com CRC16 correto', () => {
  assert.equal(crc16('123456789'), '29B1'); // vetor de teste do CRC-16/CCITT-FALSE
  const code = pixCopiaECola({ chave: 'pix@x.com', nome: 'Padaria Vitória', cidade: 'Belo Horizonte', valor: 35, txid: 'PV-0001' });
  assert.match(code, /^000201/);
  assert.match(code, /540535\.00/);
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
});

test('Comanda: desmembra um item por setor e ordena pelo horário de saída', () => {
  const t = desmembrar([{ id: 10, produto_id: 1 }, { id: 11, produto_id: 2 }], PRODUTOS);
  assert.deepEqual(t.map((x) => x.setor), ['paes', 'confeitaria']);
  const fila = ordenarFila([
    { id: 1, data_entrega: '2026-11-14', horario: '10:00', pendente: 0 },
    { id: 2, data_entrega: '2026-11-14', horario: '07:00', pendente: 0 },
    { id: 3, data_entrega: '2026-11-13', horario: '15:00', pendente: 0 },
    { id: 4, data_entrega: '2026-11-14', horario: '07:00', pendente: 1 },
  ]);
  assert.deepEqual(fila.map((x) => x.id), [3, 4, 2, 1]);
});

test('Produção: Produzindo → Pronto sem pular etapa, e o join espera todos', () => {
  assert.equal(proximoStatusTarefa('aguardando', 'produzindo'), 'produzindo');
  assert.throws(() => proximoStatusTarefa('aguardando', 'pronto'));
  assert.equal(todosProntos([{ status: 'pronto' }, { status: 'produzindo' }]), false);
  assert.equal(todosProntos([{ status: 'pronto' }, { status: 'pronto' }]), true);
  assert.equal(todosProntos([]), false);
});

test('Conferência: item não marcado conta como faltante', () => {
  const r = avaliarConferencia([{ id: 1 }, { id: 2 }], [{ itemId: 1, ok: true }]);
  assert.deepEqual(r, { completo: false, faltantes: [2] });
});

test('Pesagem: kg usa o peso real; unidade usa a quantidade; saldo = final − sinal', () => {
  const itens = [{ id: 1, produto_id: 1, qtd: 20 }, { id: 2, produto_id: 2, qtd: 25 }];
  const r = calcularValorFinal(itens, PRODUTOS, [{ itemId: 1, pesoKg: 1.1 }, { itemId: 2, pesoKg: 0.5 }]);
  assert.equal(r.total, 72); // 1,1 × 20 + 25 × 2
  assert.deepEqual(calcularSaldo(72, 35), { saldo: 37, credito: 0 });
  assert.deepEqual(calcularSaldo(30, 35), { saldo: 0, credito: 5 });
  assert.throws(() => calcularValorFinal(itens, PRODUTOS, [{ itemId: 1, pesoKg: 1 }]), /Falta o peso/);
});

test('Timer: só vence quem está esperando sinal/confirmação e passou do prazo', () => {
  const v = pedidosVencidos([
    { id: 1, status: 'AGUARDANDO_SINAL', prazo_validacao_ate: '2026-11-12T12:00:00.000Z' },
    { id: 2, status: 'AGUARDANDO_CONFIRMACAO', prazo_validacao_ate: '2026-11-12T14:00:00.000Z' },
    { id: 3, status: 'LIBERADO', prazo_validacao_ate: '2026-11-12T12:00:00.000Z' },
  ], new Date('2026-11-12T13:00:00.000Z'));
  assert.deepEqual(v.map((p) => p.id), [1]);
});

test('Estados: o motor recusa pular etapas', () => {
  assert.equal(podeTransitar('AGUARDANDO_SINAL', 'LIBERADO'), false);
  assert.throws(() => exigirTransicao('AGUARDANDO_SINAL', 'EM_PRODUCAO'), /não permitida/);
  assert.equal(podeTransitar('CONFERENCIA', 'EM_PRODUCAO'), true);
});
