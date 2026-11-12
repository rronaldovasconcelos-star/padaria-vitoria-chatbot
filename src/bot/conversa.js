// Chatbot por menus e botões: máquina de estados da conversa.
// O bot só COLETA os dados; quem decide (valida, cobra, libera) é o motor, via processo.criarPedido.
import { randomUUID } from 'node:crypto';
import { ROTULO_TIPO } from '../motor/classificar.js';
import { ROTULO_STATUS } from '../motor/estados.js';
import { calcularEstimado, calcularSinal, precisaSinal } from '../motor/cobranca.js';
import { consolidarItens } from '../motor/validar.js';
import { dataLocal, somaDias, dataBR, dinheiro, soDigitos } from '../motor/util.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HORARIOS = ['07:00', '08:00', '10:00', '12:00', '15:00', '17:00'];

const MENU = [
  { rotulo: '🛒 Fazer um pedido', valor: 'pedido' },
  { rotulo: '📦 Acompanhar meu pedido', valor: 'acompanhar' },
  { rotulo: '🕒 Horários e endereço', valor: 'info' },
];

export function criarBot({ banco, processo, agora = () => new Date() }) {
  const { um, exec, todos } = banco;

  const carregar = (id) => {
    const c = um('SELECT * FROM conversas WHERE id = ?', id);
    if (!c) return null;
    return { ...c, dados: JSON.parse(c.dados) };
  };
  const salvar = (c) => exec('UPDATE conversas SET estado = ?, dados = ?, pedido_id = ? WHERE id = ?',
    c.estado, JSON.stringify(c.dados), c.pedido_id ?? null, c.id);
  const falar = (c, texto, extra) => processo.falar(c.id, texto, extra);

  function iniciar() {
    const id = randomUUID();
    exec('INSERT INTO conversas (id, estado, dados, criada_em) VALUES (?,?,?,?)', id, 'menu', '{}', agora().toISOString());
    const c = carregar(id);
    falar(c, 'Olá! 👋 Eu sou a Vitória, a assistente virtual da Padaria Vitória.\nAqui você encomenda pães, bolos, doces e salgados — para você, para sua escola ou para sua empresa.', { botoes: MENU });
    return c;
  }

  function mensagens(id, depoisDe = 0) {
    return todos('SELECT * FROM mensagens WHERE conversa_id = ? AND id > ? ORDER BY id', id, depoisDe)
      .map((m) => ({ ...m, extra: m.extra ? JSON.parse(m.extra) : null }));
  }

  // ----------------------------------------------------------------- perguntas
  const perguntar = {
    menu: (c) => falar(c, 'Como posso ajudar?', { botoes: MENU }),
    tipo: (c) => falar(c, 'Para quem é a encomenda?', {
      botoes: [
        { rotulo: '🙋 Para mim (avulso)', valor: 'individual' },
        { rotulo: '🏫 Para uma escola', valor: 'escola' },
        { rotulo: '🏢 Para uma empresa', valor: 'empresa' },
      ],
    }),
    nome: (c) => falar(c, c.dados.tipo === 'individual'
      ? 'Qual é o seu nome?'
      : `Qual é o nome da ${c.dados.tipo}?`, { campo: 'texto', dica: c.dados.tipo === 'individual' ? 'Seu nome' : 'Nome da instituição' }),
    telefone: (c) => falar(c, 'Qual telefone (com DDD) para falarmos com você?', { campo: 'tel', dica: '(31) 99999-9999' }),
    cnpj: (c) => falar(c, `Informe o CNPJ da ${c.dados.tipo}, por favor.`, { campo: 'texto', dica: '00.000.000/0000-00' }),
    itens: (c) => falar(c, 'Agora escolha os produtos no nosso catálogo 👇', {
      botoes: [{ rotulo: '📖 Abrir o catálogo', valor: 'catalogo', acao: 'catalogo' }],
    }),
    data: (c) => {
      const hoje = dataLocal(agora());
      const botoes = [];
      for (let i = 1; i <= 6; i += 1) {
        const d = somaDias(hoje, i);
        const [a, m, dd] = d.split('-').map(Number);
        botoes.push({ rotulo: `${DIAS[new Date(a, m - 1, dd).getDay()]}, ${dataBR(d).slice(0, 5)}`, valor: d });
      }
      falar(c, 'Para qual dia é a entrega? Você também pode digitar a data (dd/mm).', { botoes, campo: 'texto', dica: 'dd/mm' });
    },
    horario: (c) => falar(c, c.dados.tipo === 'individual'
      ? 'Que horas você quer retirar na loja?'
      : 'Qual é o horário de saída do motorista para a entrega?', {
      botoes: HORARIOS.map((h) => ({ rotulo: h, valor: h })), campo: 'texto', dica: 'hh:mm',
    }),
    confirmar: (c) => {
      const produtos = banco.produtos();
      const estimado = calcularEstimado(c.dados.itens, produtos);
      const linhas = c.dados.itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId);
        return { icone: p?.icone, nome: p?.nome ?? `#${i.produtoId}`, qtd: i.qtd };
      });
      const avulso = precisaSinal(c.dados.tipo);
      falar(c, 'Confira o resumo do seu pedido:', {
        resumo: {
          cliente: c.dados.nome,
          tipo: ROTULO_TIPO[c.dados.tipo],
          cnpj: c.dados.cnpj ?? null,
          data: dataBR(c.dados.dataEntrega),
          horario: c.dados.horario,
          linhas,
          estimado,
          sinal: avulso ? calcularSinal(estimado) : null,
          observacao: avulso
            ? 'Produtos vendidos a quilo têm o valor final calculado na pesagem. O sinal de 50% é cobrado agora e o saldo, na retirada.'
            : 'Pedido faturado (sem sinal). O valor final é calculado na pesagem.',
        },
        botoes: [
          { rotulo: '✅ Confirmar pedido', valor: 'confirmar' },
          { rotulo: '✏️ Alterar itens', valor: 'catalogo', acao: 'catalogo' },
          { rotulo: '✖️ Cancelar', valor: 'cancelar' },
        ],
      });
    },
  };

  function irPara(c, estado) {
    c.estado = estado;
    salvar(c);
    perguntar[estado](c);
  }

  function acompanhar(c) {
    const p = c.pedido_id ? processo.pedido(c.pedido_id) : null;
    if (!p) {
      falar(c, 'Você ainda não tem pedido nesta conversa.', { botoes: MENU });
      return;
    }
    const det = processo.detalhes(p.id);
    falar(c, `📦 Pedido ${p.codigo}: ${ROTULO_STATUS[p.status]}`, {
      status: {
        codigo: p.codigo,
        tipo: p.tipo,
        status: p.status,
        rotulo: ROTULO_STATUS[p.status],
        data: dataBR(p.data_entrega),
        horario: p.horario,
        tarefas: det.tarefas.map((t) => ({ setor: t.setor, status: t.status })),
        valorFinal: p.valor_final,
        saldo: p.saldo,
        motivo: p.motivo,
      },
      botoes: MENU.filter((b) => b.valor !== 'acompanhar'),
    });
  }

  // ----------------------------------------------------------------- entrada
  async function entrada(id, e) {
    const c = carregar(id);
    if (!c) throw new Error('Conversa não encontrada.');

    // Registra o que o cliente "disse"
    if (e.tipo === 'botao') processo.falar(c.id, e.rotulo ?? e.valor, null, 'cliente');
    if (e.tipo === 'texto') processo.falar(c.id, e.texto, null, 'cliente');

    const valor = e.tipo === 'botao' ? e.valor : null;
    const texto = e.tipo === 'texto' ? String(e.texto ?? '').trim() : '';

    // Comandos globais
    if (valor === 'menu' || /^(oi|ol[aá]|menu|in[ií]cio|bom dia|boa tarde|boa noite)\b/i.test(texto)) return irPara(c, 'menu');
    if (valor === 'acompanhar') return acompanhar(c);
    if (valor === 'info') {
      falar(c, '🕒 Abrimos de segunda a sábado, das 6h às 20h, e domingo das 7h às 13h.\n📍 Rua das Flores, 120 — Centro.\nEncomendas pelo chat com pelo menos 1 dia de antecedência (2 dias para escolas e empresas).', { botoes: MENU });
      return;
    }
    if (valor === 'pedido') {
      c.dados = {};
      return irPara(c, 'tipo');
    }
    if (valor === 'cancelar' && c.estado !== 'menu') {
      c.dados = {};
      falar(c, 'Tudo bem, cancelei este rascunho. Nada foi cobrado.');
      return irPara(c, 'menu');
    }

    switch (c.estado) {
      case 'tipo':
        if (!['individual', 'escola', 'empresa'].includes(valor)) return perguntar.tipo(c);
        c.dados.tipo = valor;
        return irPara(c, 'nome');

      case 'nome':
        if (texto.length < 2) return perguntar.nome(c);
        c.dados.nome = texto.slice(0, 80);
        return irPara(c, 'telefone');

      case 'telefone': {
        const d = soDigitos(texto);
        if (d.length < 10 || d.length > 11) {
          falar(c, 'Hmm, esse telefone não parece certo. Envie com DDD, por exemplo (31) 99999-9999.');
          return perguntar.telefone(c);
        }
        c.dados.telefone = d;
        return irPara(c, c.dados.tipo === 'individual' ? 'itens' : 'cnpj');
      }

      case 'cnpj': {
        const d = soDigitos(texto);
        if (d.length !== 14) {
          falar(c, 'O CNPJ tem 14 números. Pode enviar de novo?');
          return perguntar.cnpj(c);
        }
        c.dados.cnpj = d;
        return irPara(c, 'itens');
      }

      case 'itens':
      case 'confirmar':
        if (e.tipo === 'carrinho') {
          const itens = consolidarItens(e.itens ?? []).filter((i) => i.qtd > 0);
          if (itens.length === 0) {
            falar(c, 'Seu carrinho está vazio. Escolha pelo menos um produto 🙂');
            return perguntar.itens(c);
          }
          const produtos = banco.produtos();
          const lista = itens.map((i) => {
            const p = produtos.find((x) => x.id === i.produtoId);
            return `${p?.icone ?? '•'} ${i.qtd}× ${p?.nome ?? `#${i.produtoId}`}`;
          }).join('\n');
          processo.falar(c.id, `🛒 Meu carrinho:\n${lista}`, null, 'cliente');
          c.dados.itens = itens;
          if (c.estado === 'confirmar' && c.dados.dataEntrega) return irPara(c, 'confirmar');
          return irPara(c, 'data');
        }
        if (valor === 'confirmar' && c.estado === 'confirmar') {
          c.estado = 'processando';
          salvar(c);
          const pedido = await processo.criarPedido(c.id, c.dados);
          c.pedido_id = pedido.id;
          c.estado = 'acompanhando';
          c.dados = { tipo: c.dados.tipo, nome: c.dados.nome, telefone: c.dados.telefone, cnpj: c.dados.cnpj };
          salvar(c);
          return;
        }
        return c.estado === 'itens' ? perguntar.itens(c) : perguntar.confirmar(c);

      case 'data': {
        let d = null;
        if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) d = valor;
        const m = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (m) {
          const hoje = dataLocal(agora());
          let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(hoje.slice(0, 4));
          let cand = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          if (!m[3] && cand < hoje) { ano += 1; cand = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
          const [a, mm, dd] = cand.split('-').map(Number);
          const dt = new Date(a, mm - 1, dd);
          if (dt.getMonth() === mm - 1 && dt.getDate() === dd) d = cand;
        }
        if (!d) {
          falar(c, 'Não entendi a data. Escolha um dos botões ou digite no formato dd/mm.');
          return perguntar.data(c);
        }
        c.dados.dataEntrega = d;
        return irPara(c, 'horario');
      }

      case 'horario': {
        const h = valor ?? texto;
        const m = String(h).match(/^(\d{1,2})(?::|h)?(\d{2})?$/);
        if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) {
          falar(c, 'Não entendi o horário. Escolha um botão ou digite no formato hh:mm.');
          return perguntar.horario(c);
        }
        c.dados.horario = `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`;
        return irPara(c, 'confirmar');
      }

      case 'acompanhando':
        if (e.tipo === 'texto') falar(c, 'Para falar sobre o pedido, use os botões abaixo 🙂', { botoes: MENU });
        return;

      default:
        if (e.tipo === 'texto') falar(c, 'Desculpe, eu funciono pelos botões 🙂', { botoes: MENU });
    }
  }

  return { iniciar, entrada, mensagens, carregar };
}
