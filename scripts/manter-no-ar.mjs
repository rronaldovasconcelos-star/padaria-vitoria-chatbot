// Mantém o site do Render acordado enquanto esta janela estiver aberta.
// O plano grátis dorme após 15 min sem visitas; aqui "batemos na porta" a cada 4 min.
// Bônus: enquanto o site não dorme, os pedidos de exemplo também não somem.
//
// Uso:  npm run manter-no-ar            (até fechar a janela; Ctrl+C para parar)
//       npm run manter-no-ar -- 3       (para sozinho depois de 3 horas)

const URL_SITE = process.env.BASE ?? 'https://padaria-vitoria.onrender.com';
const INTERVALO_MIN = 4;
const horas = Number(process.argv[2]) || null;
const fim = horas ? Date.now() + horas * 3_600_000 : null;

const hora = () => new Date().toLocaleTimeString('pt-BR');

async function bater() {
  const inicio = Date.now();
  try {
    const r = await fetch(`${URL_SITE}/api/meta`, { signal: AbortSignal.timeout(90_000) });
    const s = ((Date.now() - inicio) / 1000).toFixed(1);
    if (r.ok) console.log(`${hora()}  ✅ site no ar (${s} s)${Number(s) > 10 ? ' — estava dormindo, acordou agora' : ''}`);
    else console.log(`${hora()}  ⚠️  o site respondeu ${r.status}`);
  } catch (e) {
    console.log(`${hora()}  ❌ sem resposta (${e.name === 'TimeoutError' ? 'demorou mais de 90 s' : e.message}). Tento de novo em ${INTERVALO_MIN} min.`);
  }
  if (fim && Date.now() >= fim) {
    console.log(`${hora()}  Fim das ${horas} h. O site volta a dormir depois de 15 min sem uso.`);
    process.exit(0);
  }
}

console.log(`Mantendo ${URL_SITE} acordado (a cada ${INTERVALO_MIN} min)${horas ? ` por ${horas} h` : ''}.`);
console.log('Deixe esta janela aberta durante a apresentação. Para parar: feche a janela ou Ctrl+C.\n');
await bater();
setInterval(bater, INTERVALO_MIN * 60_000);
