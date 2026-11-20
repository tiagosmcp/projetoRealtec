import { describe, it, expect, beforeEach } from 'vitest';
import { abrirBanco } from './db.js';
import * as regras from './regras.js';

let db;

// Antes de cada teste: banco novo em memória com os produtos do seed
beforeEach(() => {
  db = abrirBanco(':memory:');
  regras.cadastrarProduto(db, { codigo: '101', descricao: 'Mouse', preco: '50,00', estoque: 10 });
  regras.cadastrarProduto(db, { codigo: '102', descricao: 'Teclado', preco: '120,00', estoque: 8 });
  regras.cadastrarProduto(db, { codigo: '103', descricao: 'Monitor', preco: '800,00', estoque: 5 });
});

function estoque(codigo) {
  return regras.buscarProduto(db, codigo).estoque;
}

describe('regras', () => {
  it('confirma o pedido do exemplo com total de R$ 1.770,00 e baixa o estoque', () => {
    regras.criarPedido(db, '001');
    regras.adicionarItem(db, '001', '103', 2);
    regras.adicionarItem(db, '001', '102', 1);
    regras.adicionarItem(db, '001', '101', 1);

    const pedido = regras.confirmarPedido(db, '001');

    expect(pedido.situacao).toBe('CONFIRMADO');
    expect(pedido.total).toBe(177000);
    expect(estoque('103')).toBe(3);
    expect(estoque('102')).toBe(7);
    expect(estoque('101')).toBe(9);
  });

  it('rejeita estoque insuficiente sem alterar nada', () => {
    regras.criarPedido(db, '001');
    regras.adicionarItem(db, '001', '101', 1);
    regras.adicionarItem(db, '001', '103', 4);
    regras.adicionarItem(db, '001', '103', 2); // mesmo produto de novo: soma 6

    expect(() => regras.confirmarPedido(db, '001'))
      .toThrow('Estoque insuficiente para Monitor: solicitado 6, disponível 5');

    expect(regras.buscarPedido(db, '001').situacao).toBe('RASCUNHO');
    expect(estoque('101')).toBe(10);
    expect(estoque('103')).toBe(5);
  });

  it('cancela uma vez só e devolve o estoque uma única vez', () => {
    regras.criarPedido(db, '002');
    regras.adicionarItem(db, '002', '101', 2);
    regras.confirmarPedido(db, '002');
    expect(estoque('101')).toBe(8);

    regras.cancelarPedido(db, '002');
    expect(estoque('101')).toBe(10);

    expect(() => regras.cancelarPedido(db, '002')).toThrow('Pedido 002 já está cancelado');
    expect(estoque('101')).toBe(10);
  });

  it('rejeita código de produto duplicado', () => {
    expect(() => regras.cadastrarProduto(db, { codigo: '101', descricao: 'Webcam HD', preco: '150,00', estoque: 4 }))
      .toThrow('Já existe um produto com o código 101');
  });

  it('rejeita quantidade zero', () => {
    regras.criarPedido(db, '001');
    expect(() => regras.adicionarItem(db, '001', '101', 0)).toThrow('Quantidade deve ser maior que zero');
  });

  it('mantém o preço do pedido confirmado depois de editar o produto', () => {
    regras.criarPedido(db, '001');
    regras.adicionarItem(db, '001', '101', 1);
    regras.confirmarPedido(db, '001');

    regras.editarProduto(db, '101', { descricao: 'Mouse sem fio', preco: '99.90' });

    const pedido = regras.buscarPedido(db, '001');
    expect(pedido.itens[0].preco).toBe(5000);
    expect(pedido.total).toBe(5000);
  });
});
