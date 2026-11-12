// Banco SQLite nativo do Node (node:sqlite): sem dependência para compilar.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SEED = JSON.parse(readFileSync(path.join(RAIZ, 'dados', 'seed.json'), 'utf8'));

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, setor TEXT NOT NULL,
  venda TEXT NOT NULL CHECK (venda IN ('kg','un')), preco REAL NOT NULL,
  peso_medio_kg REAL NOT NULL, qtd_min INTEGER NOT NULL, qtd_max INTEGER NOT NULL,
  icone TEXT, sazonal_inicio TEXT, sazonal_fim TEXT, ativo INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS sazonalidade (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, inicio TEXT NOT NULL, fim TEXT NOT NULL,
  prazo_dias INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, cnpj TEXT, telefone TEXT,
  cadastrado INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS conversas (
  id TEXT PRIMARY KEY, estado TEXT NOT NULL, dados TEXT NOT NULL DEFAULT '{}',
  pedido_id INTEGER, criada_em TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY, conversa_id TEXT NOT NULL, autor TEXT NOT NULL,
  texto TEXT, extra TEXT, em TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY, codigo TEXT UNIQUE, conversa_id TEXT, cliente_id INTEGER,
  cliente_nome TEXT, telefone TEXT, cnpj TEXT, tipo TEXT NOT NULL, status TEXT NOT NULL,
  data_entrega TEXT, horario TEXT, data_pedida TEXT, prazo_regra TEXT,
  valor_estimado REAL DEFAULT 0, sinal REAL DEFAULT 0, valor_final REAL, saldo REAL, credito REAL,
  prazo_validacao_ate TEXT, comprovante_sinal TEXT, comprovante_saldo TEXT,
  motivo TEXT, assinatura TEXT, conferido INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS itens (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL, produto_id INTEGER NOT NULL,
  qtd INTEGER NOT NULL, valor_estimado REAL, peso_kg REAL, valor_final REAL);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
  setor TEXT NOT NULL, status TEXT NOT NULL, pendente INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY, pedido_id INTEGER, atividade TEXT NOT NULL, raia TEXT,
  detalhe TEXT, em TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS caixa (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL, tipo TEXT NOT NULL,
  valor REAL NOT NULL, em TEXT NOT NULL);
`;

export function abrirBanco(arquivo = path.join(RAIZ, 'dados', 'padaria.db')) {
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(ESQUEMA);

  const todos = (sql, ...p) => db.prepare(sql).all(...p);
  const um = (sql, ...p) => db.prepare(sql).get(...p);
  const exec = (sql, ...p) => db.prepare(sql).run(...p);

  function transacao(fn) {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  function config(chave) {
    return um('SELECT valor FROM config WHERE chave = ?', chave)?.valor;
  }
  const setConfig = (chave, valor) =>
    exec('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
      chave, String(valor));

  /** Apaga tudo e recarrega o cardápio de exemplo. */
  function semear({ modoDemo = false } = {}) {
    transacao(() => {
      for (const t of ['caixa', 'eventos', 'tarefas', 'itens', 'pedidos', 'mensagens', 'conversas',
        'clientes', 'sazonalidade', 'produtos', 'config']) db.exec(`DELETE FROM ${t}`);
      for (const p of SEED.produtos) {
        exec(`INSERT INTO produtos (nome, descricao, setor, venda, preco, peso_medio_kg, qtd_min, qtd_max,
              icone, sazonal_inicio, sazonal_fim) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        p.nome, p.descricao, p.setor, p.venda, p.preco, p.peso_medio_kg, p.qtd_min, p.qtd_max,
        p.icone, p.sazonal_inicio ?? null, p.sazonal_fim ?? null);
      }
      for (const s of SEED.sazonalidade) {
        exec('INSERT INTO sazonalidade (nome, inicio, fim, prazo_dias) VALUES (?,?,?,?)',
          s.nome, s.inicio, s.fim, s.prazo_dias);
      }
      for (const c of SEED.clientes_pj) {
        exec('INSERT INTO clientes (nome, tipo, cnpj, telefone, cadastrado) VALUES (?,?,?,?,1)',
          c.nome, c.tipo, c.cnpj, c.telefone);
      }
      for (const [k, v] of Object.entries(SEED.config)) setConfig(k, v);
      setConfig('modo_demo', modoDemo ? 1 : 0);
    });
  }

  if (!um('SELECT 1 AS ok FROM produtos LIMIT 1')) semear();

  const produtos = () => todos('SELECT * FROM produtos ORDER BY setor, nome');

  return { db, todos, um, exec, transacao, config, setConfig, semear, produtos };
}
