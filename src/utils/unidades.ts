import { RecolhimentoItem, Unidade } from '../types';

const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');
const normalize = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();

// Acha a Unidade (e sua chave ASAAS) dona de um lançamento. Primeiro tenta
// por CNPJ — caso normal, Unidade = franquia legal, mesmo CNPJ do lançamento.
// Se não bater, tenta o nome da Unidade contra o C. Custo do lançamento —
// cobre unidades cadastradas por região/centro de custo (ex.: "Barueri",
// "Canindé", "Zona Sul"), cujo CNPJ é o da conta bancária da região, não o
// da franquia individual que aparece na Planilha (por isso o match por CNPJ
// sozinho nunca achava a chave, mesmo já configurada).
export function findUnidadeForItem(unidades: Unidade[], item: RecolhimentoItem): Unidade | undefined {
  const byCnpj = unidades.find((u) => onlyDigits(u.cnpj) && onlyDigits(u.cnpj) === onlyDigits(item.cnpj));
  if (byCnpj) return byCnpj;
  return unidades.find((u) => normalize(u.nome) === normalize(item.cCusto));
}
