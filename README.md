# Estoque e Pedidos com agente de IA

Teste técnico: um sistema web de produtos, pedidos e estoque, com um agente de IA que recebe instruções em português e opera o sistema **pela tela**, como uma pessoa.

**Vídeo:** LINK_DO_VIDEO

## Tecnologias

- **Servidor:** Node, Express e SQLite (better-sqlite3)
- **Tela:** React, Vite, react-router-dom e um único arquivo CSS
- **Agente:** Playwright (navegador visível) e Gemini (`@google/genai`), no plano gratuito

## Pré-requisitos

- Node **22 ou mais novo** (exigência do `@google/genai`)
- Uma chave gratuita do Google AI Studio: https://aistudio.google.com/apikey
- Um computador com interface gráfica, porque o navegador do agente abre visível

## Instalação

```
npm install
npx playwright install chromium
```

Copie `.env.example` para `.env` (no PowerShell: `Copy-Item .env.example .env`) e coloque a sua chave:

```
GEMINI_API_KEY=sua-chave-aqui
GEMINI_MODEL=gemini-3.5-flash-lite
```

## Como rodar

```
npm run seed
npm run dev
```

Abra http://localhost:5173. O `seed` **apaga os dados** e recria Mouse, Teclado e Monitor.

### Usar o agente pela tela

1. Abra a aba **Agente**.
2. Digite a instrução, por exemplo: `Cadastre o produto Cabo USB, código 104, preço R$ 25,00 e estoque 6`.
3. Clique em **Executar agente**.

Um navegador abre e o agente trabalha nele. As ações aparecem na aba Agente durante a execução (atualiza a cada 2 segundos).

### Usar pelo terminal

Com o `npm run dev` rodando em outro terminal:

| Comando | O que faz |
|---|---|
| `npm run agente -- "instrução"` | Executa uma instrução |
| `npm run roteiro` | **Roda o seed** e executa os 9 cenários em ordem, no mesmo navegador |
| `npm test` | Testes das regras de negócio (não precisa de chave nem do servidor) |

## Estrutura

```
server/
  db.js            cria as tabelas
  regras.js        todas as regras de negócio
  index.js         rotas do Express
  seed.js          recria o banco
  regras.test.js   testes
web/src/
  App.jsx            menu, rotas e mensagem do topo
  Produtos.jsx       lista, cadastro, edição e ajuste de estoque
  Pedidos.jsx        lista e novo pedido
  PedidoDetalhe.jsx  itens, confirmar e cancelar
  Agente.jsx         campo de instrução e registros
  util.js            fetch e formatação de dinheiro
  estilo.css         todo o visual (cores no começo do arquivo)
agent/
  agente.js        conversa com a IA e grava o registro
  ferramentas.js   o que a IA consegue fazer na tela
  roteiro.js       os 9 cenários
registros/         um .md por execução e os relatórios
```

## Como o agente funciona

```
Aba Agente -> POST /api/agente -> processo agent/agente.js -> Gemini escolhe a ação
                                                                  |
              registros/*.md <- resultado <- Playwright age na tela
```

1. A rota só dá a partida no processo, um por vez. Ela não executa nenhuma operação de negócio.
2. A IA recebe a instrução e seis ferramentas: `ver_tela`, `navegar`, `clicar`, `preencher`, `selecionar` e `finalizar`.
3. `ver_tela` transforma a página em texto e numera campos, botões e links. A IA escolhe pelo número, sem sequência fixa de cliques.
4. O resultado de cada ação volta para a IA, que decide a próxima, até `finalizar` (limite de 40 passos).

Travas que estão no código, e não só no prompt:

- `navegar` só abre `/produtos`, `/pedidos` e `/pedidos/<identificador>`. Não abre `/api`, outros sites nem a aba Agente.
- O código de um produto novo só é preenchido se estiver escrito na instrução do usuário.
- Se a instrução pede uma operação (cadastrar, criar, confirmar, cancelar, alterar...) e nenhum botão clicado nesta execução mostrou sucesso ou erro, o agente não pode concluir "CONFORME". O que já estava na tela antes não conta como trabalho dele.
- Sem declarar o resultado esperado, o agente não preenche, não clica e não finaliza.
- Sem ler o estoque na tela depois do último clique, o agente não finaliza.
- O agente não importa nada de `server/`, não acessa o banco e não chama a API do sistema.

## Regras de negócio

- Código de produto e identificador de pedido são únicos, sem diferenciar maiúsculas de minúsculas.
- A consulta de pedidos mostra itens, situação e total de cada um. Em rascunho, o total é o previsto pelos preços atuais.
- Limites: preço até R$ 1.000.000,00, e quantidade e estoque até 1.000.000.
- Quantidade é inteira e maior que zero. O estoque nunca fica negativo.
- Em rascunho, os itens podem mudar e o estoque não é alterado.
- Confirmar soma as quantidades por produto, confere tudo, congela os preços, calcula o total e baixa o estoque em uma transação. Se algo falha, nada muda.
- Pedido confirmado não tem itens editados.
- Só pedido confirmado pode ser cancelado, e o estoque volta uma única vez.
- Mudar o preço de um produto não altera pedidos confirmados.
- Dinheiro é salvo em centavos.

## Decisões

- **Gemini:** o projeto precisava rodar sem custo. O `gemini-3.5-flash-lite` aguentou o roteiro completo no plano gratuito. No `gemini-3.6-flash` o limite encontrado foi de 20 requisições por dia. No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele.
- **better-sqlite3 12:** a versão 13.2.0 travou (segfault) no Windows com Node 22.
- **Códigos 101, 102 e 103:** o enunciado não dá códigos aos produtos iniciais.
- **Identificador do pedido:** é digitado, e a tela sugere o próximo livre.
- **Ajuste de estoque:** informa-se quanto somar, ou um número negativo para retirar.
- **Remover item:** só em rascunho. Produtos e pedidos nunca são excluídos.
- **Instrução incompleta:** o agente não inventa. Conclui "NÃO EXECUTADO" e diz o que falta (ex.: "cadastre um GABINETE" precisa de código, preço e estoque).
- **Algo digitado e não salvo:** o pedido não é confirmado, e a tela avisa.
- **Clique repetido:** cliques em botão com menos de meio segundo de intervalo são ignorados, e um envio idêntico ainda em andamento não é repetido.
- **Cancelar pedido já cancelado:** o botão continua visível para a rejeição aparecer com o motivo.
- **Preço:** aceita `25,00`, `25.00`, `1.770` e `1.770,00`.
- **Ações em lote:** a IA pode preencher vários campos e clicar numa resposta só, para gastar menos cota.
- **Campos digitados:** ficam no `sessionStorage` ao trocar de tela ou recarregar. São limpos quando o envio dá certo, a aba é fechada ou o seed é executado (percebido ao trocar de tela ou apertar F5). Continuam se o envio for rejeitado.
- **Edição de produto:** envia só o que foi digitado, para não desfazer uma mudança feita nesse meio-tempo.
- **Só local:** não há login, e o servidor escuta apenas em `127.0.0.1`.

## Cenários e resultados

Todas as execuções abaixo rodaram numa cópia do projeto com banco próprio (o mesmo código, só com outras portas).

- **Versão final, 24/11/2026 às 23:09:** [relatório](registros/2026-11-25_02-12-15_RELATORIO.md). Os cenários 1 a 8 passaram. O 9 fez a operação, mas parou no **limite por minuto** do plano gratuito (15 requisições). As esperas entre tentativas foram aumentadas, e o cenário 9 foi [executado de novo](registros/2026-11-25_02-13-56_agente.md), a partir do mesmo estado, e passou.
- **Último roteiro inteiro sem interrupção, 23/11/2026 às 22:33:** [registros/RELATORIO.md](registros/RELATORIO.md). Os 9 cenários passaram, com a versão anterior à trava de operação não feita.
- **Execução anterior, 22/11/2026 às 15:48:** [relatório](registros/2026-11-22_18-54-22_RELATORIO.md). Os cenários 1 a 8 passaram. O 9 fez a operação, mas foi **interrompido pela cota diária gratuita (500 requisições)** antes de conferir. Ele foi [executado de novo sozinho](registros/2026-11-22_18-55-39_agente.md), a partir do mesmo estado e com o `gemini-3.1-flash-lite`, e passou.

O relatório compara o estoque lido na tela com o saldo correto, além de mostrar a conclusão do agente.

| # | Cenário | Esperado | Observado |
|---|---|---|---|
| 1 | Cadastrar produto 104 | Aparece na lista | R$ 25,00, estoque 6 |
| 2 | Editar produto 104 | Novo preço e descrição | Cabo USB 1 metro, R$ 30,00, estoque 6 |
| 3 | Criar e confirmar 001 | R$ 1.770,00 | R$ 1.770,00; Monitor 3, Teclado 7, Mouse 9 |
| 4 | Alterar rascunho 002 e confirmar | R$ 100,00 | R$ 100,00; Mouse 7 |
| 5 | Cancelar 002 | Estoque devolvido | Cancelado; Mouse 9 |
| 6 | Cancelar 002 de novo | Rejeitado | "Pedido 002 já está cancelado"; Mouse 9 |
| 7 | Pedido de 4 monitores | Rejeitado | "solicitado 4, disponível 3"; Monitor 3 |
| 8 | **Extra, inválido:** código 101 repetido | Rejeitado | "Já existe um produto com o código 101" |
| 9 | **Extra:** pedido 004 com preço editado | Cabo a R$ 30,00 | R$ 150,00; Cabo 5, Teclado 6 |

Os registros de 22/11 às 14:16 e 14:57 são testes livres feitos pela aba Agente, como "altere o preço do teclado para 155 e o estoque para 2".

Também foi testada pela aba Agente a instrução "Altere o preço do produto 999 para R$ 10,00". O agente registrou que o produto não existe e concluiu "DIFERENTE DO ESPERADO", sem alterar nada ([registro](registros/2026-11-22_17-11-59_agente.md)).

## Falhas encontradas durante o desenvolvimento

| Data | Falha | Correção | Evidência |
|---|---|---|---|
| 20/11 | API da Anthropic recusou por falta de crédito | Troca para o Gemini gratuito | Relato (1) |
| 20/11 | `gemini-3.8-flash` sobrecarregado (503/504) | Troca de modelo | [registro](registros/2026-11-20_19-04-12_cenario-01.md) |
| 20/11 | Cota de 20 requisições do `gemini-3.6-flash` acabou no cenário 3 | Ações em lote e outro modelo | Relato (1) |
| 20/11 | No cenário 7 o agente **contornou a rejeição**: somou 2 ao estoque, confirmou o pedido e concluiu "conforme" | Prompt proíbe operações extras | Relato (1) |
| 20/11 | No cenário 8 previu a rejeição, mas concluiu "diferente" | Conclusão compara com a própria previsão | Relato (1) |
| 20/11 | Cenários 4, 6, 7 e 9 finalizaram sem informar o estoque final | Conferência obrigatória no código | [relatório](registros/2026-11-20_19-19-13_RELATORIO.md) |
| 20/11 | Um roteiro interrompido continuou em segundo plano e sobrescreveu o relatório | Relatórios agora também são salvos com data | [relatório](registros/2026-11-20_19-24-43_RELATORIO.md) |
| 22/11 | `1.770` era lido como R$ 1,77; `0,001` e estoque vazio eram aceitos | Validação e testes | `server/regras.test.js` |
| 22/11 | Agente concluiu sem declarar o resultado esperado | Declaração obrigatória no código | [registro](registros/2026-11-22_17-04-26_agente.md) |
| 22/11 | Modelo enviou `opção` em vez de `opcao` e a seleção falhou 3 vezes no cenário 7 | Os nomes dos parâmetros são lidos sem acento | [registro](registros/2026-11-22_17-09-59_cenario-07.md) |
| 22/11 | Edição de produto guardava o preço antigo e desfazia mudança feita pelo agente | Envia só o que foi digitado | `server/regras.test.js` |
| 22/11 | Texto digitado sobrevivia ao seed e aparecia em outro item | O seed muda a versão do banco e a tela descarta o texto | Relato (2) |
| 22/11 | `conclusão` com acento fazia o agente gastar os 40 passos | Nomes sem acento, e finalizar sempre encerra | Relato (2) |
| 22/11 | Pedido inexistente ficava em "Carregando" | Mostra o motivo | Relato (2) |
| 22/11 | Servidor desligado mostrava erro técnico em inglês | Mensagem em português | Relato (2) |
| 22/11 | Agente inventou código, preço e estoque ("adicione um produto chamado GABINETE") | Regra de dados obrigatórios e trava do código | [antes](registros/2026-11-22_17-56-38_agente.md), [depois](registros/2026-11-22_18-47-12_agente.md) |
| 22/11 | Com a primeira correção, recusava "um monitor", que é válido | Nome único basta | [registro](registros/2026-11-22_18-30-48_agente.md) |
| 22/11 | Só com o prompt, voltou a inventar código | Trava no código | [registro](registros/2026-11-22_18-32-01_agente.md) |
| 22/11 | Recusava "estoque para 2", que é válido | Saldo final é um comando completo | [registro](registros/2026-11-22_18-36-40_agente.md) |
| 22/11 | Lista de pedidos sem itens e sem total de rascunho | Coluna de itens e total previsto | `server/regras.test.js` |
| 22/11 | Códigos "abc" e "ABC" conviviam, e números enormes eram gravados corrompidos | Comparação sem maiúsculas e limites | `server/regras.test.js` |
| 22/11 | Duplo clique adicionava em dobro, e confirmar ignorava quantidade digitada e não salva | Clique repetido ignorado e aviso antes de confirmar | Relato (2) |
| 22/11 | Erro de estoque não dizia qual dos dois produtos "Mouse" | Mensagem inclui o código | Relato (2) |
| 24/11 | Com o produto 104 já cadastrado, o agente viu ele na lista, **não clicou em nada e disse que tinha cadastrado** | Prompt manda tentar e relatar a rejeição; trava impede "CONFORME" sem operação feita | [antes](registros/2026-11-25_01-50-23_agente.md) |
| 24/11 | Só com o prompt, ainda dizia em metade das vezes que o pedido 001 "já estava criado", sem tentar | Exemplo explícito e a trava acima. Depois disso, 18 de 18 corretos | Relato (2) |
| 24/11 | Limite por minuto interrompeu o cenário 9 | Esperas de 5 a 60 segundos entre tentativas | [registro](registros/2026-11-25_02-11-37_cenario-09.md) |
| 22/11 | Cota diária do modelo acabou no cenário 9 | Cenário repetido com outro modelo gratuito | [registro](registros/2026-11-22_18-52-36_cenario-09.md) |

(2) Reproduzidas numa cópia de teste, durante a revisão de código, e testadas de novo depois da correção.

(1) Os arquivos dessas execuções foram apagados durante o desenvolvimento, antes de serem commitados. As linhas são um relato do que apareceu nelas, e não registros originais.

## Limitações

- "Conforme" ou "Diferente" é a opinião da IA. Por isso o roteiro também compara o estoque lido na tela. Totais e mensagens devem ser conferidos no registro.
- A proibição de contornar rejeições está no prompt, sem trava no código. Um modelo pode desobedecer.
- A trava de "operação não feita" decide pelo verbo da instrução. Consultas como "confira" e "pedidos confirmados" não contam como operação, mas uma frase muito diferente pode ser classificada errado.
- Não inventar preço, estoque e quantidade depende do prompt. A trava no código cobre só o código do produto.
- A IA não é determinística: o número de passos varia. Um roteiro gasta cerca de 60 requisições, e o plano gratuito do `gemini-3.5-flash-lite` permite 500 por dia. Se acabar, troque `GEMINI_MODEL` no `.env` por `gemini-3.1-flash-lite`.
- A trava de "um agente por vez" vale para a aba Agente. Não rode o roteiro junto com ela.
- Se o processo do agente for encerrado à força, o registro fica como "Em andamento".
- Os nomes dos arquivos de registro usam horário UTC. A data dentro do arquivo é a local.
