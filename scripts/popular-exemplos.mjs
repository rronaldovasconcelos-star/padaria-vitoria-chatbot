// Popula o servidor (já rodando) com pedidos em várias etapas do TO-BE.
// Uso: npm run exemplos   (com o servidor no ar em outra janela)
// Útil como "plano B" na apresentação e para tirar prints.
const BASE = process.env.BASE ?? 'http://localhost:3000';

async function api(metodo, url, corpo) {
  const r = await fetch(BASE + url, {
    method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${url}: ${j.erro}`);
  return j;
}

const hoje = new Date();
const dia = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function pedido({ tipo, nome, telefone, cnpj, itens, data, horario }) {
  const { id } = await api('POST', '/api/conversas');
  const b = (valor) => api('POST', `/api/conversas/${id}/entrada`, { tipo: 'botao', valor });
  const t = (texto) => api('POST', `/api/conversas/${id}/entrada`, { tipo: 'texto', texto });
  await b('pedido'); await b(tipo); await t(nome); await t(telefone);
  if (cnpj) await t(cnpj);
  await api('POST', `/api/conversas/${id}/entrada`, { tipo: 'carrinho', itens });
  await b(data); await b(horario); await b('confirmar');
  const pedidos = await api('GET', '/api/pedidos');
  return { conversa: id, pedido: pedidos[0] };
}

async function produzir(pedidoId) {
  const p = await api('GET', `/api/pedidos/${pedidoId}`);
  for (const t of p.tarefas.filter((x) => x.status !== 'pronto')) {
    if (t.status === 'aguardando') await api('POST', `/api/tarefas/${t.id}/status`, { status: 'produzindo' });
    await api('POST', `/api/tarefas/${t.id}/status`, { status: 'pronto' });
  }
}

const catalogo = await api('GET', '/api/catalogo');
const id = (nome) => catalogo.find((p) => p.nome === nome).id;

await api('POST', '/api/demo/reiniciar', { modoDemo: false }); // prazo de 30 min: nada cancela sozinho

// 1. Escola: liberada sem sinal, já em produção
const escola = await pedido({
  tipo: 'escola', nome: 'Colégio Monte Azul', telefone: '31988880001', cnpj: '11.222.333/0001-81',
  itens: [{ produtoId: id('Pão de queijo'), qtd: 300 }, { produtoId: id('Mini coxinha'), qtd: 200 }, { produtoId: id('Bolo de cenoura'), qtd: 4 }],
  data: dia(3), horario: '07:00',
});
console.log(`${escola.pedido.codigo} escola → ${escola.pedido.status}`);

// 2. Empresa: produzida, conferida, pesada e pronta para o motorista
const empresa = await pedido({
  tipo: 'empresa', nome: 'Construtora Horizonte', telefone: '31988880002', cnpj: '11.444.777/0001-61',
  itens: [{ produtoId: id('Pão francês'), qtd: 120 }, { produtoId: id('Sonho'), qtd: 40 }],
  data: dia(2), horario: '08:00',
});
await produzir(empresa.pedido.id);
const det = await api('GET', `/api/pedidos/${empresa.pedido.id}`);
await api('POST', `/api/pedidos/${empresa.pedido.id}/conferencia`, { itens: det.itens.map((i) => ({ itemId: i.id, ok: true })) });
await api('POST', `/api/pedidos/${empresa.pedido.id}/pesagem`, { itens: det.itens.map((i) => ({ itemId: i.id, pesoKg: i.venda === 'kg' ? 6.2 : 3.4 })) });
console.log(`${empresa.pedido.codigo} empresa → pronto para entrega`);

// 3. Avulso: comprovante enviado, esperando a gestão
const avulso = await pedido({
  tipo: 'individual', nome: 'Mariana Souza', telefone: '31987654321',
  itens: [{ produtoId: id('Bolo de chocolate'), qtd: 1 }, { produtoId: id('Brigadeiro'), qtd: 50 }],
  data: dia(1), horario: '10:00',
});
await api('POST', `/api/conversas/${avulso.conversa}/comprovante-exemplo`);
console.log(`${avulso.pedido.codigo} avulso → aguardando confirmação da gestão`);

// 4. Bloqueado: produto fora de época
const fora = await pedido({
  tipo: 'individual', nome: 'Paulo Lima', telefone: '31977776666',
  itens: [{ produtoId: id('Ovo de Páscoa artesanal'), qtd: 2 }], data: dia(2), horario: '15:00',
});
console.log(`${fora.pedido.codigo} → ${fora.pedido.status} (${fora.pedido.motivo})`);

