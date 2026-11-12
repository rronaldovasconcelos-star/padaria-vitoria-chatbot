# Padaria Vitória: chatbot de encomendas

Chatbot de encomendas e painel de produção da Padaria Vitória. O sistema implementa o processo **TO-BE** do diagrama `TO-BE (UM FIM POR POOL).png` (projeto acadêmico da PUC).

- **Chat do cliente** (`/chat`): pedido por botões, catálogo, PIX do sinal e do saldo, acompanhamento.
- **Painel da equipe** (`/painel`): gestão (comprovantes, pedidos, relatórios e cadastros), produção por setor e conferência com pesagem.
- **Processo** (`/processo`): o diagrama TO-BE com os passos de cada pedido destacados.

Tem custo zero e roda offline, sem conta, chave ou internet.

## Como rodar

Requer **Node.js 22.13 ou mais novo**.

```bash
npm install
npm start          # http://localhost:3000
npm test           # 23 testes (regras + fluxo completo)
npm run exemplos   # (com o servidor no ar) cria pedidos de exemplo em várias etapas
```

O banco fica em `dados/padaria.db`. O botão **Reiniciar demonstração** no painel apaga os pedidos e deixa o prazo do sinal em 2 minutos.

## Documentação

- [Proposta de implantação](docs/PROPOSTA.md): objetivo, rastreabilidade TO-BE → sistema, regras, arquitetura, telas e testes. Também em `docs/PROPOSTA.docx`.
- [Roteiro da demonstração](docs/ROTEIRO-DEMO.md)
- [Estado do projeto](ESTADO.md)

## Estrutura

```
src/motor/      regras do TO-BE (puras e testadas) e o catálogo de atividades do diagrama
src/processo.js orquestra o TO-BE (banco + motor + avisos)
src/bot/        conversa do chatbot
src/servidor.js API HTTP + tempo real (SSE)
public/         telas
test/           node:test
scripts/        popular-exemplos.mjs
```
