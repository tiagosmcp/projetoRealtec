// Chama a API. Se o servidor responder { erro }, lança um Error com essa mensagem.
export async function api(caminho, metodo = 'GET', corpo) {
  const resposta = await fetch('/api' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados.erro);
  }
  return dados;
}

// 177000 -> "R$ 1.770,00"
export function formatarDinheiro(centavos) {
  if (centavos == null) return '—';
  return (centavos / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\s/g, ' '); // troca o espaço especial por um espaço comum
}

// 5000 -> "50,00" (para preencher o campo de preço)
export function centavosParaTexto(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}
