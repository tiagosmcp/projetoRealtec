import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatarDinheiro } from './util.js';

export default function PedidoDetalhe({ avisar }) {
  const { id } = useParams();
  const caminho = '/pedidos/' + encodeURIComponent(id); // o identificador é digitado e pode ter "/"
  const [pedido, setPedido] = useState(null);
  const [produtos, setProdutos] = useState([]);

  // Formulário de novo item
  const [produto, setProduto] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  async function carregar() {
    try {
      setPedido(await api(caminho));
      setProdutos(await api('/produtos'));
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  // Executa uma ação na API, mostra a mensagem e atualiza a tela
  async function executar(caminho, metodo, corpo, textoSucesso) {
    try {
      setPedido(await api(caminho, metodo, corpo));
      avisar('sucesso', textoSucesso);
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  function adicionarItem(evento) {
    evento.preventDefault();
    executar(`${caminho}/itens`, 'POST', { produto, quantidade }, 'Item adicionado ao pedido ' + id);
  }

  if (!pedido) {
    return <p>Carregando pedido {id}...</p>;
  }

  const emRascunho = pedido.situacao === 'RASCUNHO';

  return (
    <>
      <h2>Pedido {pedido.identificador}</h2>
      <div className="resumo">
        <p>Situação: <strong className={'etiqueta ' + pedido.situacao}>{pedido.situacao}</strong></p>
        <p>
          {emRascunho ? 'Total previsto (preços atuais): ' : 'Total: '}
          <strong>{formatarDinheiro(pedido.total)}</strong>
        </p>
      </div>

      <div className="tabela">
        <table>
          <thead>
            <tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th>{emRascunho && <th>Ações</th>}</tr>
          </thead>
          <tbody>
            {pedido.itens.map((item) => (
              <LinhaDoItem key={item.id} item={item} emRascunho={emRascunho} caminhoDoPedido={caminho} executar={executar} />
            ))}
          </tbody>
        </table>
      </div>
      {pedido.itens.length === 0 && <p className="vazio">Nenhum item no pedido.</p>}

      {emRascunho && (
        <form className="em-linha" onSubmit={adicionarItem}>
          <h3>Adicionar item</h3>
          <label>
            Produto
            <select value={produto} onChange={(e) => setProduto(e.target.value)}>
              <option value="">Escolha...</option>
              {produtos.map((p) => (
                <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.descricao}</option>
              ))}
            </select>
          </label>
          <label>Quantidade <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} /></label>
          <button type="submit">Adicionar item</button>
        </form>
      )}

      <div className="acoes">
        {emRascunho && (
          <button onClick={() => executar(`${caminho}/confirmar`, 'POST', null, `Pedido ${id} confirmado`)}>
            Confirmar pedido
          </button>
        )}
        {!emRascunho && (
          <button className="perigo" onClick={() => executar(`${caminho}/cancelar`, 'POST', null, `Pedido ${id} cancelado`)}>
            Cancelar pedido
          </button>
        )}
        <Link to="/pedidos">Voltar para a lista de pedidos</Link>
      </div>
    </>
  );
}

// Uma linha da tabela de itens. Em rascunho, permite alterar a quantidade ou remover.
function LinhaDoItem({ item, emRascunho, caminhoDoPedido, executar }) {
  const [novaQuantidade, setNovaQuantidade] = useState(String(item.quantidade));
  const caminho = `${caminhoDoPedido}/itens/${item.id}`;

  return (
    <tr>
      <td>{item.produto} - {item.descricao}</td>
      <td>{item.quantidade}</td>
      <td>{formatarDinheiro(item.preco)}</td>
      <td>{formatarDinheiro(item.subtotal)}</td>
      {emRascunho && (
        <td>
          <div className="acoes-do-item">
            <label>
              Nova quantidade de {item.descricao}
              <input value={novaQuantidade} onChange={(e) => setNovaQuantidade(e.target.value)} />
            </label>
            <button className="secundario" onClick={() => executar(caminho, 'PUT', { quantidade: novaQuantidade }, 'Quantidade alterada')}>
              Alterar quantidade
            </button>
            <button className="perigo" onClick={() => executar(caminho, 'DELETE', null, 'Item removido')}>
              Remover item
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
