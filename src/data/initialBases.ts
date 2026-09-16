import { Unidade, BaseCategory } from '../types';

export const INITIAL_UNIDADES: Unidade[] = [
  { id: 'u1', nome: 'RB LOCACAO DE MOTOS LTDA', cnpj: '64058389000109', cCustoPadrao: 'CANINDÉ' },
  { id: 'u2', nome: 'L.E.D LOCADORA DE VEICULOS LTDA', cnpj: '6020362000109', cCustoPadrao: 'CANINDÉ' },
  { id: 'u3', nome: 'JDW LOCACOES LTDA', cnpj: '56950318000198', cCustoPadrao: 'CANINDÉ' },
  { id: 'u4', nome: 'ARR LOCACOES LTDA', cnpj: '57204573000154', cCustoPadrao: 'CANINDÉ' },
  { id: 'u5', nome: 'ZUL MAIS LOC LTDA', cnpj: '63504720000104', cCustoPadrao: 'CANINDÉ' },
];

export const INITIAL_BASE_CATEGORIES: BaseCategory[] = [
  { id: 'c1', nome: 'Taxa de royalties' },
  { id: 'c2', nome: 'Taxa de marketing' },
  { id: 'c3', nome: 'Taxa de gestão de frota' },
  { id: 'c4', nome: 'Taxa de recolhimento' },
  { id: 'c5', nome: 'Manutenção' },
];
