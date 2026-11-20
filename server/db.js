import Database from 'better-sqlite3';
import path from 'node:path';

// Caminho padrão do banco: server/loja.db
export const ARQUIVO_BANCO = path.join(import.meta.dirname, 'loja.db');

// Abre o banco e cria as tabelas se ainda não existirem.
// Nos testes usamos ':memory:' (banco em memória).
export function abrirBanco(arquivo = ARQUIVO_BANCO) {
  const db = new Database(arquivo);
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      codigo    TEXT PRIMARY KEY,
      descricao TEXT NOT NULL,
      preco     INTEGER NOT NULL,          -- em centavos
      estoque   INTEGER NOT NULL CHECK (estoque >= 0)
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      identificador TEXT PRIMARY KEY,
      situacao      TEXT NOT NULL,         -- RASCUNHO, CONFIRMADO ou CANCELADO
      total         INTEGER                -- em centavos, preenchido ao confirmar
    );

    CREATE TABLE IF NOT EXISTS itens (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido         TEXT NOT NULL REFERENCES pedidos(identificador),
      produto        TEXT NOT NULL REFERENCES produtos(codigo),
      quantidade     INTEGER NOT NULL,
      preco_unitario INTEGER               -- em centavos, congelado ao confirmar
    );
  `);

  return db;
}
