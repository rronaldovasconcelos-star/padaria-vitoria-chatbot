// Utilidades compartilhadas pelas telas.

export async function api(metodo, url, corpo) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo instanceof FormData) opcoes.body = corpo;
  else if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  const r = await fetch(url, opcoes);
  const tipo = r.headers.get('content-type') ?? '';
  const dados = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(dados?.erro ?? `Erro ${r.status}`);
  return dados;
}

/** Assina o canal de tempo real; reconecta sozinho. */
export function ouvir(callback) {
  const fonte = new EventSource('/api/eventos');
  fonte.onmessage = (e) => {
    try { callback(JSON.parse(e.data)); } catch { /* ignora ping */ }
  };
  return fonte;
}

export const dinheiro = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const kg = (n) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export const dataCurta = (iso) => dataBR(iso).slice(0, 5);
export const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** html`...` com escape automático dos valores (use raw() para HTML confiável). */
export function html(partes, ...valores) {
  return partes.reduce((s, p, i) => {
    if (i === 0) return p;
    const v = valores[i - 1];
    const txt = v?.__raw ?? (Array.isArray(v) ? v.map((x) => x?.__raw ?? esc(x)).join('') : esc(v));
    return s + txt + p;
  }, '');
}
export const raw = (s) => ({ __raw: s });

export function avisar(texto, tipo = '') {
  let pilha = document.querySelector('.avisos');
  if (!pilha) {
    pilha = document.createElement('div');
    pilha.className = 'avisos';
    pilha.setAttribute('role', 'status');
    pilha.setAttribute('aria-live', 'polite');
    document.body.append(pilha);
  }
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = texto;
  pilha.append(el);
  while (pilha.children.length > 3) pilha.firstElementChild.remove();
  setTimeout(() => el.remove(), 4500);
}

let meta;
export async function carregarMeta() {
  meta ??= await api('GET', '/api/meta');
  return meta;
}
