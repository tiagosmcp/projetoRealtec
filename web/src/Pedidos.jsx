import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatarDinheiro, useCampoSalvo } from './util.js';

export default function Pedidos({ avisar }) {
  const [pedidos, setPedidos] = useState([]);
  const [sugestao, setSugestao] = useState('');
  // null = o usuário não digitou nada, então o campo mostra a sugestão
  const [digitado, setDigitado] = useCampoSalvo('novoPedido.identificador', null);
  const identificador = digitado ?? sugestao;
  const navegar = useNavigate();

  async function carregar() {
    try {
      setPedidos(await api('/pedidos'));
      // Sugere o próximo identificador livre no campo de novo pedido
      setSugestao((await api('/pedidos/proximo-identificador')).identificador);
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  useEffect(() => {
    if (digitado === '') setDigitado(null); // saiu com o campo vazio: volta a sugerir
    carregar();
  }, []);

  async function criar(evento) {
    evento.preventDefault();
    try {
      const pedido = await api('/pedidos', 'POST', { identificador });
      avisar('sucesso', `Pedido ${pedido.identificador} criado em rascunho`);
      setDigitado(null);
      navegar('/pedidos/' + encodeURIComponent(pedido.identificador));
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  return (
    <>
      <h2>Pedidos</h2>

      <form className="em-linha" onSubmit={criar}>
        <h3>Novo pedido</h3>
        <label>Identificador do pedido <input value={identificador} onChange={(e) => setDigitado(e.target.value)} /></label>
        <button type="submit">Criar pedido</button>
      </form>

      <div className="tabela">
        <table>
          <thead>
            <tr><th>Identificador</th><th>Situação</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.identificador}>
                <td>{p.identificador}</td>
                <td><span className={'etiqueta ' + p.situacao}>{p.situacao}</span></td>
                <td>{formatarDinheiro(p.total)}</td>
                <td><Link to={'/pedidos/' + encodeURIComponent(p.identificador)}>Ver pedido {p.identificador}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pedidos.length === 0 && <p className="vazio">Nenhum pedido cadastrado.</p>}
    </>
  );
}
