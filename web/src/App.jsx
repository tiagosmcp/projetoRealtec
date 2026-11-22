import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { descartarDigitadoSeBancoMudou } from './util.js';
import Produtos from './Produtos.jsx';
import Pedidos from './Pedidos.jsx';
import PedidoDetalhe from './PedidoDetalhe.jsx';
import Agente from './Agente.jsx';

export default function App() {
  // Mensagem de sucesso ou erro mostrada no topo: { tipo: 'sucesso' | 'erro', texto }
  const [mensagem, setMensagem] = useState(null);

  const { pathname } = useLocation();

  useEffect(() => {
    // Se o servidor estiver fora, quem mostra o erro é a própria tela
    descartarDigitadoSeBancoMudou().catch(() => {});
  }, [pathname]);

  function avisar(tipo, texto) {
    setMensagem({ tipo, texto });
  }

  function limparMensagem() {
    setMensagem(null);
  }

  return (
    <>
      <header>
        <div className="topo">
          <h1>Estoque e Pedidos</h1>
          <nav>
            <NavLink to="/produtos" onClick={limparMensagem}>Produtos</NavLink>
            <NavLink to="/pedidos" onClick={limparMensagem}>Pedidos</NavLink>
            <NavLink to="/agente" onClick={limparMensagem}>Agente</NavLink>
          </nav>
        </div>
      </header>

      <div className="pagina">
        {mensagem && (
          <div className={'mensagem ' + mensagem.tipo} role="alert">
            {mensagem.tipo === 'erro' ? 'Erro: ' : 'Sucesso: '}
            {mensagem.texto}
          </div>
        )}

        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/produtos" />} />
            <Route path="/produtos" element={<Produtos avisar={avisar} />} />
            <Route path="/pedidos" element={<Pedidos avisar={avisar} />} />
            <Route path="/pedidos/:id" element={<PedidoDetalhe avisar={avisar} />} />
            <Route path="/agente" element={<Agente avisar={avisar} />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
