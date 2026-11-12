# ESTADO: Padaria Vitória (chatbot TO-BE, PUC)

_Atualizado em 12/11/2026_

## O que é

Trabalho da PUC: chatbot de encomendas de uma padaria que segue o processo **TO-BE** do diagrama `TO-BE (UM FIM POR POOL).png` (Bizagi, 5 raias: Cliente, Sistema, Gestão, Produção, Conferência/Expedição). É uma demonstração para a aula, com custo zero.

## Situação

**Pronto para apresentar e NO AR: https://padaria-vitoria.onrender.com** (Render grátis, desde 12/11/2026).

- Chat web (`/chat`) por botões, com catálogo, PIX do sinal e do saldo (QR BR Code offline) e acompanhamento.
- Painel (`/painel`) com Gestão (comprovantes com prazo, quadro, relatórios com CSV/PDF, fechamento do dia, cadastros), Padeiro, Confeiteiro, Salgadeira e Conferência (checklist, item pendente, pesagem, liberação).
- Processo (`/processo`): o PNG do TO-BE com os passos de cada pedido destacados (coordenadas em `src/motor/atividades.js`).
- 23 testes verdes (`npm test`) e teste de mutação feito: 6 guardas desligadas uma por vez, todas ficaram vermelhas.
- Documentação: `docs/PROPOSTA.md`, `.docx` e `.pdf`, `docs/ROTEIRO-DEMO.md` e prints em `docs/prints/`.

## Decisões

- Stack: Node 24 + Express + `node:sqlite` + SSE + HTML/CSS/JS puro, sem build. As fontes (Young Serif e Atkinson Hyperlegible) ficam em `public/fonts` para funcionar offline.
- Sem IA: menus e botões, tudo determinístico. As regras vivem em `src/motor/`; o bot só coleta os dados.
- Visual "azulejo de padaria" (anil `#22408c` + casca `#b9771f`).
- O PIX é simulado e a gestão valida o comprovante manualmente, como no TO-BE. Escola e empresa são faturadas, sem sinal.
- O saldo do avulso é recebido no balcão pela Expedição ("Receber o saldo e entregar"), conforme a raia Cliente "Pagar saldo final e retirar pedido".
- Modo demonstração: "Reiniciar demonstração" deixa o prazo do sinal em 2 min; o padrão é 30 min.
- CNPJs de exemplo válidos: 11.222.333/0001-81 (Colégio Monte Azul) e 11.444.777/0001-61 (Construtora Horizonte).

## Pendências

- O Ronaldo precisa conferir a proposta e o roteiro e ensaiar a demonstração.
- Opcional: login por perfil no painel; conferência lembrar os itens já marcados quando um pendente volta.

## Hospedagem

- Render (plano free), Blueprint `padaria-vitoria` (`render.yaml`), serviço `srv-dbr2kj8n74is73d5g9bg`. O login do Render é a conta Google do Ronaldo; o GitHub ligado a esse Render é a OUTRA conta (`franciscoronaldodev`), por isso o repositório ficou **público** (não tem segredo).
- O push na main publicou sozinho no teste de 12/11. Se não publicar, clicar em "Manual Deploy" no painel do Render.
- O serviço dorme após 15 min: abrir o link ~1 min antes da apresentação. Os pedidos zeram a cada reinício; use `BASE=https://padaria-vitoria.onrender.com npm run exemplos` para repovoar.
- Fuso: `TZ=America/Sao_Paulo` (o servidor do Render roda em UTC).

- No dia da apresentação: abrir `Manter site no ar.bat` e deixar aberto, depois rodar `Gerar pedido de demonstracao.bat` (pedido completo pelo TO-BE inteiro).

## Como retomar

`npm install && npm start`, depois `npm test`. Use `npm run exemplos` para popular pedidos de exemplo com o servidor no ar.
