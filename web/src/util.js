import { useState } from 'react';

// Igual ao useState, mas guarda o valor no sessionStorage do navegador.
// Assim o que foi digitado continua lá ao trocar de tela ou recarregar (some ao fechar a aba).
// Ao voltar para o valor inicial, apaga o que estava guardado.
export function useCampoSalvo(chave, inicial = '') {
  const [valor, setValor] = useState(() => sessionStorage.getItem(chave) ?? inicial);

  function alterar(novo) {
    setValor(novo);
    if (novo === inicial) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, novo);
  }

  return [valor, alterar];
}

// O seed muda a versão do banco. Se ela mudou, o que estava digitado era sobre dados que não existem mais.
export async function descartarDigitadoSeBancoMudou() {
  const versao = String((await api('/versao-do-banco')).versao);
  const anterior = sessionStorage.getItem('versaoDoBanco');
  if (anterior === versao) return;

  if (anterior !== null) {
    sessionStorage.clear();
    window.location.reload();
  }
  sessionStorage.setItem('versaoDoBanco', versao);
}

// Chama a API. Se o servidor responder { erro }, lança um Error com essa mensagem.
export async function api(caminho, metodo = 'GET', corpo) {
  let resposta, dados;
  try {
    resposta = await fetch('/api' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    dados = await resposta.json();
  } catch {
    throw new Error('Não consegui falar com o servidor. Confira se o "npm run dev" está rodando');
  }
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
