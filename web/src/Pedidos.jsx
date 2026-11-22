import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatarDinheiro } from './util.js';

export default function Pedidos({ avisar }) {
  const [pedidos, setPedidos] = useState([]);
  const [identificador, setIdentificador] = useState('');
  const navegar = useNavigate();

  async function carregar() {
    try {
      setPedidos(await api('/pedidos'));
      // Sugere o próximo identificador livre no campo de novo pedido
      const sugestao = await api('/pedidos/proximo-identificador');
      setIdentificador(sugestao.identificador);
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar(evento) {
    evento.preventDefault();
    try {
      const pedido = await api('/pedidos', 'POST', { identificador });
      avisar('sucesso', `Pedido ${pedido.identificador} criado em rascunho`);
      navegar('/pedidos/' + encodeURIComponent(pedido.identificador));
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  return (
    <>
      <h2>Pedidos</h2>

      <form onSubmit={criar}>
        <h3>Novo pedido</h3>
        <label>Identificador do pedido <input value={identificador} onChange={(e) => setIdentificador(e.target.value)} /></label>
        <button type="submit">Criar pedido</button>
      </form>

      <table>
        <thead>
          <tr><th>Identificador</th><th>Situação</th><th>Total</th><th></th></tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.identificador}>
              <td>{p.identificador}</td>
              <td>{p.situacao}</td>
              <td>{formatarDinheiro(p.total)}</td>
              <td><Link to={'/pedidos/' + encodeURIComponent(p.identificador)}>Ver pedido {p.identificador}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {pedidos.length === 0 && <p>Nenhum pedido cadastrado.</p>}
    </>
  );
}
