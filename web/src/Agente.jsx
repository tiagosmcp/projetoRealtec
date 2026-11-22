import { useEffect, useState } from 'react';
import { api } from './util.js';

const EXEMPLO = 'Ex.: Cancele o pedido 001 e confira o estoque.';

// Envia instruções ao agente e mostra os registros (.md) da pasta registros/
export default function Agente({ avisar }) {
  const [comando, setComando] = useState('');
  const [executando, setExecutando] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        setRegistros(await api('/registros'));
        setExecutando((await api('/agente')).executando);
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

  async function executar(evento) {
    evento.preventDefault();
    try {
      await api('/agente', 'POST', { comando });
      avisar('sucesso', 'Instrução enviada. Acompanhe no navegador que vai abrir e no registro abaixo');
      setExecutando(true);
      setComando('');
      setEscolhido(''); // volta a seguir o registro mais recente
    } catch (e) {
      avisar('erro', e.message);
    }
  }

  // Os relatórios ficam no fim da lista, para o topo ser sempre a execução mais recente
  const execucoes = registros.filter((r) => !r.nome.includes('RELATORIO'));
  const relatorios = registros.filter((r) => r.nome.includes('RELATORIO'));
  const lista = [...execucoes, ...relatorios];
  const registro = lista.find((r) => r.nome === escolhido) || lista[0];

  return (
    <>
      <h2>Agente de IA</h2>

      <form className="comando" onSubmit={executar}>
        <label>
          Instrução para o agente
          <textarea rows="3" value={comando} placeholder={EXEMPLO} onChange={(e) => setComando(e.target.value)} />
        </label>
        <button type="submit" disabled={executando}>
          {executando ? 'Agente trabalhando...' : 'Executar agente'}
        </button>
      </form>

      {erro && <p className="mensagem erro">{erro}</p>}
      {lista.length === 0 && <p>Nenhum registro ainda.</p>}

      <div className="registros">
        <ul>
          {lista.map((r) => (
            <li key={r.nome}>
              <button className={r === registro ? 'ativo' : ''} onClick={() => setEscolhido(r.nome)}>
                <span className="titulo">{lerSecao(r.conteudo, 'Comando') || 'Relatório do roteiro'}</span>
                <small>{r.nome}</small>
                <Resultado conteudo={r.conteudo} />
              </button>
            </li>
          ))}
        </ul>
        {registro && <pre>{registro.conteudo}</pre>}
      </div>
    </>
  );
}

// Pega a primeira linha de uma seção "## Título" do registro
function lerSecao(conteudo, titulo) {
  const linhas = conteudo.split(/\r?\n/);
  const inicio = linhas.indexOf('## ' + titulo);
  return inicio === -1 ? '' : linhas[inicio + 1];
}

// Etiqueta com a conclusão de cada execução
function Resultado({ conteudo }) {
  const conclusao = lerSecao(conteudo, 'Conclusão').toUpperCase();
  if (conclusao.startsWith('CONFORME')) return <span className="etiqueta verde">Conforme</span>;
  if (conclusao.startsWith('EM ANDAMENTO')) return <span className="etiqueta amarela">Em andamento</span>;
  if (conclusao) return <span className="etiqueta vermelha">Diferente</span>;
  return null;
}
