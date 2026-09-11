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

export type ActiveTab = 'dashboard' | 'tabela' | 'metas' | 'notificacoes' | 'asaas' | 'bases' | 'relatorios' | 'usuarios';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
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
