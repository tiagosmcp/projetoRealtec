import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatarDinheiro, useCampoSalvo } from './util.js';

// O key faz cada pedido ter os seus próprios campos ao ir de um pedido para outro
export default function PedidoDetalhe({ avisar }) {
  const { id } = useParams();
  return <Detalhe key={id} id={id} avisar={avisar} />;
}

function Detalhe({ id, avisar }) {
  const caminho = '/pedidos/' + encodeURIComponent(id); // o identificador é digitado e pode ter "/"
  const [pedido, setPedido] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [falha, setFalha] = useState('');

  // Formulário de novo item
  const [produto, setProduto] = useCampoSalvo(`${caminho}.produto`);
  const [quantidade, setQuantidade] = useCampoSalvo(`${caminho}.quantidade`, '1');

  async function carregar() {
    try {
      setPedido(await api(caminho));
      setProdutos(await api('/produtos'));
    } catch (erro) {
      setFalha(erro.message);
      avisar('erro', erro.message);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  // Executa uma ação na API, mostra a mensagem e atualiza a tela. Devolve se deu certo.
  async function executar(caminho, metodo, corpo, textoSucesso) {
    try {
      setPedido(await api(caminho, metodo, corpo));
      avisar('sucesso', textoSucesso);
      return true;
    } catch (erro) {
      avisar('erro', erro.message);
      return false;
    }
  }

  async function adicionarItem(evento) {
    evento.preventDefault();
    const deuCerto = await executar(`${caminho}/itens`, 'POST', { produto, quantidade }, 'Item adicionado ao pedido ' + id);
    if (deuCerto) {
      setProduto('');
      setQuantidade('1');
    }
  }

  if (!pedido && falha) {
    return (
      <>
        <h2>Pedido {id}</h2>
        <p className="vazio">{falha}</p>
        <Link to="/pedidos">Voltar para a lista de pedidos</Link>
      </>
    );
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
  const caminho = `${caminhoDoPedido}/itens/${item.id}`;
  // null = não digitou nada, então o campo mostra a quantidade atual do item
  const [digitada, setDigitada] = useCampoSalvo(caminho, null);
  const novaQuantidade = digitada ?? String(item.quantidade);

  async function alterar() {
    if (await executar(caminho, 'PUT', { quantidade: novaQuantidade }, 'Quantidade alterada')) setDigitada(null);
  }

  async function remover() {
    if (await executar(caminho, 'DELETE', null, 'Item removido')) setDigitada(null);
  }

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
              <input value={novaQuantidade} onChange={(e) => setDigitada(e.target.value)} />
            </label>
            <button className="secundario" onClick={alterar}>
              Alterar quantidade
            </button>
            <button className="perigo" onClick={remover}>
              Remover item
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
