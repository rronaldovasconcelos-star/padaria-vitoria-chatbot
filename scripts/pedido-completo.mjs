// Gera um pedido avulso que percorre o TO-BE INTEIRO (inclui item pendente, saldo, entrega e fechamento).
// Uso: npm run pedido-completo   (no site publicado; BASE=http://localhost:3000 para o local)
const BASE = process.env.BASE ?? 'https://padaria-vitoria.onrender.com';
async function api(m, u, b) {
  const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${u}: ${j.erro}`);
  return j;
}
const amanha = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); })();
const cat = await api('GET', '/api/catalogo');
const id = (n) => cat.find((p) => p.nome === n).id;

const { id: conversa } = await api('POST', '/api/conversas');
const b = (valor, rotulo) => api('POST', `/api/conversas/${conversa}/entrada`, { tipo: 'botao', valor, rotulo });
const t = (texto) => api('POST', `/api/conversas/${conversa}/entrada`, { tipo: 'texto', texto });
await b('pedido', '🛒 Fazer um pedido');
await b('individual', '🙋 Para mim (avulso)');
await t('Mariana Souza');
await t('(31) 98765-4321');
await api('POST', `/api/conversas/${conversa}/entrada`, { tipo: 'carrinho', itens: [
  { produtoId: id('Pão francês'), qtd: 20 }, { produtoId: id('Bolo de chocolate'), qtd: 1 }, { produtoId: id('Brigadeiro'), qtd: 25 },
] });
await b(amanha, amanha.split('-').reverse().slice(0, 2).join('/'));
await b('10:00', '10:00');
await b('confirmar', '✅ Confirmar pedido');
const pedidos = await api('GET', '/api/pedidos');
const p = pedidos.find((x) => x.conversa_id === conversa);
console.log(`${p.codigo} criado: sinal ${p.sinal}`);

await api('POST', `/api/conversas/${conversa}/comprovante-exemplo`);
await api('POST', `/api/pedidos/${p.id}/validar-pagamento`, { aprovado: true });
console.log('sinal validado pela gestão');

async function produzir() {
  const d = await api('GET', `/api/pedidos/${p.id}`);
  for (const tk of d.tarefas.filter((x) => x.status !== 'pronto')) {
    if (tk.status === 'aguardando') await api('POST', `/api/tarefas/${tk.id}/status`, { status: 'produzindo' });
    await api('POST', `/api/tarefas/${tk.id}/status`, { status: 'pronto' });
  }
}
await produzir();
const det = await api('GET', `/api/pedidos/${p.id}`);
const [pao, bolo, brig] = det.itens;
await api('POST', `/api/pedidos/${p.id}/conferencia`, { itens: [{ itemId: pao.id, ok: true }, { itemId: bolo.id, ok: true }, { itemId: brig.id, ok: false }] });
console.log('conferência: brigadeiro voltou como pendente');
await produzir();
await api('POST', `/api/pedidos/${p.id}/conferencia`, { itens: det.itens.map((i) => ({ itemId: i.id, ok: true })) });
await api('POST', `/api/pedidos/${p.id}/pesagem`, { itens: [{ itemId: pao.id, pesoKg: 1.08 }, { itemId: bolo.id, pesoKg: 1.62 }, { itemId: brig.id, pesoKg: 0.5 }] });
await api('POST', `/api/conversas/${conversa}/comprovante-exemplo`);
await api('POST', `/api/pedidos/${p.id}/liberar`);
const final = await api('GET', `/api/pedidos/${p.id}`);
console.log(`${final.codigo}: ${final.status} | final ${final.valor_final} | sinal ${final.sinal} | saldo ${final.saldo} | ${final.eventos.length} passos | conversa ${conversa}`);
await api('POST', '/api/fechamento');
console.log(`Fechamento do dia feito. Veja em ${BASE}/processo?pedido=${p.id}`);
