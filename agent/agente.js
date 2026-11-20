import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import { definicoes, executarFerramenta, mensagemDoTopo, ENDERECO_SITE } from './ferramentas.js';

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
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

Como trabalhar:
1. ANTES de qualquer ação, escreva uma linha começando com "Resultado esperado:" dizendo o que deve acontecer (inclusive se for uma rejeição).
2. Use ver_tela para ler a página e descobrir as referências [ref]. Depois de navegar, chame ver_tela de novo.
3. Depois de cada ação importante, leia a mensagem no topo.
4. Antes de finalizar, confira o resultado numa tela de consulta (lista de produtos para estoque e preços, detalhe do pedido para itens e total).
5. Termine SEMPRE com a ferramenta finalizar.

Regras de honestidade:
- NUNCA diga que deu certo se apareceu uma mensagem de erro que você não esperava.
- Uma rejeição que era esperada (ex.: "Tente cancelar novamente") conta como "CONFORME O ESPERADO".
- Em resultado_observado, escreva exatamente o que a tela mostrou (mensagens, valores, estoques).`;

// Executa um comando em português usando a página do navegador. Devolve o registro da execução.
export async function executarAgente(pagina, comando) {
  const cliente = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  const registro = {
    comando,
    inicio: new Date(),
    esperado: '',
    acoes: [],
    observado: '',
    conclusao: '',
    mensagensVistas: [],
  };
  const mensagens = [{ role: 'user', content: comando }];

  try {
    for (let passo = 1; passo <= LIMITE_DE_PASSOS && !registro.conclusao; passo++) {
      const resposta = await cliente.messages.create({
        model: MODELO,
        max_tokens: 4096,
        system: INSTRUCOES,
        tools: definicoes,
        messages: mensagens,
        cache_control: { type: 'ephemeral' }, // reaproveita o histórico entre os passos (mais barato)
      });
      // Guarda a resposta inteira no histórico (inclusive blocos de raciocínio, se houver)
      mensagens.push({ role: 'assistant', content: resposta.content });

      if (resposta.stop_reason === 'refusal') {
        registro.conclusao = 'DIFERENTE DO ESPERADO: o modelo recusou a tarefa.';
        break;
      }

      // Textos do modelo: o primeiro com "Resultado esperado" vira o resultado esperado
      for (const bloco of resposta.content) {
        if (bloco.type !== 'text' || !bloco.text.trim()) continue;
        registro.acoes.push(`Agente pensou: ${bloco.text.trim()}`);
        if (!registro.esperado && bloco.text.includes('Resultado esperado')) {
          registro.esperado = bloco.text.split('Resultado esperado:')[1]?.trim() || bloco.text.trim();
        }
      }

      const chamadas = resposta.content.filter((bloco) => bloco.type === 'tool_use');
      if (chamadas.length === 0) {
        mensagens.push({ role: 'user', content: 'Continue a tarefa e termine com a ferramenta finalizar.' });
        continue;
      }

      const resultados = [];
      for (const chamada of chamadas) {
        const textoResultado = await executarUmaFerramenta(pagina, chamada, passo, registro);
        resultados.push({ type: 'tool_result', tool_use_id: chamada.id, ...textoResultado });
      }
      mensagens.push({ role: 'user', content: resultados });
    }

    if (!registro.conclusao) {
      registro.conclusao = `DIFERENTE DO ESPERADO: o agente não terminou em ${LIMITE_DE_PASSOS} passos.`;
    }
  } catch (erro) {
    registro.conclusao = 'DIFERENTE DO ESPERADO: erro na execução do agente: ' + erro.message;
  }

  if (!registro.esperado) registro.esperado = '(o agente não informou)';
  if (!registro.observado) registro.observado = '(nada registrado) ' + (await mensagemDoTopo(pagina).catch(() => ''));
  return registro;
}

// Executa uma chamada de ferramenta, anota no registro e devolve o tool_result
async function executarUmaFerramenta(pagina, chamada, passo, registro) {
  if (chamada.name === 'finalizar') {
    registro.observado = chamada.input.resultado_observado;
    registro.conclusao = chamada.input.conclusao;
    registro.acoes.push(`Passo ${passo}: finalizar`);
    return { content: 'Tarefa encerrada.' };
  }

  try {
    const texto = await executarFerramenta(pagina, chamada.name, chamada.input);
    const resumo = chamada.name === 'ver_tela' ? `tela lida (${texto.split('\n')[0]})` : texto;
    registro.acoes.push(`Passo ${passo}: ${chamada.name} ${JSON.stringify(chamada.input)} → ${resumo}`);

    // Guarda as mensagens do topo para o registro mostrar o que realmente apareceu
    const mensagem = await mensagemDoTopo(pagina);
    if (!registro.mensagensVistas.includes(mensagem) && !mensagem.startsWith('Nenhuma')) {
      registro.mensagensVistas.push(mensagem);
    }
    return { content: texto };
  } catch (erro) {
    registro.acoes.push(`Passo ${passo}: ${chamada.name} ${JSON.stringify(chamada.input)} → FALHOU: ${erro.message}`);
    return { content: 'Falha: ' + erro.message.split('\n')[0] + ' (use ver_tela para atualizar as referências)', is_error: true };
  }
}

// Salva o registro em registros/<data>_<nome>.md e devolve o nome do arquivo
export function salvarRegistro(registro, nome = 'agente') {
  fs.mkdirSync(PASTA_REGISTROS, { recursive: true });
  const data = registro.inicio.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  const arquivo = `${data}_${nome}.md`;

  const texto = [
    `# Registro do agente`,
    ``,
    `- **Data:** ${registro.inicio.toLocaleString('pt-BR')}`,
    `- **Modelo:** ${MODELO}`,
    ``,
    `## Comando`,
    registro.comando,
    ``,
    `## Resultado esperado`,
    registro.esperado,
    ``,
    `## Ações realizadas`,
    ...registro.acoes.map((acao, i) => `${i + 1}. ${acao}`),
    ``,
    `## Mensagens que apareceram no topo da tela`,
    ...(registro.mensagensVistas.length ? registro.mensagensVistas.map((m) => `- ${m}`) : ['- nenhuma']),
    ``,
    `## Resultado observado`,
    registro.observado,
    ``,
    `## Conclusão`,
    registro.conclusao,
    ``,
  ].join('\n');

  fs.writeFileSync(path.join(PASTA_REGISTROS, arquivo), texto);
  return arquivo;
}

// Abre o navegador visível, devagar, para dar para acompanhar
export async function abrirNavegador() {
  const navegador = await chromium.launch({ headless: false, slowMo: 400 });
  const pagina = await navegador.newPage();
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

  const { navegador, pagina } = await abrirNavegador();
  const registro = await executarAgente(pagina, comando);
  const arquivo = salvarRegistro(registro);
  await navegador.close();

  console.log('\nResultado observado:', registro.observado);
  console.log('Conclusão:', registro.conclusao);
  console.log('Registro salvo em registros/' + arquivo);
}

// Só roda o principal() quando o arquivo é executado direto (e não importado pelo roteiro)
if (path.resolve(process.argv[1]) === import.meta.filename) {
  principal().catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
}
