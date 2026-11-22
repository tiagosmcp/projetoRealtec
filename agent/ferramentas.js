// Ferramentas que a IA (Gemini) pode usar. Todas agem SÓ pela tela, com Playwright.
// O agente não acessa o banco, não chama a API e não importa nada do server/.

export const ENDERECO_SITE = 'http://localhost:5173';

// Únicas páginas que o agente pode abrir. Assim ele não acessa /api, outros sites nem a aba Agente.
const PAGINAS_PERMITIDAS = /^\/(produtos|pedidos|pedidos\/[\p{L}\d_-]+)$/u;

// Descrição das ferramentas no formato que a API do Gemini espera
export const definicoes = [
  {
    name: 'ver_tela',
    description: 'Lê a tela atual: URL, mensagem do topo, textos, tabelas e elementos interativos (campos, selects, botões e links), cada um com um número de referência [ref].',
  },
  {
    name: 'navegar',
    description: 'Abre uma página do sistema pelo caminho e devolve a tela nova. Ex.: "/produtos", "/pedidos" ou "/pedidos/001".',
    parametersJsonSchema: {
      type: 'object',
      properties: { caminho: { type: 'string' } },
      required: ['caminho'],
    },
  },
  {
    name: 'clicar',
    description: 'Clica no botão ou link com a referência informada e devolve a tela nova (com novas referências).',
    parametersJsonSchema: {
      type: 'object',
      properties: { ref: { type: 'integer' } },
      required: ['ref'],
    },
  },
  {
    name: 'preencher',
    description: 'Apaga o conteúdo do campo com a referência informada e digita o valor.',
    parametersJsonSchema: {
      type: 'object',
      properties: { ref: { type: 'integer' }, valor: { type: 'string' } },
      required: ['ref', 'valor'],
    },
  },
  {
    name: 'selecionar',
    description: 'Escolhe uma opção de um select pelo texto da opção. Ex.: "103 - Monitor".',
    parametersJsonSchema: {
      type: 'object',
      properties: { ref: { type: 'integer' }, opcao: { type: 'string' } },
      required: ['ref', 'opcao'],
    },
  },
  {
    name: 'finalizar',
    description: 'Encerra a tarefa. Use só depois de conferir o resultado na tela de consulta.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        resultado_observado: { type: 'string', description: 'O que apareceu de fato na tela, com valores e mensagens.' },
        conclusao: { type: 'string', description: 'Começa com "CONFORME O ESPERADO" ou "DIFERENTE DO ESPERADO", seguido da explicação.' },
      },
      required: ['resultado_observado', 'conclusao'],
    },
  },
];

// Executa uma ferramenta e devolve um texto para a IA ler
export async function executarFerramenta(pagina, nome, entrada) {
  if (nome === 'ver_tela') {
    return await lerTela(pagina);
  }

  if (nome === 'navegar') {
    if (!PAGINAS_PERMITIDAS.test(entrada.caminho)) {
      throw new Error('Caminho não permitido. Use /produtos, /pedidos ou /pedidos/<identificador>.');
    }
    await pagina.goto(ENDERECO_SITE + entrada.caminho);
    // Já devolve a tela nova, para a IA não precisar pedir ver_tela (economiza requisições)
    return `Página ${entrada.caminho} aberta.\n` + (await lerTela(pagina));
  }

  if (nome === 'clicar') {
    await elemento(pagina, entrada.ref).click();
    return 'Clique feito. Tela depois do clique:\n' + (await lerTela(pagina));
  }

  if (nome === 'preencher') {
    if (entrada.valor === undefined) throw new Error('Informe o parâmetro "valor".');
    await elemento(pagina, entrada.ref).fill(String(entrada.valor));
    return `Campo [${entrada.ref}] preenchido com "${entrada.valor}".`;
  }

  if (nome === 'selecionar') {
    // O modelo às vezes manda "opção" com acento no nome do parâmetro
    const pedida = String(entrada.opcao ?? entrada['opção'] ?? '').trim();
    if (!pedida) throw new Error('Informe o parâmetro "opcao".');
    const select = elemento(pagina, entrada.ref);
    // Procura a opção cujo texto contém o que a IA pediu (ex.: "Monitor" acha "103 - Monitor")
    const opcoes = await select.locator('option').allInnerTexts();
    const opcao = opcoes.find((texto) => texto.trim() === pedida)
      || opcoes.find((texto) => texto.toLowerCase().includes(pedida.toLowerCase()));
    if (!opcao) {
      throw new Error(`Opção "${pedida}" não encontrada. Opções: ${opcoes.join('; ')}`);
    }
    await select.selectOption({ label: opcao });
    return `Opção "${opcao}" selecionada no select [${entrada.ref}].`;
  }

  throw new Error(`Ferramenta desconhecida: ${nome}`);
}

// Localiza o elemento marcado pela última chamada de ver_tela
function elemento(pagina, ref) {
  // Number() garante que a IA só consiga apontar para uma referência numérica
  return pagina.locator(`[data-ref="${Number(ref)}"]`);
}

// Espera a página carregar e o React buscar os dados
async function esperarTela(pagina) {
  await pagina.waitForLoadState('networkidle');
  await pagina.waitForTimeout(300);
}

export async function mensagemDoTopo(pagina) {
  const mensagem = pagina.locator('.mensagem');
  if ((await mensagem.count()) === 0) return 'Nenhuma mensagem no topo.';
  return 'Mensagem no topo: ' + (await mensagem.first().innerText());
}

// Se a tela aberta for a de produtos, lê o estoque da tabela. Nas outras, devolve null.
export async function lerEstoque(pagina) {
  if (new URL(pagina.url()).pathname !== '/produtos') return null;
  const linhas = await pagina.locator('main table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({
      codigo: tr.cells[0].innerText.trim(),
      descricao: tr.cells[1].innerText.trim(),
      estoque: Number(tr.cells[3].innerText),
    }))
  );
  return linhas.length > 0 ? linhas : null;
}

// Monta o texto da tela. Roda dentro do navegador (page.evaluate).
async function lerTela(pagina) {
  await esperarTela(pagina);
  return await pagina.evaluate(() => {
    const linhas = [];
    linhas.push('URL: ' + location.pathname);

    const mensagem = document.querySelector('.mensagem');
    linhas.push('Mensagem no topo: ' + (mensagem ? mensagem.innerText : 'nenhuma'));

    const titulo = document.querySelector('main h2');
    if (titulo) linhas.push('Título: ' + titulo.innerText);

    // Parágrafos de texto (ex.: situação e total do pedido)
    for (const p of document.querySelectorAll('main p')) {
      linhas.push('Texto: ' + p.innerText);
    }

    // Tabelas, linha por linha (só células sem botões/campos)
    document.querySelectorAll('main table').forEach((tabela, i) => {
      linhas.push(`Tabela ${i + 1}:`);
      for (const tr of tabela.querySelectorAll('tr')) {
        const celulas = [...tr.cells]
          .filter((c) => !c.querySelector('input, button, select'))
          .map((c) => c.innerText.trim());
        linhas.push('  ' + celulas.join(' | '));
      }
    });

    // Elementos interativos com número de referência
    linhas.push('Elementos interativos:');
    let numero = 0;
    // A aba Agente fica de fora, para o agente não dar comandos para ele mesmo
    const seletor = 'nav a:not([href="/agente"]), main a, main input, main select, main button';
    for (const el of document.querySelectorAll(seletor)) {
      numero++;
      el.setAttribute('data-ref', numero);
      const contexto = descreverContexto(el);

      if (el.tagName === 'A') {
        linhas.push(`  [${numero}] link "${el.innerText}"`);
      } else if (el.tagName === 'BUTTON') {
        linhas.push(`  [${numero}] botão "${el.innerText}"${contexto}`);
      } else if (el.tagName === 'SELECT') {
        const opcoes = [...el.options].map((o) => o.text).join('; ');
        const escolhida = el.options[el.selectedIndex]?.text;
        linhas.push(`  [${numero}] select "${rotulo(el)}"${contexto} selecionado="${escolhida}" opções: ${opcoes}`);
      } else {
        linhas.push(`  [${numero}] campo "${rotulo(el)}"${contexto} valor="${el.value}"`);
      }
    }
    return linhas.join('\n');

    // Texto do <label> que envolve o campo (sem o texto das opções do select)
    function rotulo(el) {
      const label = el.closest('label');
      if (!label) return '';
      return [...label.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('')
        .trim();
    }

    // Diz em qual formulário ou linha de tabela o elemento está
    function descreverContexto(el) {
      const linha = el.closest('tr');
      if (linha) return ` (na linha do item: ${linha.cells[0].innerText})`;
      const titulo = el.closest('form')?.querySelector('h3');
      if (titulo) return ` (formulário: ${titulo.innerText})`;
      return '';
    }
  });
}
