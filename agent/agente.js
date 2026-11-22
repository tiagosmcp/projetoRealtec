import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { chromium } from 'playwright';
import { definicoes, executarFerramenta, lerEstoque, mensagemDoTopo, ENDERECO_SITE } from './ferramentas.js';

// Gemini no plano gratuito do Google AI Studio
const MODELO = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const LIMITE_DE_PASSOS = 40;
export const PASTA_REGISTROS = path.join(import.meta.dirname, '..', 'registros');

const INSTRUCOES = `Você é um agente de testes que usa um sistema web de produtos e pedidos COMO UMA PESSOA: só pela tela, com as ferramentas disponíveis.

Páginas: /produtos (lista, cadastro, edição e ajuste de estoque), /pedidos (lista e novo pedido) e /pedidos/<identificador> (detalhe do pedido, itens, confirmar e cancelar).

Regras do sistema (use para prever o resultado esperado):
- Código de produto é único. Preço é digitado como 25,00. Estoque nunca fica negativo.
- Pedido começa em RASCUNHO. Em rascunho dá para adicionar, alterar quantidade e remover itens, e o estoque não muda.
- Confirmar: se faltar estoque em qualquer item, o pedido inteiro é rejeitado e nada muda. Se der certo, salva o preço atual, calcula o total e baixa o estoque.
- Só pedidos CONFIRMADOS podem ser cancelados. Cancelar devolve o estoque uma vez; cancelar de novo é rejeitado.
- Mudar o preço de um produto não altera pedidos já confirmados.
- Se o comando não informar o identificador do pedido, use o identificador sugerido na tela de novo pedido.

NUNCA INVENTE DADOS. Antes de agir, confira se o comando traz o que a operação precisa:
- Cadastrar produto: código, descrição (o nome do produto serve), preço e estoque. Não crie código, preço nem estoque por conta própria, e não copie de outro produto. Estoque não informado NÃO é zero.
- Editar produto: qual produto e o novo valor do que vai mudar.
- Ajustar estoque: qual produto e quanto somar, retirar ou qual deve ser o saldo final. "estoque para 2" é um comando completo: 2 é o saldo final, e você calcula a diferença pelo estoque da tela para digitar no campo de somar.
- Criar pedido com itens, ou adicionar item: o produto e a quantidade de cada um. "um mouse" é quantidade 1. "monitores", sem número, é quantidade não informada.
- Alterar, confirmar ou cancelar pedido: qual pedido. Não escolha um por conta própria, mesmo que só exista um.
- Ao CADASTRAR, o código é sempre obrigatório: o nome não substitui o código.
- Fora do cadastro, o nome basta para identificar um produto que já existe, sem código, no singular ou plural: "um monitor" é o Monitor da lista. Só há dúvida se a lista tiver mais de um produto com esse nome (ex.: dois "Mouse"). Aí não escolha: peça o código.
- Pedido novo não precisa de identificador no comando: use o sugerido na tela.
Se faltar ou houver dúvida em qualquer um desses dados, NÃO preencha nem clique em nada e não faça parte da tarefa. Escreva "Resultado esperado: não executar, falta ...", abra /produtos e finalize com a conclusão começando com "NÃO EXECUTADO:", dizendo exatamente o que o usuário precisa informar. Nesse caso nunca use "CONFORME O ESPERADO".

Como trabalhar:
1. ANTES de alterar qualquer dado, escreva uma linha começando com "Resultado esperado:" com o resultado FINAL da tarefa. Para prever, aplique as regras acima aos dados que aparecem na tela (estoque atual, códigos e pedidos que já existem). Se uma regra vai rejeitar a operação, o resultado esperado é a rejeição. Se o comando for só de consulta, escreva essa linha já na primeira resposta, dizendo o que a consulta deve mostrar. Sem essa linha, preencher, selecionar, clicar e finalizar são recusados.
2. navegar e clicar já devolvem a tela nova com as referências [ref]. Use ver_tela só se precisar ler a tela de novo.
3. ECONOMIZE PASSOS: na mesma resposta, peça várias ferramentas em sequência (ex.: preencher todos os campos de um formulário, selecionar e depois clicar no botão). Elas rodam na ordem. Depois de um clicar ou navegar o lote termina, porque a tela muda; o que vier depois no mesmo lote NÃO é executado.
4. Depois de cada clique, leia a mensagem no topo da tela devolvida.
5. Antes de finalizar, confira itens, situação e total no detalhe do pedido (se houver pedido) e, POR ÚLTIMO, abra /produtos para conferir o estoque. Faça isso também quando a operação for rejeitada: finalizar é recusado sem essa conferência.
6. Termine SEMPRE com a ferramenta finalizar.

Faça SOMENTE o que o comando pede:
- NUNCA faça operações extras para contornar uma rejeição (ex.: ajustar estoque, editar produto, usar outro código ou outro pedido).
- Se o sistema rejeitar uma operação, não tente de novo: confira a tela de consulta e finalize relatando a rejeição.

Regras de honestidade:
- NUNCA diga que deu certo se apareceu uma mensagem de erro que você não esperava.
- A conclusão compara o resultado observado com o SEU resultado esperado (não com o pedido do usuário). Se você previu uma rejeição e ela aconteceu com o motivo certo, é "CONFORME O ESPERADO".
- Em resultado_observado, escreva exatamente o que a tela mostrou: a mensagem, os valores e SEMPRE o estoque final dos produtos envolvidos, lido em /produtos.`;

// Cria o registro e já salva, para ele aparecer na aba Agente desde o começo
export function criarRegistro(comando, nome = 'agente') {
  const inicio = new Date();
  const data = inicio.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  const registro = {
    arquivo: `${data}_${nome}.md`,
    comando,
    inicio,
    requisicoes: 0,
    esperado: '',
    acoes: [],
    conferiuEstoque: false,
    estoqueLido: null,
    observado: '',
    conclusao: '',
  };
  salvarRegistro(registro);
  return registro;
}

// Executa o comando do registro usando a página do navegador e vai salvando cada ação.
export async function executarAgente(pagina, registro) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Configure a GEMINI_API_KEY no arquivo .env (veja o README).');
  }

  const chat = criarChat();
  let mensagem = registro.comando; // o que será enviado ao modelo no próximo passo

  try {
    for (let passo = 1; passo <= LIMITE_DE_PASSOS && !registro.conclusao; passo++) {
      if (pagina.isClosed()) throw new Error('o navegador foi fechado');

      // O ciclo do agente: pergunta, anota, age e devolve o resultado na próxima pergunta
      const resposta = await perguntarParaIA(chat, mensagem, registro);
      anotarTextos(resposta, registro);
      mensagem = await executarAcoes(pagina, resposta.functionCalls ?? [], passo, registro);
    }

    if (!registro.conclusao) {
      registro.conclusao = `DIFERENTE DO ESPERADO: o agente não terminou em ${LIMITE_DE_PASSOS} passos.`;
    }
  } catch (erro) {
    registro.conclusao = 'DIFERENTE DO ESPERADO: erro na execução do agente: ' + erro.message;
  }

  if (!registro.esperado) registro.esperado = '(o agente não informou)';
  if (!registro.observado) registro.observado = '(nada registrado) ' + (await mensagemDoTopo(pagina).catch(() => ''));
  salvarRegistro(registro);
}

function criarChat() {
  // Espera até 1 minuto por resposta. Em erro temporário (429, 503), o SDK tenta de novo.
  const ia = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 60000, retryOptions: { attempts: 5 } },
  });

  // O chat guarda o histórico da conversa sozinho
  return ia.chats.create({
    model: MODELO,
    config: {
      systemInstruction: INSTRUCOES,
      tools: [{ functionDeclarations: definicoes }],
    },
  });
}

// 1. Envia a mensagem (o comando ou os resultados das ações) e devolve a resposta da IA
async function perguntarParaIA(chat, mensagem, registro) {
  try {
    const resposta = await chat.sendMessage({ message: mensagem });
    registro.requisicoes++;
    return resposta;
  } catch (erro) {
    registro.erroNaApi = true; // chave inválida, cota, servidor fora: o roteiro para
    throw erro;
  }
}

// 2. Anota o que a IA escreveu. O primeiro "Resultado esperado" vira o resultado esperado
function anotarTextos(resposta, registro) {
  const partes = resposta.candidates?.[0]?.content?.parts ?? [];
  for (const parte of partes) {
    if (!parte.text?.trim() || parte.thought) continue;
    registro.acoes.push(`Agente pensou: ${parte.text.trim()}`);
    if (!registro.esperado && parte.text.includes('Resultado esperado')) {
      registro.esperado = parte.text.split('Resultado esperado:')[1]?.trim() || parte.text.trim();
    }
  }
  salvarRegistro(registro);
}

// 3. Executa as ações pedidas, na ordem, e devolve a próxima mensagem para a IA
async function executarAcoes(pagina, chamadas, passo, registro) {
  if (chamadas.length === 0) return 'Continue a tarefa e termine com a ferramenta finalizar.';

  const resultados = [];
  let loteEncerrado = false;
  for (const chamada of chamadas) {
    // Depois de clicar, navegar, ver_tela ou de uma falha, a IA precisa ler o resultado antes de continuar
    let resultado = 'Não executada: a tela mudou antes desta ação. Use as referências da tela nova.';
    if (!loteEncerrado) {
      resultado = await executarUmaFerramenta(pagina, chamada, passo, registro);
      loteEncerrado = ['clicar', 'navegar', 'ver_tela', 'finalizar'].includes(chamada.name)
        || resultado.startsWith('Falha') || resultado.startsWith('Recusado');
      salvarRegistro(registro);
    }
    resultados.push({ functionResponse: { id: chamada.id, name: chamada.name, response: { resultado } } });
  }
  return resultados;
}

// Executa uma chamada de ferramenta, anota no registro e devolve o texto do resultado
async function executarUmaFerramenta(pagina, chamada, passo, registro) {
  const entrada = semAcentoNosNomes(chamada.args ?? {});

  // Nada de agir nem de concluir sem ter dito antes o que era esperado
  if (!registro.esperado && !['ver_tela', 'navegar'].includes(chamada.name)) {
    registro.acoes.push(`Passo ${passo}: ${chamada.name} recusado (falta o resultado esperado)`);
    return 'Recusado: escreva um texto começando com "Resultado esperado:" e, na mesma resposta, repita a ação.';
  }

  if (chamada.name === 'finalizar') {
    // Não aceita conclusão sem o estoque ter sido lido depois do último clique
    if (!registro.conferiuEstoque) {
      registro.acoes.push(`Passo ${passo}: finalizar recusado (falta conferir o estoque)`);
      return 'Recusado: abra /produtos, confira o estoque e só então chame finalizar.';
    }
    registro.observado = entrada.resultado_observado;
    // Sempre encerra: sem isso, uma conclusão vazia repetia até o limite de passos
    registro.conclusao = entrada.conclusao || 'DIFERENTE DO ESPERADO: o agente finalizou sem informar a conclusão.';
    registro.acoes.push(`Passo ${passo}: finalizar`);
    return 'Tarefa encerrada.';
  }

  // Um clique pode alterar dados, então a conferência anterior deixa de valer
  if (chamada.name === 'clicar') registro.conferiuEstoque = false;

  try {
    const texto = await executarFerramenta(pagina, chamada.name, entrada, registro.comando);
    // Para o registro, um resumo curto: a primeira linha do resultado e a mensagem do topo
    const mensagem = await mensagemDoTopo(pagina);
    const resumo = chamada.name === 'preencher' || chamada.name === 'selecionar' ? texto : `${texto.split('\n')[0]} ${mensagem}`;
    registro.acoes.push(`Passo ${passo}: ${chamada.name} ${JSON.stringify(entrada)} → ${resumo}`);

    if (['ver_tela', 'navegar', 'clicar'].includes(chamada.name)) {
      const estoque = await lerEstoque(pagina);
      if (estoque) {
        registro.estoqueLido = estoque;
        registro.conferiuEstoque = true;
      }
    }
    return texto;
  } catch (erro) {
    registro.acoes.push(`Passo ${passo}: ${chamada.name} ${JSON.stringify(entrada)} → FALHOU: ${erro.message}`);
    return 'Falha: ' + erro.message.split('\n')[0] + ' (use ver_tela para atualizar as referências)';
  }
}

// O modelo às vezes acentua o nome do parâmetro: "opção" vira "opcao", "conclusão" vira "conclusao"
function semAcentoNosNomes(args) {
  return Object.fromEntries(
    Object.entries(args).map(([nome, valor]) => [nome.normalize('NFD').replace(/\p{M}/gu, ''), valor])
  );
}

// Grava o registro em registros/. É chamada a cada ação, para dar para acompanhar ao vivo.
function salvarRegistro(registro) {
  fs.mkdirSync(PASTA_REGISTROS, { recursive: true });
  const estoque = registro.estoqueLido?.map((p) => `- ${p.codigo} ${p.descricao}: ${p.estoque}`);

  const texto = [
    `# Registro do agente`,
    ``,
    `- **Data:** ${registro.inicio.toLocaleString('pt-BR')}`,
    `- **Modelo:** ${MODELO}`,
    `- **Requisições à IA:** ${registro.requisicoes}`,
    ``,
    `## Comando`,
    registro.comando,
    ``,
    `## Resultado esperado`,
    registro.esperado || 'Aguardando o agente...',
    ``,
    `## Ações realizadas`,
    ...registro.acoes.map((acao, i) => `${i + 1}. ${acao}`),
    ``,
    `## Última leitura do estoque na tela`,
    ...(estoque ?? ['- ainda não lido']),
    ``,
    `## Resultado observado`,
    registro.observado || 'Aguardando o agente...',
    ``,
    `## Conclusão`,
    registro.conclusao || 'Em andamento...',
    ``,
  ].join('\n');

  fs.writeFileSync(path.join(PASTA_REGISTROS, registro.arquivo), texto);
}

// Abre o navegador visível, devagar, para dar para acompanhar
export async function abrirNavegador() {
  const navegador = await chromium.launch({ headless: false, slowMo: 400 });
  const pagina = await navegador.newPage();
  pagina.setDefaultTimeout(10000); // uma referência errada falha em 10 s em vez de 30 s
  try {
    await pagina.goto(ENDERECO_SITE);
  } catch {
    await navegador.close();
    throw new Error(`Não consegui abrir ${ENDERECO_SITE}. Rode "npm run dev" em outro terminal.`);
  }
  return { navegador, pagina };
}

// Uso: npm run agente -- "Cadastre o produto 104, ..."
async function principal() {
  const comando = process.argv.slice(2).join(' ').trim();
  if (!comando) {
    console.log('Uso: npm run agente -- "comando em português"');
    process.exit(1);
  }

  const registro = criarRegistro(comando);
  let navegador;
  try {
    const aberto = await abrirNavegador();
    navegador = aberto.navegador;
    await executarAgente(aberto.pagina, registro);
  } catch (erro) {
    // Falhou antes de começar (sem chave, sem navegador): o motivo também vai para a tela
    registro.conclusao = 'DIFERENTE DO ESPERADO: o agente não conseguiu iniciar: ' + erro.message;
    registro.observado = 'Nenhuma ação foi executada.';
    salvarRegistro(registro);
  } finally {
    await navegador?.close();
  }

  console.log('\nResultado observado:', registro.observado);
  console.log('Conclusão:', registro.conclusao);
  console.log('Registro salvo em registros/' + registro.arquivo);
}

// Só roda o principal() quando o arquivo é executado direto (e não importado pelo roteiro)
if (path.resolve(process.argv[1]) === import.meta.filename) {
  principal().catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
}
