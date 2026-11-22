// Todas as regras de negócio ficam aqui.
// Cada função recebe o banco (db) como primeiro parâmetro.
// Quando algo é rejeitado, lançamos um Error com a mensagem que vai para a tela.

// ---------- Validações simples ----------

// Converte "25,00", "25.00", "R$ 1.770,00" ou 25 para centavos (2500).
export function paraCentavos(valor) {
  let texto = String(valor ?? '').replace('R$', '').trim();
  const comMilhar = /^-?[1-9]\d{0,2}(\.\d{3})+(,\d{1,2})?$/.test(texto); // 1.770 ou 1.770,00
  const semMilhar = /^-?\d+([.,]\d{1,2})?$/.test(texto); // 25 ou 25,00 ou 25.00
  if (!comMilhar && !semMilhar) {
    throw new Error('Preço inválido. Use o formato 25,00');
  }
  if (comMilhar) {
    texto = texto.replaceAll('.', '');
  }
  const numero = Number(texto.replace(',', '.'));
  if (numero <= 0) {
    throw new Error('Preço deve ser maior que zero');
  }
  return Math.round(numero * 100);
}

function lerQuantidade(valor) {
  const quantidade = Number(valor);
  if (!Number.isInteger(quantidade)) {
    throw new Error('Quantidade deve ser um número inteiro');
  }
  if (quantidade <= 0) {
    throw new Error('Quantidade deve ser maior que zero');
  }
  return quantidade;
}

function lerTexto(valor, nomeDoCampo) {
  const texto = String(valor ?? '').trim();
  if (texto === '') {
    throw new Error(`Informe ${nomeDoCampo}`);
  }
  return texto;
}

// ---------- Produtos ----------

export function listarProdutos(db) {
  return db.prepare('SELECT * FROM produtos ORDER BY codigo').all();
}

export function buscarProduto(db, codigo) {
  const produto = db.prepare('SELECT * FROM produtos WHERE codigo = ?').get(String(codigo).trim());
  if (!produto) {
    throw new Error(`Produto ${codigo} não existe`);
  }
  return produto;
}

export function cadastrarProduto(db, dados) {
  const codigo = lerTexto(dados.codigo, 'o código do produto');
  const descricao = lerTexto(dados.descricao, 'a descrição do produto');
  const preco = paraCentavos(dados.preco);
  const estoque = Number(lerTexto(dados.estoque, 'o estoque inicial'));

  if (!Number.isInteger(estoque) || estoque < 0) {
    throw new Error('Estoque deve ser um número inteiro maior ou igual a zero');
  }

  // Código do produto é único
  const existente = db.prepare('SELECT codigo FROM produtos WHERE codigo = ?').get(codigo);
  if (existente) {
    throw new Error(`Já existe um produto com o código ${codigo}`);
  }

  db.prepare('INSERT INTO produtos (codigo, descricao, preco, estoque) VALUES (?, ?, ?, ?)')
    .run(codigo, descricao, preco, estoque);
  return buscarProduto(db, codigo);
}

// Edita só descrição e preço. Pedidos já confirmados guardaram o preço antigo.
export function editarProduto(db, codigo, dados) {
  buscarProduto(db, codigo);
  const descricao = lerTexto(dados.descricao, 'a descrição do produto');
  const preco = paraCentavos(dados.preco);

  db.prepare('UPDATE produtos SET descricao = ?, preco = ? WHERE codigo = ?')
    .run(descricao, preco, codigo);
  return buscarProduto(db, codigo);
}

// Soma (ou subtrai, se for negativo) a quantidade no estoque. Nunca fica negativo.
export function ajustarEstoque(db, codigo, quantidade) {
  const produto = buscarProduto(db, codigo);
  const ajuste = Number(quantidade);

  if (!Number.isInteger(ajuste) || ajuste === 0) {
    throw new Error('Informe um ajuste inteiro diferente de zero (ex.: 5 ou -2)');
  }

  const novoEstoque = produto.estoque + ajuste;
  if (novoEstoque < 0) {
    throw new Error(`Estoque não pode ficar negativo: ${produto.descricao} tem ${produto.estoque}`);
  }

  db.prepare('UPDATE produtos SET estoque = ? WHERE codigo = ?').run(novoEstoque, codigo);
  return buscarProduto(db, codigo);
}

// ---------- Pedidos ----------

export function listarPedidos(db) {
  return db.prepare('SELECT * FROM pedidos ORDER BY identificador').all();
}

// Sugere o próximo identificador livre: "001", "002", ...
export function sugerirIdentificador(db) {
  let numero = db.prepare('SELECT COUNT(*) AS total FROM pedidos').get().total + 1;
  while (db.prepare('SELECT 1 FROM pedidos WHERE identificador = ?').get(String(numero).padStart(3, '0'))) {
    numero++;
  }
  return String(numero).padStart(3, '0');
}

export function criarPedido(db, identificadorDigitado) {
  const identificador = lerTexto(identificadorDigitado, 'o identificador do pedido');

  const existente = db.prepare('SELECT 1 FROM pedidos WHERE identificador = ?').get(identificador);
  if (existente) {
    throw new Error(`Já existe um pedido com o identificador ${identificador}`);
  }

  db.prepare("INSERT INTO pedidos (identificador, situacao) VALUES (?, 'RASCUNHO')").run(identificador);
  return buscarPedido(db, identificador);
}

// Retorna o pedido com os itens.
// Em rascunho o preço mostrado é o atual do produto; depois de confirmado, é o preço salvo.
export function buscarPedido(db, identificador) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE identificador = ?').get(String(identificador).trim());
  if (!pedido) {
    throw new Error(`Pedido ${identificador} não existe`);
  }

  const itens = db.prepare(`
    SELECT itens.id, itens.produto, itens.quantidade, itens.preco_unitario,
           produtos.descricao, produtos.preco AS preco_atual
    FROM itens
    JOIN produtos ON produtos.codigo = itens.produto
    WHERE itens.pedido = ?
    ORDER BY itens.id
  `).all(pedido.identificador);

  let soma = 0;
  for (const item of itens) {
    item.preco = item.preco_unitario ?? item.preco_atual;
    item.subtotal = item.preco * item.quantidade;
    soma += item.subtotal;
  }

  return { ...pedido, itens, total: pedido.total ?? soma };
}

function exigirRascunho(pedido) {
  if (pedido.situacao !== 'RASCUNHO') {
    throw new Error(`Pedido ${pedido.identificador} está ${pedido.situacao} e não pode ter itens alterados`);
  }
}

function buscarItem(db, pedido, itemId) {
  const item = db.prepare('SELECT * FROM itens WHERE id = ? AND pedido = ?').get(Number(itemId), pedido.identificador);
  if (!item) {
    throw new Error(`Item ${itemId} não existe no pedido ${pedido.identificador}`);
  }
  return item;
}

export function adicionarItem(db, identificador, codigoProduto, quantidadeDigitada) {
  const pedido = buscarPedido(db, identificador);
  exigirRascunho(pedido);
  const produto = buscarProduto(db, lerTexto(codigoProduto, 'o produto'));
  const quantidade = lerQuantidade(quantidadeDigitada);

  // O preço não é salvo agora: só na confirmação. O estoque também não muda.
  db.prepare('INSERT INTO itens (pedido, produto, quantidade) VALUES (?, ?, ?)')
    .run(pedido.identificador, produto.codigo, quantidade);
  return buscarPedido(db, identificador);
}

export function alterarQuantidade(db, identificador, itemId, quantidadeDigitada) {
  const pedido = buscarPedido(db, identificador);
  exigirRascunho(pedido);
  const item = buscarItem(db, pedido, itemId);
  const quantidade = lerQuantidade(quantidadeDigitada);

  db.prepare('UPDATE itens SET quantidade = ? WHERE id = ?').run(quantidade, item.id);
  return buscarPedido(db, identificador);
}

export function removerItem(db, identificador, itemId) {
  const pedido = buscarPedido(db, identificador);
  exigirRascunho(pedido);
  const item = buscarItem(db, pedido, itemId);

  db.prepare('DELETE FROM itens WHERE id = ?').run(item.id);
  return buscarPedido(db, identificador);
}

export function confirmarPedido(db, identificador) {
  // Tudo dentro de uma transação: se algo falhar, nada é alterado.
  const confirmar = db.transaction(() => {
    const pedido = buscarPedido(db, identificador);

    if (pedido.situacao !== 'RASCUNHO') {
      throw new Error(`Pedido ${pedido.identificador} já está ${pedido.situacao.toLowerCase()}`);
    }
    if (pedido.itens.length === 0) {
      throw new Error(`Pedido ${pedido.identificador} não tem itens`);
    }

    // 1. Soma a quantidade por produto (o mesmo produto pode aparecer em mais de um item)
    const quantidadePorProduto = {};
    for (const item of pedido.itens) {
      quantidadePorProduto[item.produto] = (quantidadePorProduto[item.produto] ?? 0) + item.quantidade;
    }

    // 2. Verifica o estoque de todos os produtos antes de mexer em qualquer coisa
    for (const codigo in quantidadePorProduto) {
      const produto = buscarProduto(db, codigo);
      const solicitado = quantidadePorProduto[codigo];
      if (solicitado > produto.estoque) {
        throw new Error(`Estoque insuficiente para ${produto.descricao}: solicitado ${solicitado}, disponível ${produto.estoque}`);
      }
    }

    // 3. Congela o preço atual em cada item e calcula o total
    let total = 0;
    for (const item of pedido.itens) {
      db.prepare('UPDATE itens SET preco_unitario = ? WHERE id = ?').run(item.preco_atual, item.id);
      total += item.preco_atual * item.quantidade;
    }

    // 4. Baixa o estoque
    for (const codigo in quantidadePorProduto) {
      db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE codigo = ?')
        .run(quantidadePorProduto[codigo], codigo);
    }

    db.prepare("UPDATE pedidos SET situacao = 'CONFIRMADO', total = ? WHERE identificador = ?")
      .run(total, pedido.identificador);
  });

  confirmar();
  return buscarPedido(db, identificador);
}

export function cancelarPedido(db, identificador) {
  const cancelar = db.transaction(() => {
    const pedido = buscarPedido(db, identificador);

    // Só pedidos confirmados podem ser cancelados. Assim o estoque volta uma única vez.
    if (pedido.situacao === 'CANCELADO') {
      throw new Error(`Pedido ${pedido.identificador} já está cancelado`);
    }
    if (pedido.situacao !== 'CONFIRMADO') {
      throw new Error(`Só pedidos confirmados podem ser cancelados. O pedido ${pedido.identificador} está em rascunho`);
    }

    // Devolve ao estoque o que foi baixado na confirmação
    for (const item of pedido.itens) {
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE codigo = ?').run(item.quantidade, item.produto);
    }

    db.prepare("UPDATE pedidos SET situacao = 'CANCELADO' WHERE identificador = ?").run(pedido.identificador);
  });

  cancelar();
  return buscarPedido(db, identificador);
}
