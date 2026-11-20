import { useEffect, useState } from 'react';
import { api } from './util.js';

// Mostra os registros (.md) gerados pelo agente na pasta registros/
export default function Agente() {
  const [registros, setRegistros] = useState([]);
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        setRegistros(await api('/registros'));
        setErro('');
      } catch (e) {
        setErro(e.message);
      }
    }
    carregar();
    // Atualiza a cada 2 segundos para acompanhar o agente trabalhando
    const intervalo = setInterval(carregar, 2000);
    return () => clearInterval(intervalo);
  }, []);

  // Se nada foi escolhido, mostra o registro mais recente
  const registro = registros.find((r) => r.nome === escolhido) || registros[0];

  return (
    <>
      <h2>Registros do agente</h2>
      {erro && <p className="mensagem erro">{erro}</p>}
      {registros.length === 0 && <p>Nenhum registro ainda. Rode: npm run agente -- "comando"</p>}

      <div className="registros">
        <ul>
          {registros.map((r) => (
            <li key={r.nome}>
              <button className={registro && r.nome === registro.nome ? 'ativo' : ''} onClick={() => setEscolhido(r.nome)}>
                {r.nome}
              </button>
            </li>
          ))}
        </ul>
        {registro && <pre>{registro.conteudo}</pre>}
      </div>
    </>
  );
}
