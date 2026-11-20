import { useEffect, useState } from 'react';
import { api, formatarDinheiro, centavosParaTexto } from './util.js';

export default function Produtos({ avisar }) {
  const [produtos, setProdutos] = useState([]);

  // Formulário de cadastro
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [estoque, setEstoque] = useState('');

  // Formulário de edição
  const [codigoEdicao, setCodigoEdicao] = useState('');
  const [descricaoEdicao, setDescricaoEdicao] = useState('');
  const [precoEdicao, setPrecoEdicao] = useState('');

  // Formulário de ajuste de estoque
  const [codigoEstoque, setCodigoEstoque] = useState('');
  const [ajuste, setAjuste] = useState('');

  async function carregar() {
    try {
      setProdutos(await api('/produtos'));
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function cadastrar(evento) {
    evento.preventDefault();
    try {
      const produto = await api('/produtos', 'POST', { codigo, descricao, preco, estoque });
      avisar('sucesso', `Produto ${produto.codigo} - ${produto.descricao} cadastrado`);
      setCodigo('');
      setDescricao('');
      setPreco('');
      setEstoque('');
      carregar();
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  // Ao escolher o produto para editar, preenche os campos com os dados atuais
  function escolherParaEditar(codigoEscolhido) {
    setCodigoEdicao(codigoEscolhido);
    const produto = produtos.find((p) => p.codigo === codigoEscolhido);
    setDescricaoEdicao(produto ? produto.descricao : '');
    setPrecoEdicao(produto ? centavosParaTexto(produto.preco) : '');
  }

  async function salvarEdicao(evento) {
    evento.preventDefault();
    try {
      if (!codigoEdicao) throw new Error('Escolha o produto que será editado');
      const produto = await api('/produtos/' + codigoEdicao, 'PUT', { descricao: descricaoEdicao, preco: precoEdicao });
      avisar('sucesso', `Produto ${produto.codigo} atualizado: ${produto.descricao}, ${formatarDinheiro(produto.preco)}`);
      carregar();
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  async function ajustarEstoque(evento) {
    evento.preventDefault();
    try {
      if (!codigoEstoque) throw new Error('Escolha o produto para ajustar o estoque');
      const produto = await api(`/produtos/${codigoEstoque}/estoque`, 'POST', { quantidade: ajuste });
      avisar('sucesso', `Estoque de ${produto.descricao} agora é ${produto.estoque}`);
      setAjuste('');
      carregar();
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  return (
    <>
      <h2>Produtos</h2>

      <table>
        <thead>
          <tr><th>Código</th><th>Descrição</th><th>Preço</th><th>Estoque</th></tr>
        </thead>
        <tbody>
          {produtos.map((p) => (
            <tr key={p.codigo}>
              <td>{p.codigo}</td>
              <td>{p.descricao}</td>
              <td>{formatarDinheiro(p.preco)}</td>
              <td>{p.estoque}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="formularios">
        <form onSubmit={cadastrar}>
          <h3>Novo produto</h3>
          <label>Código <input value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
          <label>Descrição <input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
          <label>Preço (R$) <input value={preco} placeholder="25,00" onChange={(e) => setPreco(e.target.value)} /></label>
          <label>Estoque inicial <input value={estoque} onChange={(e) => setEstoque(e.target.value)} /></label>
          <button type="submit">Cadastrar produto</button>
        </form>

        <form onSubmit={salvarEdicao}>
          <h3>Editar produto</h3>
          <label>
            Produto para editar
            <select value={codigoEdicao} onChange={(e) => escolherParaEditar(e.target.value)}>
              <option value="">Escolha...</option>
              {produtos.map((p) => (
                <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.descricao}</option>
              ))}
            </select>
          </label>
          <label>Nova descrição <input value={descricaoEdicao} onChange={(e) => setDescricaoEdicao(e.target.value)} /></label>
          <label>Novo preço (R$) <input value={precoEdicao} onChange={(e) => setPrecoEdicao(e.target.value)} /></label>
          <button type="submit">Salvar alterações</button>
        </form>

        <form onSubmit={ajustarEstoque}>
          <h3>Ajustar estoque</h3>
          <label>
            Produto do estoque
            <select value={codigoEstoque} onChange={(e) => setCodigoEstoque(e.target.value)}>
              <option value="">Escolha...</option>
              {produtos.map((p) => (
                <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.descricao}</option>
              ))}
            </select>
          </label>
          <label>Quantidade a somar (negativo para retirar) <input value={ajuste} onChange={(e) => setAjuste(e.target.value)} /></label>
          <button type="submit">Ajustar estoque</button>
        </form>
      </div>
    </>
  );
}
