import { useEffect, useState } from 'react';
import { api, formatarDinheiro, centavosParaTexto, useCampoSalvo } from './util.js';

export default function Produtos({ avisar }) {
  const [produtos, setProdutos] = useState([]);

  // Formulário de cadastro
  const [codigo, setCodigo] = useCampoSalvo('cadastro.codigo');
  const [descricao, setDescricao] = useCampoSalvo('cadastro.descricao');
  const [preco, setPreco] = useCampoSalvo('cadastro.preco');
  const [estoque, setEstoque] = useCampoSalvo('cadastro.estoque');

  // Formulário de edição
  const [codigoEdicao, setCodigoEdicao] = useCampoSalvo('edicao.codigo');
  // Guarda só o que foi digitado. null = não mexeu, então vale o valor atual do produto
  const [descricaoDigitada, setDescricaoDigitada] = useCampoSalvo('edicao.descricaoDigitada', null);
  const [precoDigitado, setPrecoDigitado] = useCampoSalvo('edicao.precoDigitado', null);
  const emEdicao = produtos.find((p) => p.codigo === codigoEdicao);
  const descricaoEdicao = descricaoDigitada ?? emEdicao?.descricao ?? '';
  const precoEdicao = precoDigitado ?? (emEdicao ? centavosParaTexto(emEdicao.preco) : '');

  // Formulário de ajuste de estoque
  const [codigoEstoque, setCodigoEstoque] = useCampoSalvo('ajuste.codigo');
  const [ajuste, setAjuste] = useCampoSalvo('ajuste.quantidade');

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

  // Ao trocar de produto, esquece o que foi digitado para o anterior
  function escolherParaEditar(codigoEscolhido) {
    setCodigoEdicao(codigoEscolhido);
    setDescricaoDigitada(null);
    setPrecoDigitado(null);
  }

  async function salvarEdicao(evento) {
    evento.preventDefault();
    try {
      if (!codigoEdicao) throw new Error('Escolha o produto que será editado');
      const produto = await api('/produtos/' + encodeURIComponent(codigoEdicao), 'PUT', { descricao: descricaoDigitada, preco: precoDigitado });
      avisar('sucesso', `Produto ${produto.codigo} atualizado: ${produto.descricao}, ${formatarDinheiro(produto.preco)}`);
      escolherParaEditar(''); // já salvou: limpa o formulário
      carregar();
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  async function ajustarEstoque(evento) {
    evento.preventDefault();
    try {
      if (!codigoEstoque) throw new Error('Escolha o produto para ajustar o estoque');
      const produto = await api(`/produtos/${encodeURIComponent(codigoEstoque)}/estoque`, 'POST', { quantidade: ajuste });
      avisar('sucesso', `Estoque de ${produto.descricao} agora é ${produto.estoque}`);
      setCodigoEstoque('');
      setAjuste('');
      carregar();
    } catch (erro) {
      avisar('erro', erro.message);
    }
  }

  return (
    <>
      <h2>Produtos</h2>

      <div className="tabela">
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
      </div>

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
          <label>Nova descrição <input value={descricaoEdicao} onChange={(e) => setDescricaoDigitada(e.target.value)} /></label>
          <label>Novo preço (R$) <input value={precoEdicao} onChange={(e) => setPrecoDigitado(e.target.value)} /></label>
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
