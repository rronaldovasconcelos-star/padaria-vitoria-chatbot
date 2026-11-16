// Painel da equipe: Dashboard, Pedidos, Produção, Balcão (conferência e expedição),
// Financeiro (comprovantes PIX), Produtos e Relatórios. Mesmo layout do sistema de gestão.
import { api, ouvir, dinheiro, dataBR, dataCurta, hora, html, raw, avisar, carregarMeta, kg } from './comum.js';
import { icone } from './icones.js';

const app = document.querySelector('#app');
const vista = document.querySelector('#vista');
const dialogo = document.querySelector('#dialogo');
const dialogoCorpo = document.querySelector('#dialogoCorpo');
let meta;
let tela = 'dashboard';
let setorProducao = 'geral';
let pedidoBalcao = null;
let buscaBalcao = '';
let filtroProduto = 'todos';
let buscaProduto = '';
let periodoRel = 'tudo';
let periodoPers = null;

const TELAS = {
  dashboard: { nome: 'Dashboard', icone: 'dashboard' },
  pedidos: { nome: 'Pedidos', icone: 'pedidos' },
  producao: { nome: 'Produção', icone: 'producao' },
  balcao: { nome: 'Balcão', icone: 'balcao' },
  financeiro: { nome: 'Financeiro', icone: 'financeiro' },
  produtos: { nome: 'Produtos', icone: 'produtos' },
  relatorios: { nome: 'Relatórios', icone: 'relatorios' },
};
// Endereços antigos (um perfil por pessoa) continuam funcionando.
const APELIDOS = { gestao: ['financeiro'], paes: ['producao', 'paes'], confeitaria: ['producao', 'confeitaria'], salgados: ['producao', 'salgados'], conferencia: ['balcao'] };
const SETOR_CURTO = { paes: 'Padaria', confeitaria: 'Confeitaria', salgados: 'Salgados' };
const TIPO_CURTO = { individual: 'Avulso', escola: 'Escola', empresa: 'Empresa' };
const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ATIVOS = (p) => !['BLOQUEADO', 'CANCELADO', 'RASCUNHO'].includes(p.status);

const nomeAtividade = (id) => meta.atividades.find((a) => a.id === id)?.nome ?? id;
const selo = (s) => html`<span class="selo" data-s="${s}">${meta.status[s] ?? s}</span>`;
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (iso) => DIA_SEMANA[new Date(`${iso}T12:00:00`).getDay()];
const numeroCard = (cor, ic, rotulo, valor) => html`<div class="numero"><span class="ic-caixa ${cor}">${raw(icone(ic, 16))}</span><span>${rotulo}</span><strong>${valor}</strong></div>`;
const faturamento = (r) => r.caixa.recebido + r.caixa.faturar;

// ------------------------------------------------------------------ menu e navegação
function montarMenu() {
  document.querySelector('#menu').innerHTML = Object.entries(TELAS)
    .map(([id, t]) => `<a href="#${id}" data-tela="${id}">${icone(t.icone)}<span>${t.nome}</span></a>`).join('');
  document.querySelector('#menuRodape').innerHTML = `
    <a href="/processo" target="_blank" rel="noopener">${icone('processo')}<span>Processo TO-BE</span></a>
    <a href="/chat" target="_blank" rel="noopener">${icone('cesta')}<span>Chat do cliente</span></a>
    <button type="button" id="reiniciar" title="Apaga os pedidos e recarrega o cardápio de exemplo">${icone('reiniciar')}<span>Reiniciar demonstração</span></button>`;
  document.querySelector('#recolher').innerHTML = icone('menu');
  document.querySelector('#abrirMenu').innerHTML = icone('menu');
}

function lerTela() {
  const [h, sub] = location.hash.slice(1).split('/');
  const [alvo, setor] = APELIDOS[h] ?? [h, sub];
  tela = TELAS[alvo] ? alvo : 'dashboard';
  if (tela === 'producao') setorProducao = ['paes', 'confeitaria', 'salgados'].includes(setor) ? setor : (setor ? 'geral' : setorProducao);
  document.querySelectorAll('#menu a').forEach((a) => {
    if (a.dataset.tela === tela) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelector('#topoTitulo').textContent = TELAS[tela].nome;
  document.title = `${TELAS[tela].nome} · Padaria Vitória`;
  app.classList.remove('menu-aberto');
  document.querySelector('#fundoMenu').hidden = true;
}

const DESENHO = {
  dashboard: desenharDashboard, pedidos: desenharPedidos, producao: desenharProducao, balcao: desenharBalcao,
  financeiro: desenharFinanceiro, produtos: desenharProdutos, relatorios: desenharRelatorios,
};

async function desenhar() {
  const valores = guardarCampos();
  try { await DESENHO[tela](); } catch (e) { avisar(e.message, 'erro'); }
  restaurarCampos(valores);
  atualizarContagens();
  atualizarSino();
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

async function atualizarSino() {
  const pedidos = await api('GET', '/api/pedidos').catch(() => []);
  const n = pedidos.filter((p) => p.status === 'AGUARDANDO_CONFIRMACAO').length;
  document.querySelector('#sino').innerHTML = icone('sino', 17) + (n ? `<span class="bolinha">${n}</span>` : '');
}

// ------------------------------------------------------------------ gráficos simples (sem biblioteca)
function graficoBarras(dados, formato = (v) => v) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const passo = escalaBonita(max);
  const topo = passo * 4;
  return html`<div class="barras"><div class="escala">${raw([0, 1, 2, 3, 4].map((i) => `<span>${Math.round(passo * i)}</span>`).join(''))}</div>
    <div class="area">${raw(dados.map((d) => html`<div class="coluna-g" title="${d.rotulo}: ${formato(d.valor)}">
      ${raw(d.valor ? html`<span class="valor-g">${formato(d.valor)}</span>` : '')}
      <div class="barra" style="height:${(d.valor / topo) * 100}%"></div><span class="rotulo">${d.rotulo}</span></div>`).join(''))}</div></div>`;
}
function escalaBonita(max) {
  const bruto = max / 4;
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * ordem).find((p) => p >= bruto);
}
function graficoRosca(partes) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return '<p class="vazio">Sem pedidos no período.</p>';
  const r = 15.9155; let acumulado = 0;
  const arcos = partes.filter((p) => p.valor).map((p) => {
    const pct = (p.valor / total) * 100;
    const arco = `<circle r="${r}" cx="21" cy="21" fill="none" stroke="${p.cor}" stroke-width="6" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${25 - acumulado}"><title>${p.rotulo}: ${p.valor}</title></circle>`;
    acumulado += pct;
    return arco;
  }).join('');
  return html`<div class="rosca"><svg viewBox="0 0 42 42" role="img" aria-label="Distribuição de status">${raw(arcos)}</svg>
    <div class="legenda">${raw(partes.filter((p) => p.valor).map((p) => html`<span><i style="background:${p.cor}"></i>${p.rotulo} (${p.valor})</span>`).join(''))}</div></div>`;
}

// ------------------------------------------------------------------ Dashboard
async function desenharDashboard() {
  const hoje = meta.hoje;
  const inicioMes = `${hoje.slice(0, 8)}01`;
  const dias = [...Array(7)].map((_, i) => somaDias(hoje, i - 6));
  const [pedidos, rHoje, rMes, produtos, ...rDias] = await Promise.all([
    api('GET', '/api/pedidos'),
    api('GET', `/api/relatorios?de=${hoje}&ate=${hoje}`),
    api('GET', `/api/relatorios?de=${inicioMes}&ate=${hoje}`),
    api('GET', '/api/produtos'),
    ...dias.map((d) => api('GET', `/api/relatorios?de=${d}&ate=${d}`)),
  ]);
  const conta = (lista) => pedidos.filter((p) => lista.includes(p.status)).length;
  const emProducao = conta(['LIBERADO', 'EM_PRODUCAO', 'CONFERENCIA']);
  const aguardPix = conta(['AGUARDANDO_CONFIRMACAO']);
  const prontos = conta(['AGUARDANDO_SALDO', 'PRONTO_ENTREGA']);
  const paraHoje = pedidos.filter((p) => ATIVOS(p) && p.data_entrega === hoje).length;
  const setorDe = Object.fromEntries(produtos.map((p) => [p.nome, p.setor]));
  const porSetor = { paes: 0, confeitaria: 0, salgados: 0 };
  for (const p of rMes.porProduto) porSetor[setorDe[p.nome]] += p.qtd;

  vista.innerHTML = html`<div class="ola"><h2>Olá, Gerência 👋</h2><p>Visão geral da operação da Padaria Vitória hoje.</p></div>
    <section class="destaque">
      <div><small>Faturamento de hoje</small><strong>${dinheiro(faturamento(rHoje))}</strong>
        <span class="resumo">${rMes.totalPedidos} pedido(s) no mês · ${dinheiro(faturamento(rMes))} no mês</span></div>
      <div class="mini">
        <div><b>${emProducao}</b><span>Em produção</span></div>
        <div><b>${aguardPix}</b><span>Aguard. PIX</span></div>
        <div><b>${prontos}</b><span>Prontos p/ retirada</span></div>
      </div>
    </section>
    <div class="atalhos">
      ${raw([['pedidos', 'pedidos', 'Pedidos', 'Quadro de todos os pedidos'], ['producao', 'producao', 'Produção', 'Acompanhar produção'],
    ['balcao', 'balcao', 'Balcão', 'Conferência e pesagem'], ['financeiro', 'financeiro', 'Financeiro', 'Aprovar PIX']]
    .map(([id, ic, t, s]) => html`<a class="atalho" href="#${id}"><span class="ic-caixa rosa">${raw(icone(ic, 18))}</span><span><b>${t}</b><small>${s}</small></span>${raw(icone('seta', 15))}</a>`).join(''))}
    </div>
    <div class="numeros">
      ${raw(numeroCard('vermelho', 'pedidos', 'Pedidos p/ hoje', paraHoje))}
      ${raw(numeroCard('verde', 'dinheiro', 'Faturamento do dia', dinheiro(faturamento(rHoje))))}
      ${raw(numeroCard('laranja', 'alta', 'Faturamento do mês', dinheiro(faturamento(rMes))))}
      ${raw(numeroCard('azul', 'producao', 'Em produção', emProducao))}
      ${raw(numeroCard('roxo', 'financeiro', 'Aguardando PIX', aguardPix))}
      ${raw(numeroCard('teal', 'produtos', 'Aguardando retirada', prontos))}
    </div>
    <div class="graficos">
      <section class="painel"><h3>Faturamento dos últimos 7 dias</h3>
        ${raw(graficoBarras(dias.map((d, i) => ({ rotulo: diaSemana(d), valor: faturamento(rDias[i]) })), dinheiro))}</section>
      <section class="painel"><h3>Itens por setor <span class="contador-cinza">no mês</span></h3>
        ${raw(graficoBarras(Object.entries(porSetor).map(([s, v]) => ({ rotulo: SETOR_CURTO[s], valor: v }))))}</section>
    </div>`;
}

// ------------------------------------------------------------------ Pedidos (quadro)
const COLUNAS = [
  ['Aguardando pagamento', ['AGUARDANDO_SINAL', 'AGUARDANDO_CONFIRMACAO']],
  ['Em produção', ['LIBERADO', 'EM_PRODUCAO']],
  ['Conferência', ['CONFERENCIA']],
  ['Prontos', ['AGUARDANDO_SALDO', 'PRONTO_ENTREGA']],
  ['Entregues', ['ENTREGUE', 'FECHADO']],
  ['Bloqueados e cancelados', ['BLOQUEADO', 'CANCELADO']],
];

async function desenharPedidos() {
  const pedidos = await api('GET', '/api/pedidos');
  vista.innerHTML = html`<div class="titulo"><div><h2>Pedidos</h2><p>Todos os pedidos, da confirmação à entrega. Clique em um pedido para ver os detalhes e os passos do processo.</p></div></div>
    ${raw(!pedidos.length ? '<p class="vazio">Ainda não há pedidos. Abra o chat do cliente e faça uma encomenda.</p>'
    : `<div class="quadro">${COLUNAS.map(([titulo, status]) => {
      const lista = pedidos.filter((p) => status.includes(p.status));
      return html`<div class="coluna"><h3><span>${titulo}</span><span class="contador-cinza">${lista.length}</span></h3>
        ${raw(lista.map((p) => html`<button type="button" class="cartao" data-pedido="${p.id}">
          <span class="linha1"><span class="codigo">${p.codigo}</span>${raw(selo(p.status))}</span>
          <b>${p.cliente_nome}</b>
          <span class="sub">${TIPO_CURTO[p.tipo]} · entrega ${dataCurta(p.data_entrega)} às ${p.horario}</span>
          <span class="sub">${p.valor_final != null ? `Final ${dinheiro(p.valor_final)}` : `Estimado ${dinheiro(p.valor_estimado)}`}</span>
        </button>`).join('') || '<p class="sub" style="padding:4px">Nenhum.</p>')}</div>`;
    }).join('')}</div>`)}`;
}

async function abrirPedido(id) {
  const p = await api('GET', `/api/pedidos/${id}`);
  dialogoCorpo.innerHTML = html`<h2>${p.codigo} · ${p.cliente_nome}</h2>${raw(selo(p.status))}
    <div class="grade">
      <div>
        <p><b>${meta.tipos[p.tipo]}</b> · telefone ${p.telefone}${p.cnpj ? ` · CNPJ ${p.cnpj}` : ''}</p>
        <p class="sub">Entrega ${dataBR(p.data_entrega)} às ${p.horario}${p.data_pedida !== p.data_entrega ? ` (pedida para ${dataBR(p.data_pedida)})` : ''}</p>
        ${raw(p.motivo ? html`<p style="color:var(--primaria);margin-top:8px">${p.motivo}</p>` : '')}
        <table style="margin-top:12px"><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Peso</th><th class="num">Valor</th></tr></thead>
        <tbody>${raw(p.itens.map((i) => html`<tr><td>${i.icone} ${i.nome}</td><td class="num">${i.qtd}</td><td class="num">${i.peso_kg ? kg(i.peso_kg) : '—'}</td><td class="num">${dinheiro(i.valor_final ?? i.valor_estimado)}</td></tr>`).join(''))}</tbody></table>
        <table style="margin-top:8px"><tbody>
          <tr><td>Estimado</td><td class="num">${dinheiro(p.valor_estimado)}</td></tr>
          <tr><td>Sinal</td><td class="num">${dinheiro(p.sinal)}</td></tr>
          <tr><td>Valor final (pesado)</td><td class="num">${dinheiro(p.valor_final)}</td></tr>
          <tr><td>Saldo</td><td class="num">${dinheiro(p.saldo)}</td></tr></tbody></table>
        ${raw(p.comprovante_sinal ? html`<p style="margin-top:12px"><a href="${p.comprovante_sinal}" target="_blank" rel="noopener">Ver comprovante do sinal</a></p>` : '')}
        ${raw(p.comprovante_saldo ? html`<p><a href="${p.comprovante_saldo}" target="_blank" rel="noopener">Ver comprovante do saldo</a></p>` : '')}
        <p style="margin-top:12px"><a class="btn btn-peq" href="/processo?pedido=${p.id}" target="_blank" rel="noopener">${raw(icone('processo', 15))} Ver este pedido no diagrama</a></p>
      </div>
      <div><h3 style="font-size:.92rem;margin-bottom:10px">Passos do processo</h3>
        <ol class="linha-tempo">${raw(p.eventos.map((e) => html`<li><b>${nomeAtividade(e.atividade)}</b><br><span class="raia">${e.raia} · ${hora(e.em)}</span>${raw(e.detalhe ? html`<br>${e.detalhe}` : '')}</li>`).join(''))}</ol>
      </div>
    </div>`;
  dialogo.showModal();
}

// ------------------------------------------------------------------ Produção
async function desenharProducao() {
  const setores = setorProducao === 'geral' ? Object.keys(SETOR_CURTO) : [setorProducao];
  const filas = await Promise.all(setores.map((s) => api('GET', `/api/producao/${s}`).then((f) => f.map((t) => ({ ...t, setor: s })))));
  const tarefas = filas.flat();
  const datas = [...new Set([...[...Array(6)].map((_, i) => somaDias(meta.hoje, i)), ...tarefas.map((t) => t.data_entrega)])].sort();
  const titulo = setorProducao === 'geral' ? 'Todos os setores' : meta.setores[setorProducao].nome;
  const quem = setorProducao === 'geral' ? 'Padeiro, confeiteiro e salgadeira' : meta.setores[setorProducao].responsavel;
  vista.innerHTML = html`<div class="titulo"><div><h2>Produção — ${titulo}</h2>
      <p>${quem}: comandas liberadas, agrupadas por dia de entrega e na ordem de saída. Limite de produção: 1h antes da entrega.</p></div>
      <div class="segmentos" role="group" aria-label="Setor">${raw([['geral', 'Geral'], ['paes', 'Padaria'], ['salgados', 'Salgados'], ['confeitaria', 'Confeitaria']]
    .map(([id, r]) => html`<button type="button" data-setor="${id}" aria-pressed="${setorProducao === id}">${r}</button>`).join(''))}</div></div>
    <div class="dias">${raw(datas.map((d) => {
    const doDia = tarefas.filter((t) => t.data_entrega === d).sort((a, b) => a.horario.localeCompare(b.horario));
    return html`<div class="dia"><div class="dia-topo"><span>${diaSemana(d)}<small>${dataCurta(d)}</small></span><span class="sub">${doDia.length}</span></div>
      ${raw(doDia.length ? doDia.map(ticketHTML).join('') : '<div class="vazio">Sem pedidos</div>')}</div>`;
  }).join(''))}</div>`;
}

function ticketHTML(t) {
  const qtd = `${t.qtd}${t.venda === 'kg' ? ' un.' : 'x'}`;
  const limite = new Date(`${t.data_entrega}T${t.horario}:00`).getTime() - 3600000;
  let etiqueta = '';
  if (t.pendente) etiqueta = html`<div class="etiqueta pendente">${raw(icone('alerta', 13))} Item pendente da conferência</div>`;
  else if (t.status === 'produzindo') etiqueta = html`<div class="etiqueta fazendo">${raw(icone('producao', 13))} Em preparo</div>`;
  else if (Date.now() > limite) etiqueta = html`<div class="etiqueta atraso">${raw(icone('alerta', 13))} Atrasado p/ produção</div>`;
  return html`<article class="ticket">
    <header><span class="codigo">${t.codigo}</span><span class="tag-setor">${SETOR_CURTO[t.setor]}</span></header>
    <div class="hora-saida">${t.horario}</div>
    <div class="cliente">${t.cliente_nome}</div>
    <div class="itens-t">${qtd} ${t.produto} · ${TIPO_CURTO[t.tipo]}</div>
    ${raw(etiqueta)}
    ${raw(t.status === 'aguardando'
    ? html`<button class="btn btn-ambar" type="button" data-tarefa="${t.id}" data-status="produzindo">${raw(icone('producao', 15))} Iniciar preparo</button>`
    : html`<button class="btn btn-ok" type="button" data-tarefa="${t.id}" data-status="pronto">${raw(icone('ok', 15))} Marcar como pronto</button>`)}
  </article>`;
}

// ------------------------------------------------------------------ Balcão (conferência e expedição)
async function desenharBalcao() {
  const pedidos = await api('GET', '/api/expedicao');
  if (!pedidos.some((p) => String(p.id) === String(pedidoBalcao))) pedidoBalcao = pedidos[0]?.id ?? null;
  const visiveis = pedidos.filter((p) => !buscaBalcao || `${p.codigo} ${p.cliente_nome}`.toLowerCase().includes(buscaBalcao.toLowerCase()));
  const atual = pedidos.find((p) => p.id === pedidoBalcao);
  vista.innerHTML = html`<div class="balcao">
    <aside class="painel fila" aria-label="Fila de montagem">
      <h3>Fila de Montagem <span class="contador-amarelo">${pedidos.length}</span></h3>
      <label class="busca">${raw(icone('busca', 15))}<span class="visualmente-oculto">Buscar pedido</span>
        <input type="search" id="buscaBalcao" placeholder="Buscar pedido..." value="${buscaBalcao}"></label>
      ${raw(visiveis.map((p) => html`<button type="button" class="fila-item" data-balcao="${p.id}" aria-current="${p.id === pedidoBalcao}">
        <span class="linha1"><b>${p.codigo}</b><span class="hora-pilula">${p.horario}</span></span>
        <span>${p.cliente_nome}</span>
        <span class="sub">${p.itens.length} ${p.itens.length === 1 ? 'item' : 'itens'} · ${meta.status[p.status]}</span></button>`).join('')
      || '<p class="sub">Nada para montar agora.</p>')}
    </aside>
    ${raw(atual ? detalheBalcaoHTML(atual) : '<p class="vazio">Nada para conferir agora. Quando todos os setores terminarem um pedido, ele aparece aqui.</p>')}
  </div>`;
  const caixa = vista.querySelector('[data-pesagem]');
  if (caixa) recalcularPesagem(caixa);
}

function detalheBalcaoHTML(p) {
  const tipoEntrega = p.tipo === 'individual' ? 'Retirada' : 'Entrega';
  const topo = html`<div class="detalhe-topo"><div><h3>${p.codigo} · ${p.cliente_nome}</h3>
      <p class="sub">${tipoEntrega} ${dataBR(p.data_entrega)} às ${p.horario} · ${meta.tipos[p.tipo]}</p></div>${raw(selo(p.status))}</div>`;

  // 1) Conferência: confere item por item; o que faltar volta para a produção.
  if (p.status === 'CONFERENCIA' && !p.conferido) {
    return html`<section class="painel detalhe" style="padding:0">${raw(topo)}
      <div class="detalhe-corpo">
        <p class="sub">Confira cada item com o pedido. O que não estiver certo volta para a produção como pendente.</p>
        ${raw(p.itens.map((i) => html`<label class="item-b check-b"><input type="checkbox" data-chave="c${i.id}" data-item="${i.id}">
          <span class="nome" style="flex:1">${i.icone} ${i.nome}<small>${i.qtd}x</small></span></label>`).join(''))}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-cheio" type="button" data-conferir="${p.id}">${raw(icone('ok', 15))} Concluir conferência</button>
          <button class="btn btn-contorno" type="button" data-conferir="${p.id}" data-devolver="1">${raw(icone('devolver', 15))} Devolver à produção</button>
        </div>
      </div></section>`;
  }
  // 2) Pesagem: lança o peso de cada item e calcula o valor final.
  if (p.status === 'CONFERENCIA') {
    return html`<section class="painel detalhe" style="padding:0" data-pesagem="${p.id}">${raw(topo)}
      <div class="detalhe-corpo">
        <div class="progresso"><div class="linha1"><span>${raw(icone('balanca', 14))} <span data-progresso-txt>Pesagem: 0 de ${p.itens.length}</span></span><span data-progresso-pct>0%</span></div>
          <div class="trilho"><i data-progresso style="width:0%"></i></div></div>
        ${raw(p.itens.map((i) => html`<div class="item-b pesar" data-item-b="${i.id}">
          <div class="nome"><span>${i.icone} ${i.nome}</span><small>${i.qtd}x · ${i.venda === 'kg' ? `${dinheiro(i.preco)}/kg` : `${dinheiro(i.preco)} un. (peso só para registro)`}</small></div><hr>
          <div class="pesagem"><input type="number" step="0.001" min="0.001" placeholder="0,000" data-chave="p${i.id}" data-peso="${i.id}" data-venda="${i.venda}" data-preco="${i.preco}" data-qtd="${i.qtd}" aria-label="Peso de ${i.nome} em kg">
            <span>kg = <b data-valor-item="${i.id}">R$ 0,00</b></span></div>
          <div class="atalhos-peso">${raw([0.1, 0.5, 1].map((g) => html`<button type="button" data-somar="${g}" data-alvo="${i.id}">+${g < 1 ? `${g * 1000}g` : '1kg'}</button>`).join(''))}
            <button type="button" class="zerar" data-somar="0" data-alvo="${i.id}">Zerar</button></div>
        </div>`).join(''))}
      </div>
      <div class="totais-b">
        <div><span>Total pelo peso</span><b data-total>—</b></div>
        <div><span>Sinal pago (PIX)</span><span>${dinheiro(p.sinal ?? 0)}</span></div>
        <button class="btn btn-cheio btn-largo" type="button" data-pesar="${p.id}">${raw(icone('balanca', 16))} Lançar pesos</button>
      </div></section>`;
  }
  // 3) Saída: recebe o saldo (avulso) ou libera para o motorista (faturado).
  const itens = html`${raw(p.itens.map((i) => html`<div class="item-b ok-b"><div class="nome"><span>${i.icone} ${i.nome}</span>
      <span><small>${i.qtd}x${i.peso_kg ? ` · ${kg(i.peso_kg)}` : ''}</small> &nbsp;<b>${dinheiro(i.valor_final)}</b></span></div></div>`).join(''))}`;
  const saldo = p.status === 'AGUARDANDO_SALDO';
  return html`<section class="painel detalhe" style="padding:0">${raw(topo)}
    <div class="detalhe-corpo">${raw(itens)}
      ${raw(saldo && p.comprovante_saldo ? html`<a href="${p.comprovante_saldo}" target="_blank" rel="noopener">O cliente enviou o comprovante do saldo</a>` : '')}</div>
    <div class="totais-b">
      <div><span>Total atualizado</span><b>${dinheiro(p.valor_final)}</b></div>
      ${raw(saldo ? html`<div><span>Sinal pago (PIX)</span><span>${dinheiro(p.sinal ?? 0)}</span></div>
        <div class="devedor"><span>Saldo devedor</span><b>${dinheiro(p.saldo)}</b></div>`
    : '<div><span>Pagamento</span><span>Faturado para a empresa ou escola</span></div>')}
      <button class="btn btn-ok btn-largo" type="button" data-liberar="${p.id}">${raw(icone(saldo ? 'carteira' : 'entrega', 16))}
        ${saldo ? (p.saldo > 0 ? 'Cobrar e liberar' : 'Entregar ao cliente') : 'Liberar para o motorista'}</button>
    </div></section>`;
}

function recalcularPesagem(caixaEl) {
  let total = 0; let feitos = 0;
  const campos = caixaEl.querySelectorAll('[data-peso]');
  campos.forEach((inp) => {
    const peso = Number(inp.value);
    const v = inp.dataset.venda === 'kg' ? peso * Number(inp.dataset.preco) : Number(inp.dataset.qtd) * Number(inp.dataset.preco);
    const ok = peso > 0;
    if (ok) { feitos += 1; total += v; }
    caixaEl.querySelector(`[data-valor-item="${inp.dataset.peso}"]`).textContent = dinheiro(ok ? v : 0);
    caixaEl.querySelector(`[data-item-b="${inp.dataset.peso}"]`)?.classList.toggle('ok-b', ok);
    caixaEl.querySelector(`[data-item-b="${inp.dataset.peso}"]`)?.classList.toggle('pesar', !ok);
  });
  const pct = campos.length ? Math.round((feitos / campos.length) * 100) : 0;
  caixaEl.querySelector('[data-progresso]').style.width = `${pct}%`;
  caixaEl.querySelector('[data-progresso-pct]').textContent = `${pct}%`;
  caixaEl.querySelector('[data-progresso-txt]').textContent = `Pesagem: ${feitos} de ${campos.length}`;
  caixaEl.querySelector('[data-total]').textContent = feitos === campos.length ? dinheiro(total) : '—';
}

// ------------------------------------------------------------------ Financeiro
async function desenharFinanceiro() {
  const pedidos = await api('GET', '/api/pedidos');
  const pendentes = await Promise.all(pedidos.filter((p) => p.status === 'AGUARDANDO_CONFIRMACAO').map((p) => api('GET', `/api/pedidos/${p.id}`)));
  const faturar = pedidos.filter((p) => p.tipo !== 'individual' && p.valor_final != null && ATIVOS(p));
  const saldos = pedidos.filter((p) => p.status === 'AGUARDANDO_SALDO');
  const mes = `${meta.hoje.slice(0, 8)}01`;
  vista.innerHTML = html`<div class="titulo"><h2>Aprovações PIX <span class="contador-amarelo">${pendentes.length} pendente(s)</span></h2></div>
    ${raw(pendentes.length ? `<div class="aprovacoes">${pendentes.map(aprovacaoHTML).join('')}</div>`
    : '<p class="vazio" style="margin-bottom:30px">Nenhum comprovante esperando. Quando um cliente avulso enviar o sinal pelo chat, ele aparece aqui.</p>')}

    <div class="secao"><h2>Saldos a receber no balcão</h2><p>Pedidos avulsos prontos, esperando o cliente pagar o saldo e retirar.</p></div>
    <div class="painel lista-fin" style="margin-bottom:30px">${raw(saldos.map((p) => html`<div class="linha-f">
      <span><span class="codigo">${p.codigo}</span> · <b>${p.cliente_nome}</b> <span class="sub">retirada ${dataCurta(p.data_entrega)} às ${p.horario}</span></span>
      <span>Saldo <b style="color:var(--primaria)">${dinheiro(p.saldo)}</b> &nbsp;<a class="btn btn-peq" href="#balcao" data-ir-balcao="${p.id}">Abrir no balcão</a></span></div>`).join('')
    || '<p class="sub">Nenhum saldo pendente.</p>')}</div>

    <div class="secao"><h2>Escolas e empresas a faturar</h2><p>Pedidos faturados (sem sinal), com o valor final já pesado.</p></div>
    <div class="painel lista-fin" style="margin-bottom:30px">${raw(faturar.map((p) => html`<div class="linha-f">
      <span>${raw(icone('empresa', 15))} <span class="codigo">${p.codigo}</span> · <b>${p.cliente_nome}</b> <span class="sub">${meta.tipos[p.tipo]}${p.cnpj ? ` · CNPJ ${p.cnpj}` : ''}</span></span>
      <span>${raw(selo(p.status))} &nbsp;<b>${dinheiro(p.valor_final)}</b></span></div>`).join('')
    || '<p class="sub">Nenhum pedido faturado ainda.</p>')}</div>

    <div class="secao"><h2>Exportação e fechamento</h2><p>Planilha do mês para a contabilidade e fechamento do dia (encerra os pedidos entregues).</p></div>
    <div class="painel lista-fin">
      <div class="linha-f"><span>${raw(icone('baixar', 15))} <b>Planilha do mês atual</b> <span class="sub">CSV com todos os pedidos desde ${dataBR(mes)}</span></span>
        <a class="btn btn-ok btn-peq" href="/api/relatorios.csv?de=${mes}&ate=${meta.hoje}" download>Exportar (.csv)</a></div>
      <div class="linha-f"><span>${raw(icone('cadeado', 15))} <b>Fechamento do dia</b> <span class="sub">Encerra os pedidos já entregues</span></span>
        <button class="btn btn-cheio btn-peq" type="button" id="fechar">Fechar o dia</button></div>
    </div>`;
}

function aprovacaoHTML(p) {
  const restante = (p.valor_estimado ?? 0) - (p.sinal ?? 0);
  return html`<article class="painel aprovacao">
    <header><div><span class="codigo">${p.codigo}</span><h3>${p.cliente_nome} (${TIPO_CURTO[p.tipo]})</h3>
      <p class="sub">Entrega ${dataBR(p.data_entrega)} às ${p.horario}</p></div>
      <div class="valor-sinal">Sinal (PIX)<strong>${dinheiro(p.sinal)}</strong>${raw(icone('relogio', 12))} <span data-prazo="${p.prazo_validacao_ate}"></span></div></header>
    <div class="meio">
      <div class="detalhes-pedido"><h4>Detalhes do pedido</h4>
        <span>Valor estimado: <b>${dinheiro(p.valor_estimado)}</b></span>
        <span>Sinal enviado: <b>${dinheiro(p.sinal)}</b></span>
        <span>Saldo na retirada: <b>${dinheiro(restante)}</b></span>
        <div class="itens-d">${raw(p.itens.map((i) => html`${i.qtd}x ${i.nome}<br>`).join(''))}</div></div>
      <div class="comprovante-box"><span>${raw(icone('imagem', 13))} Comprovante PIX</span>
        <img src="${p.comprovante_sinal}" alt="Comprovante do pedido ${p.codigo}" data-ampliar="${p.comprovante_sinal}"></div>
    </div>
    <div class="acoes">
      <button class="btn btn-ok" type="button" data-validar="${p.id}">${raw(icone('ok', 15))} Aprovar</button>
      <button class="btn btn-erro" type="button" data-recusar="${p.id}">${raw(icone('x', 15))} Rejeitar</button>
    </div>
  </article>`;
}

// ------------------------------------------------------------------ Produtos
async function desenharProdutos() {
  const [produtos, regras] = await Promise.all([api('GET', '/api/produtos'), api('GET', '/api/sazonalidade')]);
  const md = (s) => (s ? `${s.slice(3)}/${s.slice(0, 2)}` : '');
  const conta = (s) => produtos.filter((p) => p.setor === s).length;
  vista.innerHTML = html`<div class="titulo"><div><h2>Catálogo de Produtos</h2><p>Gerencie o catálogo, os preços e os prazos de encomenda. As mudanças valem na hora para o chat.</p></div></div>
    <div class="numeros">
      ${raw(numeroCard('vermelho', 'produtos', 'Total no catálogo', produtos.filter((p) => p.ativo).length))}
      ${raw(numeroCard('laranja', 'paes', 'Padaria', conta('paes')))}
      ${raw(numeroCard('roxo', 'confeitaria', 'Confeitaria', conta('confeitaria')))}
      ${raw(numeroCard('teal', 'salgados', 'Salgados', conta('salgados')))}
    </div>
    <div class="filtros">
      <label class="busca" style="width:min(330px,100%)">${raw(icone('busca', 15))}<span class="visualmente-oculto">Buscar produto</span>
        <input type="search" id="buscaProduto" placeholder="Buscar por nome..." value="${buscaProduto}"></label>
      <div class="segmentos" role="group" aria-label="Setor">${raw([['todos', 'Todos'], ['paes', 'Padaria'], ['confeitaria', 'Confeitaria'], ['salgados', 'Salgados']]
    .map(([id, r]) => html`<button type="button" data-filtro-produto="${id}" aria-pressed="${filtroProduto === id}">${r}</button>`).join(''))}</div>
    </div>
    <div class="tabela"><table>
      <thead><tr><th>Produto</th><th>Setor</th><th>Venda</th><th class="num">Preço (R$)</th><th>Época</th><th>No catálogo</th></tr></thead>
      <tbody>${raw(produtos.map((p) => html`<tr data-linha-produto data-setor="${p.setor}" data-nome="${p.nome.toLowerCase()}">
        <td>${p.icone} <b>${p.nome}</b></td><td><span class="tag-setor">${SETOR_CURTO[p.setor]}</span></td><td>${p.venda === 'kg' ? 'por quilo' : 'por unidade'}</td>
        <td class="num"><input type="number" step="0.01" min="0.01" value="${p.preco}" data-preco="${p.id}" aria-label="Preço de ${p.nome}"></td>
        <td>${p.sazonal_inicio ? `${md(p.sazonal_inicio)} a ${md(p.sazonal_fim)}` : 'o ano todo'}</td>
        <td><input type="checkbox" ${raw(p.ativo ? 'checked' : '')} data-ativo="${p.id}" aria-label="${p.nome} no catálogo"></td></tr>`).join(''))}</tbody></table></div>
    <div class="tabelas"><div class="tabela"><h3>Prazos de sazonalidade</h3><table>
      <thead><tr><th>Período</th><th>Datas</th><th class="num">Antecedência (dias)</th></tr></thead>
      <tbody>${raw(regras.map((s) => html`<tr><td>${s.nome}</td><td>${md(s.inicio)} a ${md(s.fim)}</td>
        <td class="num"><input type="number" min="0" max="30" value="${s.prazo_dias}" data-prazo-regra="${s.id}" aria-label="Antecedência para ${s.nome}"></td></tr>`).join(''))}</tbody></table>
      <p class="sub" style="margin-top:10px">Fora desses períodos: 1 dia para avulso e 2 dias para escola ou empresa; pedidos acima de 200 unidades ganham mais 1 dia.</p></div></div>`;
  filtrarProdutos();
}

function filtrarProdutos() {
  vista.querySelectorAll('[data-linha-produto]').forEach((tr) => {
    const ok = (filtroProduto === 'todos' || tr.dataset.setor === filtroProduto) && tr.dataset.nome.includes(buscaProduto.toLowerCase());
    tr.classList.toggle('oculto', !ok);
  });
}

// ------------------------------------------------------------------ Relatórios
const PERIODOS = [['tudo', 'Todo o período'], ['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Mês atual'], ['pers', 'Personalizado']];
function intervalo() {
  const h = meta.hoje;
  if (periodoRel === 'hoje') return { de: h, ate: h };
  if (periodoRel === '7') return { de: somaDias(h, -6), ate: h };
  if (periodoRel === '30') return { de: somaDias(h, -29), ate: h };
  if (periodoRel === 'mes') return { de: `${h.slice(0, 8)}01`, ate: h };
  if (periodoRel === 'pers') return periodoPers ?? { de: h, ate: h };
  return { de: '2000-01-01', ate: h };
}

async function desenharRelatorios() {
  const { de, ate } = intervalo();
  const [r, produtos] = await Promise.all([api('GET', `/api/relatorios?de=${de}&ate=${ate}`), api('GET', '/api/produtos')]);
  const qs = `de=${de}&ate=${ate}`;
  const fat = faturamento(r);
  const concluidos = r.pedidos.filter((p) => p.valor_final != null).length;
  const clientes = new Set(r.pedidos.map((p) => p.telefone || p.cliente_nome)).size;
  const setorDe = Object.fromEntries(produtos.map((p) => [p.nome, p.setor]));
  const porSetor = { paes: 0, confeitaria: 0, salgados: 0 };
  for (const p of r.porProduto) porSetor[setorDe[p.nome]] += p.valor;
  const grupos = [
    ['Aguard. pagamento', ['AGUARDANDO_SINAL', 'AGUARDANDO_CONFIRMACAO'], '#ecc94b'],
    ['Em produção', ['LIBERADO', 'EM_PRODUCAO', 'CONFERENCIA'], '#dd6b20'],
    ['Aguard. retirada', ['AGUARDANDO_SALDO', 'PRONTO_ENTREGA'], '#3182ce'],
    ['Concluído', ['ENTREGUE', 'FECHADO'], '#38a169'],
    ['Bloq./cancelado', ['BLOQUEADO', 'CANCELADO'], '#a32323'],
  ].map(([rotulo, st, cor]) => ({ rotulo, cor, valor: st.reduce((s, x) => s + (r.porStatus[x] ?? 0), 0) }));
  const rotuloPeriodo = periodoRel === 'tudo' ? 'Todo o período' : `${dataBR(de)} a ${dataBR(ate)}`;
  const linhas = (obj, rotulos) => Object.entries(obj).map(([k, v]) => html`<tr><td>${rotulos[k] ?? k}</td><td class="num">${v}</td></tr>`).join('')
    || '<tr><td colspan="2">Sem dados no período.</td></tr>';

  vista.innerHTML = html`<div class="titulo"><div><h2>Relatórios</h2><p>Desempenho da operação e faturamento por setor.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="button" onclick="window.print()">${raw(icone('imprimir', 15))} Imprimir ou PDF</button>
        <a class="btn btn-ok" href="/api/relatorios.csv?${qs}" download>${raw(icone('baixar', 15))} Exportar (.csv)</a></div></div>
    <section class="painel periodo">
      <span class="rotulo-p">Período do relatório</span>
      <div class="pilulas">${raw(PERIODOS.map(([id, t]) => html`<button type="button" data-periodo="${id}" aria-pressed="${periodoRel === id}">${t}</button>`).join(''))}</div>
      ${raw(periodoRel === 'pers' ? html`<div class="datas"><label class="sub">De<br><input type="date" id="de" value="${de}"></label>
        <label class="sub">Até<br><input type="date" id="ate" value="${ate}"></label><button class="btn btn-cheio btn-peq" type="button" id="filtrar">Aplicar</button></div>`
    : html`<span class="contador-cinza">${rotuloPeriodo}</span>`)}
    </section>
    <div class="numeros">
      ${raw(numeroCard('verde', 'alta', 'Faturamento (recebido + a faturar)', dinheiro(fat)))}
      ${raw(numeroCard('laranja', 'carteira', 'Ticket médio', dinheiro(concluidos ? fat / concluidos : 0)))}
      ${raw(numeroCard('vermelho', 'pedidos', 'Total de pedidos', r.totalPedidos))}
      ${raw(numeroCard('azul', 'clientes', 'Clientes atendidos', clientes))}
    </div>
    <div class="graficos" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
      <section class="painel"><h3>Faturamento por setor</h3>
        ${raw(graficoBarras(Object.entries(porSetor).map(([s, v]) => ({ rotulo: SETOR_CURTO[s], valor: v })), dinheiro))}</section>
      <section class="painel"><h3>Distribuição de status</h3>${raw(graficoRosca(grupos))}</section>
    </div>
    <div class="tabelas">
      <div class="tabela"><h3>Caixa</h3><table><tbody>
        <tr><td>Sinais recebidos (PIX)</td><td class="num">${dinheiro(r.caixa.sinais)}</td></tr>
        <tr><td>Saldos recebidos</td><td class="num">${dinheiro(r.caixa.saldos)}</td></tr>
        <tr><td>A faturar (escolas e empresas)</td><td class="num">${dinheiro(r.caixa.faturar)}</td></tr>
        <tr><td><b>Total</b></td><td class="num"><b>${dinheiro(fat)}</b></td></tr></tbody></table></div>
      <div class="tabela"><h3>Pedidos por tipo de cliente</h3><table><tbody>${raw(linhas(r.porTipo, meta.tipos))}</tbody></table></div>
      <div class="tabela"><h3>Produção por produto</h3><table>
        <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Peso</th><th class="num">Valor final</th></tr></thead>
        <tbody>${raw(r.porProduto.map((p) => html`<tr><td>${p.icone} ${p.nome}</td><td class="num">${p.qtd}</td><td class="num">${p.peso ? kg(p.peso) : '—'}</td><td class="num">${p.valor ? dinheiro(p.valor) : '—'}</td></tr>`).join('') || '<tr><td colspan="4">Sem produção no período.</td></tr>')}</tbody></table></div>
      <div class="tabela"><h3>Bloqueios e cancelamentos</h3><table>
        <tbody>${raw(r.ocorrencias.map((o) => html`<tr><td>${o.codigo}</td><td>${o.cliente}</td><td>${o.motivo}</td></tr>`).join('') || '<tr><td>Nenhuma ocorrência.</td></tr>')}</tbody></table></div>
    </div>
    <div class="tabela" style="margin-top:18px"><h3>Histórico de pedidos <span class="contador-cinza">${r.pedidos.length} pedido(s)</span></h3><table>
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Entrega</th><th>Situação</th><th class="num">Valor</th></tr></thead>
      <tbody>${raw([...r.pedidos].reverse().map((p) => html`<tr><td><span class="codigo">${p.codigo}</span></td><td>${p.cliente_nome}</td><td>${TIPO_CURTO[p.tipo]}</td>
        <td>${dataCurta(p.data_entrega)} ${p.horario}</td><td>${raw(selo(p.status))}</td><td class="num">${dinheiro(p.valor_final ?? p.valor_estimado)}</td></tr>`).join('')
    || '<tr><td colspan="6">Sem pedidos no período.</td></tr>')}</tbody></table></div>`;
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
  const el = e.target.closest('button, img[data-ampliar], a[data-ir-balcao]');
  if (!el) return;
  const d = el.dataset;
  if (d.irBalcao) { pedidoBalcao = Number(d.irBalcao); return; }
  if (d.setor) { location.hash = d.setor === 'geral' ? 'producao/geral' : `producao/${d.setor}`; return; }
  if (d.balcao) { pedidoBalcao = Number(d.balcao); desenhar(); return; }
  if (d.periodo) { periodoRel = d.periodo; desenhar(); return; }
  if (d.filtroProduto) {
    filtroProduto = d.filtroProduto;
    vista.querySelectorAll('[data-filtro-produto]').forEach((b) => b.setAttribute('aria-pressed', b === el));
    filtrarProdutos(); return;
  }
  if (d.pedido) { abrirPedido(d.pedido).catch((err) => avisar(err.message, 'erro')); return; }
  if (d.ampliar) {
    dialogoCorpo.innerHTML = html`<h2>Comprovante</h2><img class="comprovante-grande" src="${d.ampliar}" alt="Comprovante ampliado">`;
    dialogo.showModal();
    return;
  }
  if (d.somar) {
    const inp = vista.querySelector(`[data-peso="${d.alvo}"]`);
    const novo = Number(d.somar) === 0 ? '' : (Number(inp.value || 0) + Number(d.somar)).toFixed(3);
    inp.value = novo;
    recalcularPesagem(el.closest('[data-pesagem]'));
    return;
  }
  if (d.validar) { el.disabled = true; acao(() => api('POST', `/api/pedidos/${d.validar}/validar-pagamento`, { aprovado: true }), 'Pagamento aprovado: pedido liberado para a produção.'); return; }
  if (d.recusar) { el.disabled = true; acao(() => api('POST', `/api/pedidos/${d.recusar}/validar-pagamento`, { aprovado: false }), 'Pagamento rejeitado: o cliente foi avisado.'); return; }
  if (d.tarefa) { el.disabled = true; acao(() => api('POST', `/api/tarefas/${d.tarefa}/status`, { status: d.status })); return; }
  if (d.conferir) {
    const caixas = [...el.closest('.detalhe').querySelectorAll('[data-item]')];
    if (d.devolver && caixas.every((c) => c.checked)) { avisar('Desmarque os itens que devem voltar para a produção.', 'erro'); return; }
    const itens = caixas.map((c) => ({ itemId: Number(c.dataset.item), ok: c.checked }));
    const faltam = itens.filter((i) => !i.ok).length;
    acao(() => api('POST', `/api/pedidos/${d.conferir}/conferencia`, { itens }),
      faltam ? `${faltam} item(ns) voltou(aram) para a produção como pendente.` : 'Conferência concluída. Agora pese os itens.');
    return;
  }
  if (d.pesar) {
    const itens = [...el.closest('[data-pesagem]').querySelectorAll('[data-peso]')].map((c) => ({ itemId: Number(c.dataset.peso), pesoKg: Number(c.value) }));
    acao(() => api('POST', `/api/pedidos/${d.pesar}/pesagem`, { itens }), 'Pesos lançados e valor calculado.');
    return;
  }
  if (d.liberar) { el.disabled = true; acao(() => api('POST', `/api/pedidos/${d.liberar}/liberar`), 'Mercadoria liberada.'); return; }
  if (el.id === 'filtrar') { periodoPers = { de: vista.querySelector('#de').value, ate: vista.querySelector('#ate').value }; desenhar(); return; }
  if (el.id === 'fechar') {
    acao(async () => { const r = await api('POST', '/api/fechamento'); avisar(`Fechamento: ${r.fechados} pedido(s) entregue(s) encerrado(s).`); });
  }
});

vista.addEventListener('input', (e) => {
  const caixa = e.target.closest('[data-pesagem]');
  if (caixa && e.target.matches('[data-peso]')) recalcularPesagem(caixa);
  if (e.target.id === 'buscaProduto') { buscaProduto = e.target.value; filtrarProdutos(); }
  if (e.target.id === 'buscaBalcao') {
    buscaBalcao = e.target.value;
    vista.querySelectorAll('[data-balcao]').forEach((b) => { b.hidden = !b.textContent.toLowerCase().includes(buscaBalcao.toLowerCase()); });
  }
});

vista.addEventListener('change', async (e) => {
  const d = e.target.dataset;
  try {
    if (d.preco && e.target.closest('table')) { await api('PATCH', `/api/produtos/${d.preco}`, { preco: Number(e.target.value) }); avisar('Preço atualizado.'); }
    if (d.ativo) { await api('PATCH', `/api/produtos/${d.ativo}`, { ativo: e.target.checked }); avisar(e.target.checked ? 'Produto voltou ao catálogo.' : 'Produto retirado do catálogo.'); }
    if (d.prazoRegra) { await api('PATCH', `/api/sazonalidade/${d.prazoRegra}`, { prazo_dias: Number(e.target.value) }); avisar('Prazo atualizado.'); }
  } catch (err) { avisar(err.message, 'erro'); }
});

// Menu: recolher no computador, gaveta no celular.
document.querySelector('#recolher').addEventListener('click', () => app.classList.toggle('recolhido'));
document.querySelector('#abrirMenu').addEventListener('click', () => { app.classList.add('menu-aberto'); document.querySelector('#fundoMenu').hidden = false; });
document.querySelector('#fundoMenu').addEventListener('click', () => { app.classList.remove('menu-aberto'); document.querySelector('#fundoMenu').hidden = true; });

window.addEventListener('hashchange', () => { lerTela(); desenhar(); });

(async () => {
  montarMenu();
  document.querySelector('#reiniciar').addEventListener('click', async () => {
    if (!confirm('Apagar todos os pedidos e reiniciar a demonstração?')) return;
    try {
      await api('POST', '/api/demo/reiniciar', { modoDemo: true });
      avisar('Demonstração reiniciada: pedidos apagados e prazo do sinal de 2 minutos.');
    } catch (e) { avisar(e.message, 'erro'); }
  });
  meta = await carregarMeta();
  lerTela();
  await desenhar();
  ouvir((ev) => {
    if (ev.tipo === 'pedido' || ev.tipo === 'reinicio' || ev.tipo === 'catalogo') {
      if (ev.texto) avisar(ev.texto);
      redesenhar();
    }
  });
})();
