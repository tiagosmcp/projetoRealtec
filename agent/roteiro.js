import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { abrirNavegador, criarRegistro, executarAgente, PASTA_REGISTROS } from './agente.js';

// Os 9 cenários, em ordem. O estado do sistema continua de um para o outro.
// "estoque" é o saldo correto ao fim de cada um: o roteiro compara com o que foi lido na tela,
// para o relatório não depender só da opinião do agente.
const CENARIOS = [
  { comando: 'Cadastre o produto 104, Cabo USB, preço R$ 25,00 e estoque 6.', esperado: 'Produto 104 aparece na lista', estoque: { 101: 10, 102: 8, 103: 5, 104: 6 } },
  { comando: 'Altere o preço do produto 104 para R$ 30,00 e a descrição para Cabo USB 1 metro.', esperado: 'Produto atualizado, estoque 6', estoque: { 101: 10, 102: 8, 103: 5, 104: 6 } },
  { comando: 'Crie e confirme o pedido 001 com 2 monitores, 1 teclado e 1 mouse. Confira o total e o estoque.', esperado: 'Total R$ 1.770,00; Monitor 3, Teclado 7, Mouse 9', estoque: { 101: 9, 102: 7, 103: 3, 104: 6 } },
  { comando: 'Crie o pedido 002 em rascunho com 1 mouse; altere a quantidade para 2 e confirme.', esperado: 'Total R$ 100,00; Mouse 7', estoque: { 101: 7, 102: 7, 103: 3, 104: 6 } },
  { comando: 'Cancele o pedido 002 e consulte o estoque.', esperado: 'Pedido cancelado; Mouse 9', estoque: { 101: 9, 102: 7, 103: 3, 104: 6 } },
  { comando: 'Tente cancelar novamente o pedido 002.', esperado: 'Rejeitado com motivo; estoque igual', estoque: { 101: 9, 102: 7, 103: 3, 104: 6 } },
  { comando: 'Tente registrar e confirmar um pedido de 4 monitores.', esperado: 'Rejeitado (só 3 em estoque); estoque igual', estoque: { 101: 9, 102: 7, 103: 3, 104: 6 } },
  { comando: 'Cadastre o produto 101, Webcam HD, preço R$ 150,00 e estoque 4.', esperado: 'Rejeitado por código duplicado', estoque: { 101: 9, 102: 7, 103: 3, 104: 6 } },
  { comando: 'Crie o pedido 004 com 1 cabo USB e 1 teclado, confirme e verifique se o preço do cabo é R$ 30,00.', esperado: 'Total R$ 150,00; Cabo USB 5, Teclado 6', estoque: { 101: 9, 102: 6, 103: 3, 104: 5 } },
];

async function principal() {
  console.log('Recriando o banco com o seed...');
  execSync('npm run seed', { stdio: 'inherit' });

  const { navegador, pagina } = await abrirNavegador();
  const linhas = [];

  for (let i = 0; i < CENARIOS.length; i++) {
    const cenario = CENARIOS[i];
    const numero = String(i + 1).padStart(2, '0');
    console.log(`\nCenário ${i + 1}: ${cenario.comando}`);

    const registro = criarRegistro(cenario.comando, 'cenario-' + numero);
    await executarAgente(pagina, registro);

    const conforme = registro.conclusao.toUpperCase().startsWith('CONFORME');
    console.log(conforme ? '  -> Conforme o esperado' : '  -> DIFERENTE do esperado');
    console.log('  ' + registro.observado);

    const lido = registro.estoqueLido ?? [];
    const confere = registro.conferiuEstoque
      && Object.entries(cenario.estoque).every(([codigo, saldo]) => lido.find((p) => p.codigo === codigo)?.estoque === saldo);
    const saldos = lido.map((p) => `${p.codigo}: ${p.estoque}`).join(', ') || 'não lido';
    console.log(`  -> Estoque na tela ${confere ? 'confere' : 'NÃO CONFERE'} (${saldos})`);

    linhas.push(`| ${i + 1} | ${cenario.comando} | ${cenario.esperado} | ${limpar(registro.observado)} | ${limpar(saldos)}: ${confere ? 'confere' : '**não confere**'} | ${conforme ? 'Conforme' : '**Diferente**'} | ${registro.arquivo} |`);

    if (registro.erroNaApi) {
      console.log('\nErro na API do Gemini. Roteiro interrompido:\n' + registro.conclusao);
      break;
    }
  }

  await navegador.close();

  const relatorio = [
    '# Relatório do roteiro',
    '',
    `Executado em ${new Date().toLocaleString('pt-BR')}.`,
    '',
    '| # | Comando | Esperado (roteiro) | Observado pelo agente | Estoque lido na tela | Conclusão do agente | Registro |',
    '|---|---|---|---|---|---|---|',
    ...linhas,
    '',
  ].join('\n');
  // Uma cópia com data guarda o histórico; RELATORIO.md é sempre o da última execução
  const data = new Date().toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  fs.writeFileSync(path.join(PASTA_REGISTROS, `${data}_RELATORIO.md`), relatorio);
  fs.writeFileSync(path.join(PASTA_REGISTROS, 'RELATORIO.md'), relatorio);
  console.log('\nRelatório salvo em registros/RELATORIO.md');
}

// Tira quebras de linha e "|" para não quebrar a tabela em Markdown
function limpar(texto) {
  return texto.replace(/\s*\n\s*/g, ' ').replaceAll('|', '/');
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
