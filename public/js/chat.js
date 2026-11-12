// Chat do cliente: desenha as mensagens do bot e envia botões, texto, carrinho e comprovante.
import { api, ouvir, dinheiro, dataCurta, hora, html, raw, avisar, carregarMeta } from './comum.js';

const $ = (s) => document.querySelector(s);
const conversaEl = $('#conversa');
const form = $('#form');
const texto = $('#texto');
const botaoEnviar = form.querySelector('button');

const CHAVE = 'padaria.conversa';
let conversaId = null;
let ultimoId = 0;
let mensagens = [];
let meta;
let catalogo = [];
const carrinho = new Map(); // produtoId -> qtd
let relogioPrazo = null;

// ------------------------------------------------------------------ início
async function iniciar() {
  meta = await carregarMeta();
  try { conversaId = localStorage.getItem(CHAVE); } catch { /* sem storage */ }
  if (conversaId) {
    try { await buscar(); } catch { conversaId = null; }
  }
  if (!conversaId) await novaConversa();
  texto.disabled = false;
  botaoEnviar.disabled = false;
  texto.placeholder = 'Escreva ou escolha uma opção';
  ouvir(async (ev) => {
    if (ev.tipo === 'mensagem' && ev.conversaId === conversaId) await buscar();
    if (ev.tipo === 'reinicio') { await novaConversa(); }
    if (ev.tipo === 'catalogo') catalogo = await api('GET', '/api/catalogo');
  });
}

async function novaConversa() {
  const { id } = await api('POST', '/api/conversas');
  conversaId = id;
  try { localStorage.setItem(CHAVE, id); } catch { /* sem storage */ }
  ultimoId = 0;
  mensagens = [];
  carrinho.clear();
  conversaEl.innerHTML = '';
  await buscar();
}

let buscando = Promise.resolve();
function buscar() {
  // Serializa as buscas para não desenhar a mesma mensagem duas vezes.
  buscando = buscando.then(async () => {
    const novas = await api('GET', `/api/conversas/${conversaId}/mensagens?depois=${ultimoId}`);
    if (!novas.length) return;
    $('.digitando')?.remove();
    mensagens.push(...novas);
    ultimoId = novas.at(-1).id;
    desenhar(novas);
  });
  return buscando;
}

// ------------------------------------------------------------------ desenho
function rolar() {
  requestAnimationFrame(() => { conversaEl.scrollTop = conversaEl.scrollHeight; });
}
conversaEl.addEventListener('load', rolar, true); // imagens (QR, comprovante) mudam a altura

function desenhar(novas) {
  for (const m of novas) conversaEl.insertAdjacentHTML('beforeend', mensagemHTML(m));
  // Só os botões da última mensagem continuam ativos.
  const msgs = conversaEl.querySelectorAll('.msg');
  msgs.forEach((el, i) => {
    if (i === msgs.length - 1) return;
    el.querySelectorAll('.opcoes .btn, .envio .btn, .envio label').forEach((b) => { b.setAttribute('disabled', ''); b.classList.add('inativo'); });
  });
  ligarUltima();
  rolar();
  const ultimaBot = [...mensagens].reverse().find((m) => m.autor === 'bot');
  const campo = ultimaBot?.extra?.campo;
  texto.type = campo === 'tel' ? 'tel' : 'text';
  texto.placeholder = ultimaBot?.extra?.dica ?? 'Escreva ou escolha uma opção';
  if (campo) texto.focus({ preventScroll: true });
}

function mensagemHTML(m) {
  const x = m.extra ?? {};
  const partes = [];
  if (m.texto) partes.push(html`<div class="balao">${m.texto}</div>`);
  if (x.imagem) partes.push(html`<img class="anexo" src="${x.imagem}" alt="Comprovante enviado">`);
  if (x.resumo) partes.push(resumoHTML(x.resumo));
  if (x.pix) partes.push(pixHTML(x.pix, x.upload, x.prazoAte));
  if (x.status) partes.push(trilhaHTML(x.status));
  if (x.botoes?.length) {
    partes.push(`<div class="opcoes">${x.botoes.map((b) => html`<button class="btn" type="button" data-valor="${b.valor}" data-acao="${b.acao ?? ''}">${b.rotulo}</button>`).join('')}</div>`);
  }
  return `<div class="msg ${m.autor} nova" data-id="${m.id}">${partes.join('')}<span class="hora">${hora(m.em)}</span></div>`;
}

function resumoHTML(r) {
  return html`<article class="comanda">
    <h3>Seu pedido</h3>
    <dl>
      <dt>Cliente</dt><dd>${r.cliente}</dd>
      <dt>Tipo</dt><dd>${r.tipo}${r.cnpj ? ` · CNPJ ${r.cnpj}` : ''}</dd>
      <dt>Entrega</dt><dd>${r.data} às ${r.horario}</dd>
    </dl>
    <ul>${r.linhas.map((l) => raw(html`<li><span>${l.icone ?? ''} ${l.nome}</span><span>${l.qtd}×</span></li>`))}</ul>
    <div class="totais">
      <div><span>Valor estimado</span><span>${dinheiro(r.estimado)}</span></div>
      ${raw(r.sinal != null ? html`<div class="sinal"><span>Sinal agora (50%)</span><span>${dinheiro(r.sinal)}</span></div>` : '')}
    </div>
    <p class="obs">${r.observacao}</p>
  </article>`;
}

function pixHTML(p, upload, prazoAte) {
  return html`<div class="pix">
    <span>PIX · ${p.rotulo === 'SALDO' ? 'saldo restante' : 'sinal de 50%'}</span>
    <span class="valor">${dinheiro(p.valor)}</span>
    <img src="${p.qr}" alt="QR Code PIX de ${dinheiro(p.valor)}">
    <div class="copia"><input type="text" readonly value="${p.copiaECola}" aria-label="PIX copia e cola">
      <button class="btn btn-peq" type="button" data-copiar>Copiar</button></div>
    ${raw(prazoAte ? html`<span class="prazo" data-prazo="${prazoAte}"></span>` : '')}
    ${raw(upload ? html`<div class="envio">
      <label class="btn btn-cheio btn-peq" tabindex="0">Enviar comprovante<input type="file" accept="image/*,application/pdf" data-upload></label>
      ${raw(meta?.modoDemo ? '<button class="btn btn-peq" type="button" data-exemplo>Usar comprovante de exemplo</button>' : '')}
    </div>` : '')}
  </div>`;
}

const PASSOS = ['Pedido recebido', 'Pagamento', 'Produção', 'Conferência e pesagem', 'Pronto', 'Entregue'];
const INDICE = {
  AGUARDANDO_SINAL: 1, AGUARDANDO_CONFIRMACAO: 1, LIBERADO: 2, EM_PRODUCAO: 2, CONFERENCIA: 3,
  AGUARDANDO_SALDO: 4, PRONTO_ENTREGA: 4, ENTREGUE: 6, FECHADO: 6,
};

function trilhaHTML(s) {
  if (s.status === 'BLOQUEADO' || s.status === 'CANCELADO') {
    return html`<div class="comanda"><span class="selo" data-s="${s.status}">${s.rotulo}</span><p>${s.motivo ?? ''}</p></div>`;
  }
  const atual = INDICE[s.status] ?? 0;
  const passos = PASSOS.map((p, i) => {
    let rotulo = p;
    if (i === 1) rotulo = s.tipo === 'individual' ? 'Pagamento do sinal' : 'Faturado (sem sinal)';
    if (i === 4 && s.status === 'AGUARDANDO_SALDO') rotulo = `Pronto · saldo ${dinheiro(s.saldo)}`;
    const classe = i < atual ? 'feito' : i === atual ? 'atual' : '';
    const setores = i === 2 && atual === 2 && s.tarefas?.length
      ? html`<span class="setores">${s.tarefas.map((t) => raw(html`<span class="selo">${meta.setores[t.setor].nome}: ${t.status}</span>`))}</span>`
      : '';
    return html`<li class="${classe}">${rotulo}${raw(setores)}</li>`;
  });
  return `<ol class="trilha" aria-label="Andamento do pedido ${s.codigo}">${passos.join('')}</ol>`;
}

function ligarUltima() {
  clearInterval(relogioPrazo);
  const prazos = [...conversaEl.querySelectorAll('[data-prazo]')];
  const ultimo = prazos.at(-1);
  prazos.slice(0, -1).forEach((p) => { p.textContent = ''; });
  if (ultimo && !ultimo.closest('.msg').nextElementSibling) {
    const tic = () => {
      const falta = new Date(ultimo.dataset.prazo) - Date.now();
      if (falta <= 0) { ultimo.textContent = 'Prazo encerrado'; ultimo.classList.add('vencido'); clearInterval(relogioPrazo); return; }
      const m = Math.floor(falta / 60000); const s = Math.floor((falta % 60000) / 1000);
      ultimo.textContent = `Tempo para pagar: ${m}:${String(s).padStart(2, '0')}`;
    };
    tic();
    relogioPrazo = setInterval(tic, 1000);
  }
}

// ------------------------------------------------------------------ ações
function digitando() {
  if (!$('.digitando')) {
    conversaEl.insertAdjacentHTML('beforeend', '<div class="digitando" aria-label="Vitória está digitando"><i></i><i></i><i></i></div>');
    rolar();
  }
}

async function enviar(entrada) {
  digitando();
  try {
    await api('POST', `/api/conversas/${conversaId}/entrada`, entrada);
    await buscar();
  } catch (e) {
    $('.digitando')?.remove();
    avisar(e.message, 'erro');
  }
}

conversaEl.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || b.hasAttribute('disabled')) return;
  if (b.dataset.copiar !== undefined) {
    const campo = b.previousElementSibling;
    try { await navigator.clipboard.writeText(campo.value); avisar('Código PIX copiado.'); } catch { campo.select(); }
    return;
  }
  if (b.dataset.exemplo !== undefined) {
    b.disabled = true;
    try { await api('POST', `/api/conversas/${conversaId}/comprovante-exemplo`); await buscar(); } catch (err) { avisar(err.message, 'erro'); b.disabled = false; }
    return;
  }
  if (b.dataset.acao === 'catalogo') { abrirCatalogo(); return; }
  if (b.dataset.valor) enviar({ tipo: 'botao', valor: b.dataset.valor, rotulo: b.textContent.trim() });
});

conversaEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('label.btn')) e.target.querySelector('input').click();
});

conversaEl.addEventListener('change', async (e) => {
  if (!e.target.matches('[data-upload]')) return;
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  const fd = new FormData();
  fd.append('arquivo', arquivo);
  try { await api('POST', `/api/conversas/${conversaId}/comprovante`, fd); await buscar(); } catch (err) { avisar(err.message, 'erro'); }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = texto.value.trim();
  if (!t) return;
  texto.value = '';
  enviar({ tipo: 'texto', texto: t });
});

$('#nova').addEventListener('click', () => novaConversa());

// ------------------------------------------------------------------ catálogo
const catalogoEl = $('#catalogo');
let setorAtual = 'paes';

async function abrirCatalogo() {
  catalogo = await api('GET', '/api/catalogo');
  desenharAbas();
  desenharProdutos();
  atualizarCarrinho();
  catalogoEl.hidden = false;
  catalogoEl.querySelector('h2').focus?.();
}

function desenharAbas() {
  $('#abas').innerHTML = Object.entries(meta.setores).map(([id, s]) =>
    html`<button type="button" role="tab" data-setor="${id}" aria-selected="${id === setorAtual}">${s.nome}</button>`).join('');
}

const passo = (p) => (p.qtd_min >= 10 ? 5 : 1);
const precoTexto = (p) => (p.venda === 'kg'
  ? html`${dinheiro(p.preco)}/kg <small>· cerca de ${p.peso_medio_kg >= 1 ? `${String(p.peso_medio_kg).replace(".", ",")} kg` : `${Math.round(p.peso_medio_kg * 1000)} g`} cada</small>`
  : html`${dinheiro(p.preco)} <small>a unidade</small>`);
const estimadoItem = (p, q) => (p.venda === 'kg' ? q * p.peso_medio_kg * p.preco : q * p.preco);

function desenharProdutos() {
  const lista = catalogo.filter((p) => p.setor === setorAtual);
  $('#produtos').innerHTML = lista.map((p) => {
    const q = carrinho.get(p.id) ?? 0;
    const epoca = p.sazonal_inicio
      ? html`<span class="epoca">Só de ${p.sazonal_inicio.slice(3)}/${p.sazonal_inicio.slice(0, 2)} a ${p.sazonal_fim.slice(3)}/${p.sazonal_fim.slice(0, 2)}</span>` : '';
    return html`<article class="produto ${q ? 'escolhido' : ''}" data-id="${p.id}">
      <span class="icone" aria-hidden="true">${p.icone}</span>
      <h3>${p.nome}</h3>
      <p class="desc">${p.descricao}</p>
      <p class="preco">${raw(precoTexto(p))} ${raw(epoca)}</p>
      <div class="qtd">
        <button type="button" data-mais="-1" aria-label="Diminuir ${p.nome}">−</button>
        <input type="number" min="0" inputmode="numeric" value="${q}" aria-label="Quantidade de ${p.nome}">
        <button type="button" data-mais="1" aria-label="Aumentar ${p.nome}">+</button>
        <small>mín. ${p.qtd_min}</small>
      </div>
    </article>`;
  }).join('');
}

function atualizarCarrinho() {
  let total = 0; let n = 0;
  for (const [id, q] of carrinho) {
    const p = catalogo.find((x) => x.id === id);
    if (p && q > 0) { total += estimadoItem(p, q); n += 1; }
  }
  $('#carrinhoQtd').textContent = n ? `${n} produto(s) · estimado` : 'Nenhum item';
  $('#carrinhoTotal').textContent = n ? dinheiro(total) : '';
  $('#enviarCarrinho').disabled = n === 0;
}

function definir(id, q) {
  if (q > 0) carrinho.set(id, q); else carrinho.delete(id);
  const art = $(`.produto[data-id="${id}"]`);
  art.classList.toggle('escolhido', q > 0);
  art.querySelector('input').value = q;
  atualizarCarrinho();
}

$('#produtos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mais]');
  if (!b) return;
  const id = Number(b.closest('.produto').dataset.id);
  const p = catalogo.find((x) => x.id === id);
  const atual = carrinho.get(id) ?? 0;
  let q = atual + Number(b.dataset.mais) * passo(p);
  if (Number(b.dataset.mais) > 0 && atual === 0) q = p.qtd_min;
  if (q < p.qtd_min) q = Number(b.dataset.mais) < 0 ? 0 : p.qtd_min;
  definir(id, Math.max(0, q));
});

$('#produtos').addEventListener('change', (e) => {
  if (!e.target.matches('input')) return;
  const id = Number(e.target.closest('.produto').dataset.id);
  definir(id, Math.max(0, Math.floor(Number(e.target.value) || 0)));
});

$('#abas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-setor]');
  if (!b) return;
  setorAtual = b.dataset.setor;
  desenharAbas();
  desenharProdutos();
});

$('#fecharCatalogo').addEventListener('click', () => { catalogoEl.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') catalogoEl.hidden = true; });

$('#enviarCarrinho').addEventListener('click', () => {
  catalogoEl.hidden = true;
  const itens = [...carrinho].filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd }));
  enviar({ tipo: 'carrinho', itens });
});

iniciar().catch((e) => avisar(e.message, 'erro'));
