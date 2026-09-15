// Modo sandbox/produção do ASAAS — escolha de ambiente, não de conta, por
// isso fica numa chave só (não por unidade). Compartilhado entre a tela de
// Integração ASAAS (onde o usuário troca o toggle) e a Planilha (onde o
// "Sincronizar ASAAS" precisa saber em qual ambiente consultar o status).
export const ASAAS_MODE_KEY = 'munago_asaas_sandbox';

// Começa sempre em sandbox por segurança — só vira produção se o usuário
// trocar explicitamente na tela ASAAS (e a escolha fica salva).
export function isAsaasSandbox(): boolean {
  return localStorage.getItem(ASAAS_MODE_KEY) !== 'false';
}
