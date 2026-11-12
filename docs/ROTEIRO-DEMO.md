# Roteiro da demonstração (6 a 8 minutos)

## Antes de começar (site no ar: https://padaria-vitoria.onrender.com)

**Uns 30 minutos antes da aula:** dê dois cliques em **`Manter site no ar.bat`** (na pasta do projeto) e deixe a janela aberta até o fim da apresentação. Ela acorda o site e não deixa ele dormir; enquanto ela estiver aberta, os pedidos também não somem. Na janela deve aparecer "✅ site no ar".

**Pedido de demonstração pronto:** com a janela acima aberta, dê dois cliques em **`Gerar pedido de demonstracao.bat`**. Ele cria um pedido que passa por TODAS as etapas do TO-BE e mostra no fim o link do diagrama (/processo). Útil se não der tempo de fazer o pedido ao vivo.

Para apresentar pelo site, use os endereços /chat, /painel e /processo dele no lugar de localhost. Para apresentar no seu computador, siga os passos abaixo.


1. Abra um terminal na pasta do projeto e rode `npm start`.
2. No navegador, abra `http://localhost:3000` e, a partir dele, abra três abas:
   **Chat do cliente**, **Painel da equipe** e **Processo no diagrama**.
   Se der, coloque o chat e o painel lado a lado.
3. No painel, clique em **Reiniciar demonstração**. Isso apaga os pedidos e deixa o prazo do sinal em **2 minutos**.
4. No chat, clique em **Nova conversa**.

> Plano B: se algo travar, rode `npm run exemplos` em outro terminal. Ele cria quatro pedidos prontos em etapas diferentes (escola em produção, empresa pronta para entrega, avulso esperando a gestão e um bloqueado).

## Cena 1: pedido avulso completo (3 min)

| Passo | Onde | O que fazer | O que mostrar (atividade do TO-BE) |
|---|---|---|---|
| 1 | Chat | Fazer um pedido → Para mim (avulso) → nome → telefone | Acessa o chatbot; seleciona e informa o tipo |
| 2 | Chat | Abrir o catálogo: 20 pães franceses, 1 bolo de chocolate, 25 brigadeiros → Usar estes itens | Catálogo web |
| 3 | Chat | Escolher uma data e um horário → **Confirmar pedido** | Confirma o pedido; o sistema classifica, valida e aplica a sazonalidade |
| 4 | Chat | Mostrar o PIX de 50% e o tempo correndo → **Usar comprovante de exemplo** | Cobrança do sinal; paga e envia o comprovante |
| 5 | Painel › Gestão | O comprovante chega sozinho → **Validar pagamento** | Notifica a gestão; confere e valida; libera o pedido |
| 6 | Painel › Padeiro e Confeiteiro | Começar a produzir → Marcar como pronto em cada setor | Fila por setor e ordem de saída; "todos prontos" |
| 7 | Painel › Conferência | Deixar o brigadeiro **sem marcar** → Concluir conferência | Completo? Não: o item volta como **pendente** |
| 8 | Painel › Confeiteiro | A comanda volta com a etiqueta vermelha → produzir | Produzir item pendente |
| 9 | Painel › Conferência | Marcar tudo → digitar os pesos em kg (ex.: 1.08, 1.62 e 0.5) → Lançar pesos | Pesa e lança o peso; calcula o valor pelo peso |
| 10 | Chat | O PIX do **saldo** aparece (valor final − sinal) | Pedido avulso? Sim: cobrança do saldo |
| 11 | Painel › Conferência | Receber o saldo e entregar | Paga o saldo e retira o pedido |
| 12 | Processo | Escolher o pedido | O caminho todo pintado no diagrama |

## Cena 2: escola sem sinal (1 min)

1. Chat › Nova conversa › Fazer um pedido › **Para uma empresa** (de propósito).
2. Nome qualquer, telefone, CNPJ **11.222.333/0001-81** (Colégio Monte Azul, já cadastrado).
3. Escolha a data de **amanhã**.
4. Mostre que o sistema **classificou como escola** pelo cadastro, **ajustou a data** (escola precisa de 2 dias) e mandou **direto para a produção, sem sinal**.

## Cena 3: bloqueio (30 s)

Faça um pedido avulso com **Ovo de Páscoa** (catálogo › Bolos e doces). O sistema bloqueia e explica: produto sazonal, só de 01/03 a 30/04.
Outra opção: repita exatamente o mesmo pedido da cena 1 enquanto ele estiver aberto, e o sistema bloqueia por **duplicidade**.

## Cena 4: cancelamento por prazo (2 min, rode em paralelo)

Faça um pedido avulso e **não envie** o comprovante. Depois de 2 minutos, o chat recebe o aviso de cancelamento ("sinal não pago") e o pedido vai para "Bloqueados e cancelados". Dá para iniciar essa cena no começo da apresentação e voltar a ela no fim.

## Fechamento (30 s)

Painel › Gestão › **Relatórios**: mostre o recebido (sinais e saldos), o valor a faturar das escolas e empresas, a produção por produto e as ocorrências. Clique em **Exportar CSV** e depois em **Fechar o dia**, que encerra os pedidos entregues.
