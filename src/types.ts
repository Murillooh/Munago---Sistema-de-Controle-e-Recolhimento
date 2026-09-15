export interface RecolhimentoItem {
  id: string;
  franquia: string;
  cnpj: string;
  cCusto: string;
  dataCriacao: string;
  vencimento: string;
  vencimentoOriginal: string;
  dataPagamento: string;
  valor: number;
  status: 'Confirmada' | 'Recebida' | 'Aguardando pagamento' | 'Atrasado';
  competenciaRecolhimento: string; // ex: 'ago/26'
  competenciaPagamento: string; // ex: 'set/26'
  descricao: string;
  categoria?: string;
  asaasId?: string;
}

export interface DetailedGoal {
  id: string;
  name: string;
  value: number;
  deadline?: string;
  category?: string;
}

export interface GoalSettings {
  monthlyGoal: number;
  targetYear: number;
  alertEmail: string;
  enableNotifications: boolean;
  detailedGoals?: DetailedGoal[];
}

export type ActiveTab = 'dashboard' | 'tabela' | 'metas' | 'notificacoes' | 'asaas' | 'bases' | 'relatorios' | 'usuarios' | 'estoque';

// Abas que o admin pode liberar/bloquear por usuário. Fora da lista de
// propósito: "dashboard" (sempre liberado — é a tela de pouso, ninguém pode
// ficar sem nenhuma aba acessível) e "usuarios" (sempre admin-only, nunca
// configurável). Ver canAccessTab em src/utils/permissions.ts.
export const PERMISSION_TABS: { id: ActiveTab; label: string }[] = [
  { id: 'tabela', label: 'Planilha' },
  { id: 'metas', label: 'Metas' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'asaas', label: 'ASAAS' },
  { id: 'bases', label: 'Bases' },
  { id: 'notificacoes', label: 'Notificações' },
];

// Um item do inventário físico de peças (Controle de Estoque). "Diferença"
// (qtdFisico - qtdVision) e "valor" da diferença nunca ficam salvos — são
// sempre calculados na hora, igual todo outro total do sistema.
export interface EstoqueItem {
  id: string;
  codigo: string;
  descricao: string;
  marca: string;
  endereco: string;
  unidade: string;
  custo: number;
  venda: number;
  status: 'Ativo' | 'Inativo';
  qtdVision: number;
  qtdFisico: number;
}

// Valor especial de filtro de status pra representar "Confirmada + Recebida"
// juntas — é como o card "Confirmado" do Dashboard soma o valor, então o
// clique nele precisa filtrar a Planilha pelas duas, não só uma.
export const CONFIRMADO_RECEBIDO_FILTER = '__confirmado_recebido__';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  // null/undefined = acesso a todas as abas (padrão pra admin e pra quem
  // nunca teve permissão restringida). Array = lista explícita de abas
  // liberadas pro usuário — ver PERMISSION_TABS e canAccessTab().
  allowedTabs?: ActiveTab[] | null;
}

export interface Unidade {
  id: string;
  nome: string;
  cnpj: string;
  cCustoPadrao?: string;
  asaasApiKey?: string;
}

export interface BaseCategory {
  id: string;
  nome: string;
}
