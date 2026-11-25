# Estoque e Pedidos com agente de IA

Sistema web de produtos, pedidos e estoque, com um agente de IA que recebe instruções em português e opera o sistema **pela tela**, como uma pessoa.

**Vídeo de demonstração:** https://drive.google.com/file/d/1cDLlkjcjNXY5s7LPaKsy7dnAO2JnW7wf/view?usp=sharing

## Pré-requisitos

- Node **22 ou mais novo**
- Chave gratuita do Google AI Studio: https://aistudio.google.com/apikey

## Instalação e configuração

```
npm install
npx playwright install chromium
```

Copie `.env.example` para `.env` e coloque a sua chave:

```
GEMINI_API_KEY=sua-chave-aqui
GEMINI_MODEL=gemini-3.5-flash-lite
```

## Como executar

```
npm run seed      # apaga os dados e cadastra Mouse, Teclado e Monitor
npm run dev       # sobe o sistema em http://localhost:5173
```

**Agente pela tela:** abra a aba **Agente**, digite a instrução (ex.: `Cadastre o produto 104, Cabo USB, preço R$ 25,00 e estoque 6.`) e clique em **Executar agente**. Um navegador abre e o agente trabalha nele. As ações aparecem na aba enquanto ele trabalha.

**Pelo terminal**, com o `npm run dev` rodando em outro terminal:

| Comando | O que faz |
|---|---|
| `npm run agente -- "instrução"` | Executa uma instrução |
| `npm run roteiro` | Roda o seed e executa os 9 cenários em ordem |
| `npm test` | Testa as regras de negócio |

## Como o agente funciona

O Gemini recebe a instrução e decide, passo a passo, qual ferramenta usar: `ver_tela`, `navegar`, `clicar`, `preencher`, `selecionar` e `finalizar`. O Playwright executa cada ação no navegador.

O agente nunca acessa o banco nem a API do sistema. Antes de agir, ele declara o resultado esperado. No fim, confere a tela de consulta e grava um registro em `registros/`.

Travas no código impedem que ele:
- conclua sem conferir o estoque;
- invente o código de um produto;
- diga que fez uma operação que não tentou.

## Registros

- [registros/RELATORIO.md](registros/RELATORIO.md): os 7 cenários obrigatórios e os 2 adicionais (8, inválido, e 9), com o resultado esperado, o observado e a conclusão. **Todos passaram**, e o estoque lido na tela confere em cada um.
- Os arquivos `registros/*_cenario-NN.md` trazem cada ação feita na tela.

## Falhas encontradas

| Falha | Correção | Registro |
|---|---|---|
| Com instrução incompleta, o agente inventou código, preço e estoque | Conclui "NÃO EXECUTADO" e diz o que falta | [falhas/…17-56-38](registros/falhas/2026-11-22_17-56-38_agente.md) |
| Com o produto já cadastrado, o agente disse que cadastrou sem clicar em nada | Tenta a operação e relata a rejeição do sistema | [falhas/…01-50-23](registros/falhas/2026-11-25_01-50-23_agente.md) |
| O limite de requisições por minuto do plano gratuito interrompeu um cenário | Esperas maiores entre tentativas | [falhas/…02-11-37](registros/falhas/2026-11-25_02-11-37_cenario-09.md) |

Outras falhas foram corrigidas durante o desenvolvimento: preço `1.770` lido como R$ 1,77, duplo clique duplicando itens, edição de produto desfazendo preço, lista de pedidos sem itens. Os registros de todas as execuções estão no histórico do git.

## Observações

- No plano gratuito, o `gemini-3.5-flash-lite` aceita cerca de 500 requisições por dia, e um roteiro usa uns 60. Se a cota acabar, troque `GEMINI_MODEL` por `gemini-3.1-flash-lite`.
- O `better-sqlite3` está na versão 12, porque a 13 travava no Windows com Node 22.
- "Conforme" ou "Diferente" é a conclusão da IA. Por isso o roteiro também confere o estoque lido na tela.
