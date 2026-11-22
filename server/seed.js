import { abrirBanco } from './db.js';
import { cadastrarProduto } from './regras.js';

// Recria o banco do zero (apaga as tabelas e cria de novo).
const db = abrirBanco();
db.exec('DROP TABLE IF EXISTS itens; DROP TABLE IF EXISTS pedidos; DROP TABLE IF EXISTS produtos;');
// Muda a versão do banco, para a tela descartar o que estava digitado sobre os dados antigos
const versao = db.pragma('user_version', { simple: true });
db.pragma(`user_version = ${versao + 1}`);
db.close();

const novoDb = abrirBanco();
cadastrarProduto(novoDb, { codigo: '101', descricao: 'Mouse', preco: '50,00', estoque: 10 });
cadastrarProduto(novoDb, { codigo: '102', descricao: 'Teclado', preco: '120,00', estoque: 8 });
cadastrarProduto(novoDb, { codigo: '103', descricao: 'Monitor', preco: '800,00', estoque: 5 });
novoDb.close();

console.log('Banco recriado com os produtos 101 Mouse, 102 Teclado e 103 Monitor.');
