// Servidor HTTP: API do chat, dos painéis e o canal de tempo real (SSE).
import express from 'express';
import multer from 'multer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { abrirBanco } from './banco.js';
import { criarProcesso } from './processo.js';
import { criarBot } from './bot/conversa.js';
import { ATIVIDADES } from './motor/atividades.js';
import { ROTULO_STATUS } from './motor/estados.js';
import { ROTULO_TIPO, formatarCNPJ } from './motor/classificar.js';
import { SETORES } from './motor/comanda.js';
import { ErroRegra, dataBR, dataLocal, dinheiro } from './motor/util.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function criarApp({ arquivoBanco, pastaUploads = path.join(RAIZ, 'dados', 'uploads'), agora = () => new Date() } = {}) {
  const banco = abrirBanco(arquivoBanco);
  mkdirSync(pastaUploads, { recursive: true });

  // ------------------------------------------------------------- tempo real
  const ouvintes = new Set();
  const notificar = (evento) => {
    const linha = `data: ${JSON.stringify(evento)}\n\n`;
    for (const res of ouvintes) res.write(linha);
  };

  const processo = criarProcesso({ banco, agora, notificar });
  const bot = criarBot({ banco, processo, agora });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  for (const pagina of ['chat', 'painel', 'processo']) {
    app.get(`/${pagina}`, (_req, res) => res.sendFile(path.join(RAIZ, 'public', `${pagina}.html`)));
  }
  app.use(express.static(path.join(RAIZ, 'public')));
  app.use('/uploads', express.static(pastaUploads));

  const upload = multer({
    storage: multer.diskStorage({
      destination: pastaUploads,
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase() || '.png'}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /^image\/|^application\/pdf$/.test(file.mimetype)),
  });

  const rota = (fn) => async (req, res) => {
    try {
      const r = await fn(req, res);
      if (!res.headersSent) res.json(r ?? { ok: true });
    } catch (e) {
      const status = e.codigo === 'nao_encontrado' ? 404 : e instanceof ErroRegra ? 422 : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ erro: e.message });
    }
  };

  app.get('/api/eventos', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    ouvintes.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); ouvintes.delete(res); });
  });

  // ------------------------------------------------------------- referência
  app.get('/api/meta', rota(() => ({
    atividades: ATIVIDADES,
    status: ROTULO_STATUS,
    tipos: ROTULO_TIPO,
    setores: SETORES,
    modoDemo: Number(banco.config('modo_demo')) === 1,
    prazoMin: processo.minutosPrazo(),
    hoje: dataLocal(agora()),
  })));

  app.get('/api/catalogo', rota(() => banco.produtos().filter((p) => p.ativo)));

  // ------------------------------------------------------------- chat
  app.post('/api/conversas', rota(() => {
    const c = bot.iniciar();
    return { id: c.id };
  }));

  app.get('/api/conversas/:id/mensagens', rota((req) => {
    if (!bot.carregar(req.params.id)) throw new ErroRegra('Conversa não encontrada.', 'nao_encontrado');
    return bot.mensagens(req.params.id, Number(req.query.depois ?? 0));
  }));

  app.post('/api/conversas/:id/entrada', rota(async (req) => {
    await bot.entrada(req.params.id, req.body ?? {});
    return { ok: true };
  }));

  app.post('/api/conversas/:id/comprovante', upload.single('arquivo'), rota((req) => {
    const c = bot.carregar(req.params.id);
    if (!c?.pedido_id) throw new ErroRegra('Esta conversa não tem pedido aguardando pagamento.');
    if (!req.file) throw new ErroRegra('Envie uma imagem (PNG/JPG) ou PDF do comprovante.');
    const url = `/uploads/${req.file.filename}`;
    processo.falar(c.id, '🧾 Comprovante enviado', { imagem: url }, 'cliente');
    processo.receberComprovante(c.pedido_id, url);
    return { ok: true, url };
  }));

  // Modo demonstração: gera um comprovante PIX de mentira (SVG) com o valor certo.
  app.post('/api/conversas/:id/comprovante-exemplo', rota((req) => {
    const c = bot.carregar(req.params.id);
    if (!c?.pedido_id) throw new ErroRegra('Esta conversa não tem pedido aguardando pagamento.');
    const p = processo.pedido(c.pedido_id);
    const valor = p.status === 'AGUARDANDO_SALDO' ? p.saldo : p.sinal;
    const nome = `${randomUUID()}.svg`;
    const quando = agora().toLocaleString('pt-BR');
    writeFileSync(path.join(pastaUploads, nome), `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
<rect width="320" height="420" rx="18" fill="#ffffff"/><rect width="320" height="90" rx="18" fill="#0f7a5a"/><rect y="70" width="320" height="20" fill="#0f7a5a"/>
<text x="24" y="42" font-family="Arial" font-size="15" fill="#d9f5ea">Comprovante de transferência</text>
<text x="24" y="70" font-family="Arial" font-size="24" font-weight="bold" fill="#fff">PIX enviado ✓</text>
<text x="24" y="130" font-family="Arial" font-size="12" fill="#777">Valor</text>
<text x="24" y="158" font-family="Arial" font-size="28" font-weight="bold" fill="#222">${dinheiro(valor)}</text>
<text x="24" y="200" font-family="Arial" font-size="12" fill="#777">Para</text><text x="24" y="220" font-family="Arial" font-size="15" fill="#222">Padaria Vitória</text>
<text x="24" y="255" font-family="Arial" font-size="12" fill="#777">De</text><text x="24" y="275" font-family="Arial" font-size="15" fill="#222">${String(p.cliente_nome).replace(/[<&>]/g, '')}</text>
<text x="24" y="310" font-family="Arial" font-size="12" fill="#777">Identificador</text><text x="24" y="330" font-family="Arial" font-size="15" fill="#222">${p.codigo}</text>
<text x="24" y="365" font-family="Arial" font-size="12" fill="#777">Data</text><text x="24" y="385" font-family="Arial" font-size="15" fill="#222">${quando}</text>
<text x="296" y="408" text-anchor="end" font-family="Arial" font-size="10" fill="#bbb">EXEMPLO — DEMONSTRAÇÃO ACADÊMICA</text></svg>`);
    const url = `/uploads/${nome}`;
    processo.falar(c.id, '🧾 Comprovante enviado', { imagem: url }, 'cliente');
    processo.receberComprovante(c.pedido_id, url);
    return { ok: true, url };
  }));

  // ------------------------------------------------------------- pedidos (painel)
  app.get('/api/pedidos', rota(() => processo.listarPedidos()));
  app.get('/api/pedidos/:id', rota((req) => processo.detalhes(req.params.id)));

  app.post('/api/pedidos/:id/validar-pagamento', rota((req) =>
    processo.validarPagamento(req.params.id, req.body?.aprovado === true)));

  app.get('/api/producao/:setor', rota((req) => {
    if (!SETORES[req.params.setor]) throw new ErroRegra('Setor inexistente.', 'nao_encontrado');
    return processo.filaSetor(req.params.setor);
  }));

  app.post('/api/tarefas/:id/status', rota((req) => processo.atualizarTarefa(req.params.id, req.body?.status)));

  app.get('/api/expedicao', rota(() => banco.todos(
    `SELECT * FROM pedidos WHERE status IN ('CONFERENCIA','AGUARDANDO_SALDO','PRONTO_ENTREGA')
      ORDER BY data_entrega, horario`).map((p) => ({ ...p, itens: processo.itensDoPedido(p.id) }))));

  app.post('/api/pedidos/:id/conferencia', rota((req) => processo.conferir(req.params.id, req.body?.itens ?? [])));
  app.post('/api/pedidos/:id/pesagem', rota((req) => processo.pesar(req.params.id, req.body?.itens ?? [])));
  app.post('/api/pedidos/:id/liberar', rota((req) => processo.liberarMercadoria(req.params.id)));

  // ------------------------------------------------------------- relatórios
  app.get('/api/relatorios', rota((req) => processo.relatorio({ de: req.query.de, ate: req.query.ate })));

  app.get('/api/relatorios.csv', (req, res) => {
    const r = processo.relatorio({ de: req.query.de, ate: req.query.ate });
    const cab = ['Código', 'Data do pedido', 'Cliente', 'Tipo', 'CNPJ', 'Entrega', 'Horário', 'Status',
      'Estimado', 'Sinal', 'Valor final', 'Saldo', 'Motivo'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
    const linhas = r.pedidos.map((p) => [
      p.codigo, dataBR(dataLocal(new Date(p.criado_em))), p.cliente_nome, ROTULO_TIPO[p.tipo],
      p.cnpj ? formatarCNPJ(p.cnpj) : '', dataBR(p.data_entrega), p.horario, ROTULO_STATUS[p.status],
      num(p.valor_estimado), num(p.sinal), num(p.valor_final), num(p.saldo), p.motivo,
    ].map(esc).join(';'));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="relatorio-padaria-${r.periodo.de}_a_${r.periodo.ate}.csv"`);
    res.send(`﻿${[cab.map(esc).join(';'), ...linhas].join('\r\n')}`);
  });

  app.post('/api/fechamento', rota(() => ({ fechados: processo.fechamento() })));

  // ------------------------------------------------------------- cadastros
  app.get('/api/produtos', rota(() => banco.produtos()));
  app.patch('/api/produtos/:id', rota((req) => {
    const { preco, ativo } = req.body ?? {};
    if (preco != null) {
      if (!(Number(preco) > 0)) throw new ErroRegra('Preço inválido.');
      banco.exec('UPDATE produtos SET preco = ? WHERE id = ?', Number(preco), Number(req.params.id));
    }
    if (ativo != null) banco.exec('UPDATE produtos SET ativo = ? WHERE id = ?', ativo ? 1 : 0, Number(req.params.id));
    notificar({ tipo: 'catalogo' });
    return banco.um('SELECT * FROM produtos WHERE id = ?', Number(req.params.id));
  }));

  app.get('/api/sazonalidade', rota(() => banco.todos('SELECT * FROM sazonalidade ORDER BY inicio')));
  app.patch('/api/sazonalidade/:id', rota((req) => {
    const dias = Number(req.body?.prazo_dias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 30) throw new ErroRegra('Prazo inválido (0 a 30 dias).');
    banco.exec('UPDATE sazonalidade SET prazo_dias = ? WHERE id = ?', dias, Number(req.params.id));
    return banco.um('SELECT * FROM sazonalidade WHERE id = ?', Number(req.params.id));
  }));

  // ------------------------------------------------------------- modo demo
  app.post('/api/demo/reiniciar', rota((req) => {
    banco.semear({ modoDemo: req.body?.modoDemo !== false });
    notificar({ tipo: 'reinicio' });
    return { ok: true };
  }));

  // Timer "Prazo de validação expirado"
  const relogio = setInterval(() => {
    try { processo.verificarPrazos(); } catch (e) { console.error(e); }
  }, 5000);
  relogio.unref();

  return { app, banco, processo, bot, parar: () => { clearInterval(relogio); for (const r of ouvintes) r.end(); banco.db.close(); } };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(process.env.PORT ?? 3000);
  const { app } = criarApp();
  app.listen(porta, () => {
    console.log(`\n  🥖 Padaria Vitória rodando em http://localhost:${porta}\n`);
    console.log(`     Chat do cliente ....... http://localhost:${porta}/chat`);
    console.log(`     Painel interno ........ http://localhost:${porta}/painel`);
    console.log(`     Processo (TO-BE) ...... http://localhost:${porta}/processo\n`);
  });
}
