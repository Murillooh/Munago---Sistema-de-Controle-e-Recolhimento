import { Pool } from 'pg';

// Postgres genérico: mesma connection string serve pra Supabase, AWS RDS, Cloud SQL etc.
// Sem DATABASE_URL configurada, `pool` fica null e o servidor cai de volta pro
// comportamento atual (localStorage no navegador) sem quebrar nada.
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    })
  : null;

// Sem isso, um erro numa conexão ociosa do pool (queda de rede, RDS
// derrubando conexão parada, etc.) vira uma exceção não tratada e derruba
// o processo Node inteiro — é um gotcha bem conhecido da lib `pg`.
// Com o listener, o pool descarta a conexão ruim e segue funcionando.
pool?.on('error', (err) => {
  console.error('[db] Erro inesperado numa conexão ociosa do pool:', err.message);
});

export interface RecolhimentoRow {
  id: string;
  franquia: string;
  cnpj: string;
  c_custo: string;
  data_criacao: string;
  vencimento: string;
  vencimento_original: string;
  data_pagamento: string;
  valor: string; // numeric vem como string do pg
  status: string;
  competencia_recolhimento: string;
  competencia_pagamento: string;
  descricao: string;
  categoria: string | null;
  asaas_id: string | null;
  owner_id: string | null;
}

// snake_case (banco) <-> camelCase (RecolhimentoItem no front-end)
export function rowToItem(row: RecolhimentoRow) {
  return {
    id: row.id,
    franquia: row.franquia,
    cnpj: row.cnpj,
    cCusto: row.c_custo,
    dataCriacao: row.data_criacao,
    vencimento: row.vencimento,
    vencimentoOriginal: row.vencimento_original,
    dataPagamento: row.data_pagamento,
    valor: Number(row.valor) || 0,
    status: row.status,
    competenciaRecolhimento: row.competencia_recolhimento,
    competenciaPagamento: row.competencia_pagamento,
    descricao: row.descricao,
    categoria: row.categoria || undefined,
    asaasId: row.asaas_id || undefined,
  };
}

export interface EstoqueRow {
  id: string;
  codigo: string;
  descricao: string;
  marca: string;
  endereco: string;
  unidade: string;
  custo: string; // numeric vem como string do pg
  venda: string;
  status: string;
  qtd_vision: string;
  qtd_fisico: string;
  owner_id: string | null;
}

export function rowToEstoqueItem(row: EstoqueRow) {
  return {
    id: row.id,
    codigo: row.codigo,
    descricao: row.descricao,
    marca: row.marca,
    endereco: row.endereco,
    unidade: row.unidade,
    custo: Number(row.custo) || 0,
    venda: Number(row.venda) || 0,
    status: row.status,
    qtdVision: Number(row.qtd_vision) || 0,
    qtdFisico: Number(row.qtd_fisico) || 0,
  };
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// Nunca inclui password_hash — essa função é o que qualquer resposta HTTP devolve.
export function rowToUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

let initPromise: Promise<void> | null = null;

// CREATE TABLE IF NOT EXISTS — seguro rodar toda vez que o servidor sobe.
export function initDb(): Promise<void> {
  if (!pool) return Promise.resolve();
  if (!initPromise) {
    initPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS recolhimentos (
        id TEXT PRIMARY KEY,
        franquia TEXT NOT NULL,
        cnpj TEXT NOT NULL DEFAULT '',
        c_custo TEXT DEFAULT '',
        data_criacao TEXT DEFAULT '',
        vencimento TEXT DEFAULT '',
        vencimento_original TEXT DEFAULT '',
        data_pagamento TEXT DEFAULT '',
        valor NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Aguardando pagamento',
        competencia_recolhimento TEXT DEFAULT '',
        competencia_pagamento TEXT DEFAULT '',
        descricao TEXT DEFAULT '',
        categoria TEXT,
        asaas_id TEXT
      );
      -- Cada lançamento pertence a um usuário; sem isso, dados de contas
      -- diferentes ficariam todos misturados na mesma tabela.
      ALTER TABLE recolhimentos ADD COLUMN IF NOT EXISTS owner_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_recolhimentos_asaas_id ON recolhimentos(asaas_id);
      CREATE INDEX IF NOT EXISTS idx_recolhimentos_owner_id ON recolhimentos(owner_id);

      -- Controle de Estoque (inventário físico de peças) — mesma estrutura
      -- de dono por usuário que os recolhimentos.
      CREATE TABLE IF NOT EXISTS estoque_items (
        id TEXT PRIMARY KEY,
        codigo TEXT DEFAULT '',
        descricao TEXT NOT NULL,
        marca TEXT DEFAULT '',
        endereco TEXT DEFAULT '',
        unidade TEXT DEFAULT 'UN',
        custo NUMERIC NOT NULL DEFAULT 0,
        venda NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Ativo',
        qtd_vision NUMERIC NOT NULL DEFAULT 0,
        qtd_fisico NUMERIC NOT NULL DEFAULT 0,
        owner_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_estoque_items_owner_id ON estoque_items(owner_id);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Assinatura de Push Web (Service Worker) por usuário/dispositivo. É o
      -- que permite mandar notificação de alerta de prazo pro Windows mesmo
      -- com o sistema fechado.
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

      -- Evita reenviar o mesmo alerta de prazo a cada checagem periódica.
      CREATE TABLE IF NOT EXISTS push_alert_log (
        item_id TEXT NOT NULL,
        alert_date DATE NOT NULL,
        PRIMARY KEY (item_id, alert_date)
      );
    `).then(() => undefined);
  }
  return initPromise;
}
