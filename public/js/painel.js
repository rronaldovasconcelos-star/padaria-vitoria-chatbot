// Painel interno: Gestão, Produção (um perfil por setor) e Conferência/Expedição.
import { api, ouvir, dinheiro, dataBR, dataCurta, hora, html, raw, avisar, carregarMeta, kg } from './comum.js';

const vista = document.querySelector('#vista');
const dialogo = document.querySelector('#dialogo');
const dialogoCorpo = document.querySelector('#dialogoCorpo');
let meta;
let perfil = 'gestao';
let abaGestao = 'pedidos';
let periodo = null;

const TIPO_CURTO = { individual: 'Avulso', escola: 'Escola', empresa: 'Empresa' };
const nomeAtividade = (id) => meta.atividades.find((a) => a.id === id)?.nome ?? id;
const selo = (s) => html`<span class="selo" data-s="${s}">${meta.status[s] ?? s}</span>`;

// ------------------------------------------------------------------ navegação
function lerPerfil() {
  const h = location.hash.slice(1);
  perfil = ['gestao', 'paes', 'confeitaria', 'salgados', 'conferencia'].includes(h) ? h : 'gestao';
  document.querySelectorAll('#perfis a').forEach((a) => {
    if (a.dataset.perfil === perfil) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

async function desenhar() {
  const valores = guardarCampos();
  try {
    if (perfil === 'gestao') await desenharGestao();
    else if (perfil === 'conferencia') await desenharConferencia();
    else await desenharProducao(perfil);
  } catch (e) { avisar(e.message, 'erro'); }
  restaurarCampos(valores);
  atualizarContagens();
}

// Mantém o que a pessoa estava digitando quando a tela se atualiza sozinha.
function guardarCampos() {
  const m = new Map();
  vista.querySelectorAll('[data-chave]').forEach((el) => m.set(el.dataset.chave, el.type === 'checkbox' ? el.checked : el.value));
  return m;
}
function restaurarCampos(m) {
  vista.querySelectorAll('[data-chave]').forEach((el) => {
    if (!m.has(el.dataset.chave)) return;
    if (el.type === 'checkbox') el.checked = m.get(el.dataset.chave); else el.value = m.get(el.dataset.chave);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

let agendado = null;
const redesenhar = () => { clearTimeout(agendado); agendado = setTimeout(desenhar, 150); };

// ------------------------------------------------------------------ Gestão
const COLUNAS = [
  ['Aguardando pagamento', ['AGUARDANDO_SINAL', 'AGUARDANDO_CONFIRMACAO']],
  ['Em produção', ['LIBERADO', 'EM_PRODUCAO']],
  ['Conferência', ['CONFERENCIA']],
  ['Prontos', ['AGUARDANDO_SALDO', 'PRONTO_ENTREGA']],
  ['Entregues', ['ENTREGUE', 'FECHADO']],
  ['Bloqueados e cancelados', ['BLOQUEADO', 'CANCELADO']],
];

async function desenharGestao() {
  const pedidos = await api('GET', '/api/pedidos');
  const comprovantes = pedidos.filter((p) => p.status === 'AGUARDANDO_CONFIRMACAO');
  let conteudo = '';
  if (abaGestao === 'pedidos') conteudo = quadroHTML(pedidos);
  if (abaGestao === 'relatorios') conteudo = await relatoriosHTML();
  if (abaGestao === 'cadastros') conteudo = await cadastrosHTML();

  vista.innerHTML = html`<div class="titulo"><h1>Gestão</h1>
      <p>Confira os comprovantes do sinal, acompanhe os pedidos e feche o dia com os relatórios.</p></div>
    <div class="gestao">
      <aside class="fila-comprovantes" aria-label="Comprovantes para conferir">
        <h2>Comprovantes para conferir${raw(comprovantes.length ? html`<span class="contador">${comprovantes.length}</span>` : '')}</h2>
        ${raw(comprovantes.length ? comprovantes.map(comprovanteHTML).join('') : '<p class="vazio">Nenhum comprovante esperando. Quando um cliente avulso enviar o sinal, ele aparece aqui.</p>')}
      </aside>
      <section>
        <div class="subabas" role="tablist">
          ${raw([['pedidos', 'Pedidos'], ['relatorios', 'Relatórios'], ['cadastros', 'Produtos e prazos']]
    .map(([id, r]) => html`<button type="button" role="tab" data-aba="${id}" aria-selected="${abaGestao === id}">${r}</button>`).join(''))}
        </div>
        ${raw(conteudo)}
      </section>
    </div>`;
}

function comprovanteHTML(p) {
  return html`<article class="comprovante">
    <header><strong>${p.codigo}</strong><span class="contagem" data-prazo="${p.prazo_validacao_ate}"></span></header>
    <div>${p.cliente_nome} · sinal de <b>${dinheiro(p.sinal)}</b></div>
    <img class="miniatura" src="${p.comprovante_sinal}" alt="Comprovante do pedido ${p.codigo}" data-ampliar="${p.comprovante_sinal}">
    <div class="acoes">
      <button class="btn btn-ok" type="button" data-validar="${p.id}">Validar pagamento</button>
      <button class="btn btn-erro" type="button" data-recusar="${p.id}">Recusar</button>
    </div>
  </article>`;
}

function quadroHTML(pedidos) {
  if (!pedidos.length) return '<p class="vazio">Ainda não há pedidos. Abra o chat do cliente e faça uma encomenda.</p>';
  return `<div class="quadro">${COLUNAS.map(([titulo, status]) => {
    const lista = pedidos.filter((p) => status.includes(p.status));
    return html`<div class="coluna"><h3><span>${titulo}</span><span>${lista.length}</span></h3>
      ${raw(lista.map((p) => html`<button type="button" class="cartao" data-pedido="${p.id}">
        <span class="linha1"><span>${p.codigo}</span>${raw(selo(p.status))}</span>
        <span>${p.cliente_nome}</span>
        <span class="sub">${TIPO_CURTO[p.tipo]} · entrega ${dataCurta(p.data_entrega)} às ${p.horario}</span>
        <span class="sub">${p.valor_final != null ? `Final ${dinheiro(p.valor_final)}` : `Estimado ${dinheiro(p.valor_estimado)}`}</span>
      </button>`).join(''))}</div>`;
  }).join('')}</div>`;
}

async function relatoriosHTML() {
  periodo ??= { de: meta.hoje, ate: meta.hoje };
  const r = await api('GET', `/api/relatorios?de=${periodo.de}&ate=${periodo.ate}`);
  const qs = `de=${periodo.de}&ate=${periodo.ate}`;
  const linhas = (obj, rotulos) => Object.entries(obj).map(([k, v]) => html`<tr><td>${rotulos[k] ?? k}</td><td class="num">${v}</td></tr>`).join('')
    || '<tr><td colspan="2">Sem dados no período.</td></tr>';
  return html`<div class="filtros">
      <label>De<input type="date" id="de" value="${periodo.de}"></label>
      <label>Até<input type="date" id="ate" value="${periodo.ate}"></label>
      <button class="btn btn-peq" type="button" id="filtrar">Consultar</button>
      <a class="btn btn-peq" href="/api/relatorios.csv?${qs}" download>Exportar CSV</a>
      <button class="btn btn-peq" type="button" onclick="window.print()">Imprimir ou salvar PDF</button>
      <button class="btn btn-peq btn-cheio" type="button" id="fechar">Fechar o dia</button>
    </div>
    <div class="numeros">
      <div class="numero"><span>Pedidos no período</span><strong>${r.totalPedidos}</strong></div>
      <div class="numero"><span>Recebido (sinais + saldos)</span><strong>${dinheiro(r.caixa.recebido)}</strong></div>
      <div class="numero"><span>A faturar (escolas e empresas)</span><strong>${dinheiro(r.caixa.faturar)}</strong></div>
      <div class="numero"><span>Bloqueados ou cancelados</span><strong>${r.ocorrencias.length}</strong></div>
    </div>
    <div class="tabelas">
      <div class="tabela"><h3>Pedidos por situação</h3><table><tbody>${raw(linhas(r.porStatus, meta.status))}</tbody></table></div>
      <div class="tabela"><h3>Pedidos por tipo de cliente</h3><table><tbody>${raw(linhas(r.porTipo, meta.tipos))}</tbody></table></div>
      <div class="tabela"><h3>Produção por produto</h3><table>
        <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Peso</th><th class="num">Valor final</th></tr></thead>
        <tbody>${raw(r.porProduto.map((p) => html`<tr><td>${p.icone} ${p.nome}</td><td class="num">${p.qtd}</td><td class="num">${p.peso ? kg(p.peso) : '—'}</td><td class="num">${p.valor ? dinheiro(p.valor) : '—'}</td></tr>`).join('') || '<tr><td colspan="4">Sem produção no período.</td></tr>')}</tbody></table></div>
      <div class="tabela"><h3>Bloqueios e cancelamentos</h3><table>
        <tbody>${raw(r.ocorrencias.map((o) => html`<tr><td>${o.codigo}</td><td>${o.cliente}</td><td>${o.motivo}</td></tr>`).join('') || '<tr><td>Nenhuma ocorrência.</td></tr>')}</tbody></table></div>
    </div>`;
}

async function cadastrosHTML() {
  const [produtos, regras] = await Promise.all([api('GET', '/api/produtos'), api('GET', '/api/sazonalidade')]);
  const md = (s) => (s ? `${s.slice(3)}/${s.slice(0, 2)}` : '');
  return html`<div class="tabelas">
    <div class="tabela" style="grid-column: 1 / -1"><h3>Produtos</h3><table>
      <thead><tr><th>Produto</th><th>Setor</th><th>Venda</th><th class="num">Preço</th><th>Época</th><th>No catálogo</th></tr></thead>
      <tbody>${raw(produtos.map((p) => html`<tr>
        <td>${p.icone} ${p.nome}</td><td>${meta.setores[p.setor].nome}</td><td>${p.venda === 'kg' ? 'por quilo' : 'por unidade'}</td>
        <td class="num"><input type="number" step="0.01" min="0.01" value="${p.preco}" data-preco="${p.id}" aria-label="Preço de ${p.nome}"></td>
        <td>${p.sazonal_inicio ? `${md(p.sazonal_inicio)} a ${md(p.sazonal_fim)}` : 'o ano todo'}</td>
        <td><input type="checkbox" ${raw(p.ativo ? 'checked' : '')} data-ativo="${p.id}" aria-label="${p.nome} no catálogo"></td></tr>`).join(''))}</tbody></table></div>
    <div class="tabela"><h3>Prazos de sazonalidade</h3><table>
      <thead><tr><th>Período</th><th>Datas</th><th class="num">Antecedência (dias)</th></tr></thead>
      <tbody>${raw(regras.map((s) => html`<tr><td>${s.nome}</td><td>${md(s.inicio)} a ${md(s.fim)}</td>
        <td class="num"><input type="number" min="0" max="30" value="${s.prazo_dias}" data-prazo-regra="${s.id}" aria-label="Antecedência para ${s.nome}"></td></tr>`).join(''))}</tbody></table>
      <p class="obs" style="margin-top:8px;color:var(--cinza);font-size:.85rem">Fora desses períodos: 1 dia para avulso e 2 dias para escola ou empresa; pedidos acima de 200 unidades ganham mais 1 dia.</p></div>
  </div>`;
}

async function abrirPedido(id) {
  const p = await api('GET', `/api/pedidos/${id}`);
  dialogoCorpo.innerHTML = html`<h2>${p.codigo}</h2>${raw(selo(p.status))}
    <div class="grade">
      <div>
        <p><b>${p.cliente_nome}</b> · ${meta.tipos[p.tipo]}</p>
        <p class="sub">Telefone ${p.telefone}${p.cnpj ? ` · CNPJ ${p.cnpj}` : ''}</p>
        <p class="sub">Entrega ${dataBR(p.data_entrega)} às ${p.horario}${p.data_pedida !== p.data_entrega ? ` (pedida para ${dataBR(p.data_pedida)})` : ''}</p>
        ${raw(p.motivo ? html`<p style="color:var(--erro);margin-top:8px">${p.motivo}</p>` : '')}
        <table style="margin-top:12px"><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Peso</th><th class="num">Valor</th></tr></thead>
        <tbody>${raw(p.itens.map((i) => html`<tr><td>${i.icone} ${i.nome}</td><td class="num">${i.qtd}</td><td class="num">${i.peso_kg ? kg(i.peso_kg) : '—'}</td><td class="num">${dinheiro(i.valor_final ?? i.valor_estimado)}</td></tr>`).join(''))}</tbody></table>
        <table style="margin-top:8px"><tbody>
          <tr><td>Estimado</td><td class="num">${dinheiro(p.valor_estimado)}</td></tr>
          <tr><td>Sinal</td><td class="num">${dinheiro(p.sinal)}</td></tr>
          <tr><td>Valor final (pesado)</td><td class="num">${dinheiro(p.valor_final)}</td></tr>
          <tr><td>Saldo</td><td class="num">${dinheiro(p.saldo)}</td></tr></tbody></table>
        ${raw(p.comprovante_sinal ? html`<p style="margin-top:12px"><a href="${p.comprovante_sinal}" target="_blank" rel="noopener">Ver comprovante do sinal</a></p>` : '')}
        ${raw(p.comprovante_saldo ? html`<p><a href="${p.comprovante_saldo}" target="_blank" rel="noopener">Ver comprovante do saldo</a></p>` : '')}
        <p style="margin-top:12px"><a class="btn btn-peq" href="/processo?pedido=${p.id}" target="_blank" rel="noopener">Ver este pedido no diagrama</a></p>
      </div>
      <div><h3 style="font-size:1.1rem;margin-bottom:10px">Passos do processo</h3>
        <ol class="linha-tempo">${raw(p.eventos.map((e) => html`<li><b>${nomeAtividade(e.atividade)}</b><br><span class="raia">${e.raia} · ${hora(e.em)}</span>${raw(e.detalhe ? html`<br>${e.detalhe}` : '')}</li>`).join(''))}</ol>
      </div>
    </div>`;
  dialogo.showModal();
}

// ------------------------------------------------------------------ Produção
async function desenharProducao(setor) {
  const s = meta.setores[setor];
  const fila = await api('GET', `/api/producao/${setor}`);
  vista.innerHTML = html`<div class="titulo"><h1>${s.nome}</h1>
      <p>${s.responsavel}: a fila está na ordem de saída do motorista. Marque cada comanda quando começar e quando terminar.</p></div>
    ${raw(fila.length ? `<div class="comandas">${fila.map((t, i) => ticketHTML(t, i + 1)).join('')}</div>`
    : '<p class="vazio">Nenhuma comanda na fila. Quando a gestão liberar um pedido, ele aparece aqui.</p>')}`;
}

function ticketHTML(t, ordem) {
  const qtdTexto = t.venda === 'kg' ? `${t.qtd} un.` : `${t.qtd}×`;
  const classe = t.pendente ? 'pendente' : t.status;
  return html`<article class="ticket ${classe}">
    <span class="ordem" aria-label="Posição ${ordem} na fila">${ordem}</span>
    <div class="saida"><strong>${t.horario}</strong><span>saída em ${dataCurta(t.data_entrega)}<br>${t.codigo}</span></div>
    ${raw(t.pendente ? '<span class="etiqueta-pendente">Item pendente da conferência</span>' : '')}
    <div class="item"><b aria-hidden="true">${t.icone}</b><span><strong>${qtdTexto}</strong> ${t.produto}</span></div>
    <div class="quem">${t.cliente_nome} · ${TIPO_CURTO[t.tipo]}</div>
    ${raw(t.status === 'aguardando'
    ? html`<button class="btn" type="button" data-tarefa="${t.id}" data-status="produzindo">Começar a produzir</button>`
    : html`<button class="btn btn-ok" type="button" data-tarefa="${t.id}" data-status="pronto">Marcar como pronto</button>`)}
  </article>`;
}

// ------------------------------------------------------------------ Conferência / Expedição
async function desenharConferencia() {
  const pedidos = await api('GET', '/api/expedicao');
  vista.innerHTML = html`<div class="titulo"><h1>Conferência e expedição</h1>
      <p>Confira os itens com o pedido, pese, lance o peso e libere a mercadoria.</p></div>
    ${raw(pedidos.length ? `<div class="expedicao">${pedidos.map(caixaPedidoHTML).join('')}</div>`
    : '<p class="vazio">Nada para conferir agora. Quando todos os setores terminarem um pedido, ele aparece aqui.</p>')}`;
}

function caixaPedidoHTML(p) {
  const cab = html`<header><strong>${p.codigo}</strong>${raw(selo(p.status))}</header>
    <div class="sub">${p.cliente_nome} · ${TIPO_CURTO[p.tipo]} · ${p.tipo === 'individual' ? 'retirada' : 'saída'} ${dataCurta(p.data_entrega)} às ${p.horario}</div>`;
  if (p.status === 'CONFERENCIA' && !p.conferido) {
    return html`<article class="caixa-pedido">${raw(cab)}
      <ul class="checklist">${raw(p.itens.map((i) => html`<li><label><input type="checkbox" data-chave="c${i.id}" data-item="${i.id}"> ${i.icone} ${i.qtd}× ${i.nome}</label></li>`).join(''))}</ul>
      <button class="btn btn-cheio" type="button" data-conferir="${p.id}">Concluir conferência</button>
    </article>`;
  }
  if (p.status === 'CONFERENCIA') {
    return html`<article class="caixa-pedido" data-pesagem="${p.id}">${raw(cab)}
      <div class="pesos">${raw(p.itens.map((i) => html`<div class="peso">
        <span>${i.icone} ${i.qtd}× ${i.nome}<br><small style="color:var(--cinza)">${i.venda === 'kg' ? `${dinheiro(i.preco)}/kg` : `${dinheiro(i.preco)} un. · peso só para registro`}</small></span>
        <input type="number" step="0.001" min="0.001" placeholder="kg" data-chave="p${i.id}" data-peso="${i.id}" data-venda="${i.venda}" data-preco="${i.preco}" data-qtd="${i.qtd}" aria-label="Peso de ${i.nome} em kg">
        <span class="valor" data-valor-item="${i.id}">—</span></div>`).join(''))}
        <div class="total-peso"><span>Valor pelo peso</span><span data-total>—</span></div>
      </div>
      <button class="btn btn-cheio" type="button" data-pesar="${p.id}">Lançar pesos</button>
    </article>`;
  }
  if (p.status === 'AGUARDANDO_SALDO') {
    return html`<article class="caixa-pedido">${raw(cab)}
      <div class="sub">Valor final ${dinheiro(p.valor_final)} − sinal ${dinheiro(p.sinal)}</div>
      <div class="saldo"><span>Receber no balcão</span><span>${dinheiro(p.saldo)}</span></div>
      ${raw(p.comprovante_saldo ? html`<a href="${p.comprovante_saldo}" target="_blank" rel="noopener">O cliente enviou o comprovante do saldo</a>` : '')}
      <button class="btn btn-ok" type="button" data-liberar="${p.id}">${p.saldo > 0 ? 'Receber o saldo e entregar' : 'Entregar ao cliente'}</button>
    </article>`;
  }
  return html`<article class="caixa-pedido">${raw(cab)}
    <div class="sub">Faturado: ${dinheiro(p.valor_final)} lançado no caixa.</div>
    <button class="btn btn-ok" type="button" data-liberar="${p.id}">Liberar para o motorista</button>
  </article>`;
}

function recalcularPesagem(caixaEl) {
  let total = 0; let completo = true;
  caixaEl.querySelectorAll('[data-peso]').forEach((inp) => {
    const peso = Number(inp.value);
    const v = inp.dataset.venda === 'kg' ? peso * Number(inp.dataset.preco) : Number(inp.dataset.qtd) * Number(inp.dataset.preco);
    const ok = peso > 0;
    completo &&= ok;
    caixaEl.querySelector(`[data-valor-item="${inp.dataset.peso}"]`).textContent = ok ? dinheiro(v) : '—';
    if (ok) total += v;
  });
  caixaEl.querySelector('[data-total]').textContent = completo ? dinheiro(total) : '—';
}

// ------------------------------------------------------------------ contagem regressiva
function atualizarContagens() {
  document.querySelectorAll('[data-prazo]').forEach((el) => {
    if (!el.dataset.prazo || el.dataset.prazo === 'null') { el.textContent = ''; return; }
    const falta = new Date(el.dataset.prazo) - Date.now();
    if (falta <= 0) { el.textContent = 'prazo vencido'; el.classList.add('vencido'); return; }
    const m = Math.floor(falta / 60000); const s = Math.floor((falta % 60000) / 1000);
    el.textContent = `vence em ${m}:${String(s).padStart(2, '0')}`;
  });
}
setInterval(atualizarContagens, 1000);

// ------------------------------------------------------------------ eventos
async function acao(fn, sucesso) {
  try { await fn(); if (sucesso) avisar(sucesso); await desenhar(); } catch (e) { avisar(e.message, 'erro'); }
}

vista.addEventListener('click', (e) => {
  const el = e.target.closest('button, img[data-ampliar]');
  if (!el) return;
  const d = el.dataset;
  if (d.aba) { abaGestao = d.aba; desenhar(); return; }
  if (d.pedido) { abrirPedido(d.pedido).catch((err) => avisar(err.message, 'erro')); return; }
  if (d.ampliar) {
    dialogoCorpo.innerHTML = html`<h2>Comprovante</h2><img class="comprovante-grande" src="${d.ampliar}" alt="Comprovante ampliado">`;
    dialogo.showModal();
    return;
  }
  if (d.validar) { el.disabled = true; acao(() => api('POST', `/api/pedidos/${d.validar}/validar-pagamento`, { aprovado: true }), 'Pagamento validado: pedido liberado para a produção.'); return; }
  if (d.recusar) { el.disabled = true; acao(() => api('POST', `/api/pedidos/${d.recusar}/validar-pagamento`, { aprovado: false }), 'Pagamento recusado: o cliente foi avisado.'); return; }
  if (d.tarefa) { el.disabled = true; acao(() => api('POST', `/api/tarefas/${d.tarefa}/status`, { status: d.status })); return; }
  if (d.conferir) {
    const itens = [...el.closest('.caixa-pedido').querySelectorAll('[data-item]')].map((c) => ({ itemId: Number(c.dataset.item), ok: c.checked }));
    const faltam = itens.filter((i) => !i.ok).length;
    acao(() => api('POST', `/api/pedidos/${d.conferir}/conferencia`, { itens }),
      faltam ? `${faltam} item(ns) voltou(aram) para a produção como pendente.` : 'Conferência concluída. Agora pese os itens.');
    return;
  }
  if (d.pesar) {
    const itens = [...el.closest('.caixa-pedido').querySelectorAll('[data-peso]')].map((c) => ({ itemId: Number(c.dataset.peso), pesoKg: Number(c.value) }));
    acao(() => api('POST', `/api/pedidos/${d.pesar}/pesagem`, { itens }), 'Pesos lançados e valor calculado.');
    return;
  }
  if (d.liberar) { el.disabled = true; acao(() => api('POST', `/api/pedidos/${d.liberar}/liberar`), 'Mercadoria liberada.'); return; }
  if (el.id === 'filtrar') { periodo = { de: vista.querySelector('#de').value, ate: vista.querySelector('#ate').value }; desenhar(); return; }
  if (el.id === 'fechar') {
    acao(async () => { const r = await api('POST', '/api/fechamento'); avisar(`Fechamento: ${r.fechados} pedido(s) entregue(s) encerrado(s).`); });
  }
});

vista.addEventListener('input', (e) => {
  const caixa = e.target.closest('[data-pesagem]');
  if (caixa && e.target.matches('[data-peso]')) recalcularPesagem(caixa);
});

vista.addEventListener('change', async (e) => {
  const d = e.target.dataset;
  try {
    if (d.preco && e.target.closest('table')) { await api('PATCH', `/api/produtos/${d.preco}`, { preco: Number(e.target.value) }); avisar('Preço atualizado.'); }
    if (d.ativo) { await api('PATCH', `/api/produtos/${d.ativo}`, { ativo: e.target.checked }); avisar(e.target.checked ? 'Produto voltou ao catálogo.' : 'Produto retirado do catálogo.'); }
    if (d.prazoRegra) { await api('PATCH', `/api/sazonalidade/${d.prazoRegra}`, { prazo_dias: Number(e.target.value) }); avisar('Prazo atualizado.'); }
  } catch (err) { avisar(err.message, 'erro'); }
});

document.querySelector('#reiniciar').addEventListener('click', async () => {
  try {
    await api('POST', '/api/demo/reiniciar', { modoDemo: true });
    avisar('Demonstração reiniciada: pedidos apagados e prazo do sinal de 2 minutos.');
  } catch (e) { avisar(e.message, 'erro'); }
});

window.addEventListener('hashchange', () => { lerPerfil(); desenhar(); });

(async () => {
  meta = await carregarMeta();
  lerPerfil();
  await desenhar();
  ouvir((ev) => {
    if (ev.tipo === 'pedido' || ev.tipo === 'reinicio' || ev.tipo === 'catalogo') {
      if (ev.texto) avisar(ev.texto);
      redesenhar();
    }
  });
})();
