import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { abrirBanco } from './db.js';
import * as regras from './regras.js';

const db = abrirBanco();
const app = express();
app.use(express.json());

// Muda a cada seed
app.get('/api/versao-do-banco', (req, res) => {
  res.json({ versao: db.pragma('user_version', { simple: true }) });
});

// ---------- Produtos ----------
app.get('/api/produtos', (req, res) => {
  res.json(regras.listarProdutos(db));
});

app.post('/api/produtos', (req, res) => {
  res.json(regras.cadastrarProduto(db, req.body));
});

app.put('/api/produtos/:codigo', (req, res) => {
  res.json(regras.editarProduto(db, req.params.codigo, req.body));
});

app.post('/api/produtos/:codigo/estoque', (req, res) => {
  res.json(regras.ajustarEstoque(db, req.params.codigo, req.body.quantidade));
});

// ---------- Pedidos ----------
app.get('/api/pedidos', (req, res) => {
  res.json(regras.listarPedidos(db));
});

app.get('/api/pedidos/proximo-identificador', (req, res) => {
  res.json({ identificador: regras.sugerirIdentificador(db) });
});

app.post('/api/pedidos', (req, res) => {
  res.json(regras.criarPedido(db, req.body.identificador));
});

app.get('/api/pedidos/:id', (req, res) => {
  res.json(regras.buscarPedido(db, req.params.id));
});

app.post('/api/pedidos/:id/itens', (req, res) => {
  res.json(regras.adicionarItem(db, req.params.id, req.body.produto, req.body.quantidade));
});

app.put('/api/pedidos/:id/itens/:itemId', (req, res) => {
  res.json(regras.alterarQuantidade(db, req.params.id, req.params.itemId, req.body.quantidade));
});

app.delete('/api/pedidos/:id/itens/:itemId', (req, res) => {
  res.json(regras.removerItem(db, req.params.id, req.params.itemId));
});

app.post('/api/pedidos/:id/confirmar', (req, res) => {
  res.json(regras.confirmarPedido(db, req.params.id));
});

app.post('/api/pedidos/:id/cancelar', (req, res) => {
  res.json(regras.cancelarPedido(db, req.params.id));
});

// ---------- Iniciar o agente pela tela ----------
// Esta rota só dá a partida. O agente roda em outro processo e opera pelo navegador.
let processoDoAgente = null;

app.get('/api/agente', (req, res) => {
  res.json({ executando: processoDoAgente !== null });
});

app.post('/api/agente', (req, res) => {
  // Só aceita JSON vindo deste computador, para outro site não conseguir comandar o agente
  if (!req.is('application/json') || !['localhost', '127.0.0.1'].includes(req.hostname)) {
    throw new Error('O agente só pode ser iniciado pela tela do sistema');
  }
  const comando = String(req.body?.comando ?? '').trim();
  if (!comando) throw new Error('Digite uma instrução para o agente');
  if (processoDoAgente) throw new Error('O agente já está executando uma instrução. Aguarde terminar');

  const raiz = path.join(import.meta.dirname, '..');
  // Sem shell: o texto digitado é só um argumento e nunca vira comando do sistema
  processoDoAgente = spawn(process.execPath, [path.join(raiz, 'agent', 'agente.js'), comando], {
    cwd: raiz,
    stdio: 'inherit',
  });
  processoDoAgente.on('error', (erro) => {
    console.error('Erro ao iniciar o agente:', erro.message);
    processoDoAgente = null;
  });
  processoDoAgente.on('exit', () => {
    processoDoAgente = null;
  });
  res.json({ executando: true });
});

// ---------- Registros do agente (só leitura dos arquivos .md) ----------
app.get('/api/registros', (req, res) => {
  const pasta = path.join(import.meta.dirname, '..', 'registros');
  if (!fs.existsSync(pasta)) return res.json([]);

  const registros = fs.readdirSync(pasta)
    .filter((nome) => nome.endsWith('.md'))
    .sort()
    .reverse() // mais recentes primeiro
    .map((nome) => ({ nome, conteudo: fs.readFileSync(path.join(pasta, nome), 'utf8') }));
  res.json(registros);
});

// Qualquer erro lançado pelas regras vira { erro: "mensagem" }
app.use((erro, req, res, next) => {
  res.status(400).json({ erro: erro.message });
});

// 127.0.0.1: o servidor não fica visível para outras máquinas da rede
app.listen(3001, '127.0.0.1', () => {
  console.log('Servidor rodando em http://127.0.0.1:3001');
});
