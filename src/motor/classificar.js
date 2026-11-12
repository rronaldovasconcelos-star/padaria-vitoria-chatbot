// TO-BE › Sistema › "Classifica: escola, empresa ou individual".
import { soDigitos } from './util.js';

export const TIPOS = ['individual', 'escola', 'empresa'];
export const ROTULO_TIPO = { individual: 'Individual (avulso)', escola: 'Escola', empresa: 'Empresa' };

/** Valida os dígitos verificadores do CNPJ. */
export function validarCNPJ(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export function formatarCNPJ(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Decide o tipo do cliente. O cadastro da padaria prevalece sobre o que o
 * cliente informou (uma escola cadastrada que diz "empresa" continua escola).
 */
export function classificar({ tipoInformado, cnpj }, cadastrosPJ = []) {
  const tipo = TIPOS.includes(tipoInformado) ? tipoInformado : 'individual';
  if (tipo === 'individual') {
    return { tipo, cnpj: null, cadastrado: false, avulso: true };
  }
  const digitos = soDigitos(cnpj);
  const cadastro = cadastrosPJ.find((c) => soDigitos(c.cnpj) === digitos);
  if (cadastro) {
    return { tipo: cadastro.tipo, cnpj: digitos, cadastrado: true, nomeCadastro: cadastro.nome, avulso: false };
  }
  return { tipo, cnpj: digitos, cadastrado: false, avulso: false };
}
