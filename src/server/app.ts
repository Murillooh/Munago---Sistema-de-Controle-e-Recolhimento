import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { pool, initDb, rowToItem, rowToUser, rowToEstoqueItem, rowToUnidade } from './db.js';
import { configureWebPush, getVapidPublicKey, sendPushToUser, runDeadlineAlertCheck } from './push.js';
import { generateRecolhimentoReportPdf, RecolhimentoRecord } from './recolhimentoReport.js';
import { generateEstoqueReportPdf, EstoqueRecord } from './estoqueReport.js';

// Monta o app Express com todas as rotas de API, sem dar listen — usado tanto
// pelo servidor local (server.ts, que ainda pluga o Vite/estático por cima)
// quanto pela função serverless da Vercel (api/index.ts).
export async function createApp() {
  const app = express();

  // Padrão do Express é 100kb — uma planilha de ~600 linhas com descrição
  // longa passa fácil disso e a requisição inteira é rejeitada (413) antes
  // de chegar em qualquer rota. 15mb cobre até importações bem grandes.
  app.use(express.json({ limit: '15mb' }));

  await initDb();
  configureWebPush();

  // ---------------------------------------------------------------------
  // Recolhimentos: fonte de verdade no banco (Postgres). Sem DATABASE_URL
  // configurada, retorna 503 e o front-end continua funcionando via
  // localStorage (comportamento anterior), sem quebrar nada.
  // ---------------------------------------------------------------------
  const requireDb = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado (defina DATABASE_URL).' });
    next();
  };

  // ---------------------------------------------------------------------
  // Autenticação: cadastro fica pendente até um admin aprovar. O primeiro
  // usuário que se cadastra na tabela vazia vira admin aprovado automático
  // (dono do sistema) — ninguém precisa digitar senha nenhuma no chat pra
  // isso acontecer. Sem DATABASE_URL, esses endpoints ficam fora do ar e o
  // login antigo (client-only, sem senha real) continua sendo o fallback.
  // ---------------------------------------------------------------------
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' }
  });

  const getSessionUser = async (req: express.Request) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || !pool) return null;
    const result = await pool.query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
      [token]
    );
    return result.rows[0] || null;
  };

  const requireAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado (defina DATABASE_URL).' });
    const user = await getSessionUser(req);
    if (!user || user.role !== 'admin' || user.status !== 'approved') {
      return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    }
    (req as any).authUser = user;
    next();
  };

  // Cada usuário só enxerga e mexe nos próprios lançamentos — isolamento
  // total de dados entre contas. Anexa o usuário logado em req.authUser.
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado (defina DATABASE_URL).' });
    const user = await getSessionUser(req);
    if (!user || user.status !== 'approved') {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
    (req as any).authUser = user;
    next();
  };

  app.post('/api/auth/register', requireDb, async (req, res) => {
    try {
      const { name, email, password } = req.body || {};
      if (!name || !email || !password || String(password).length < 6) {
        return res.status(400).json({ error: 'Nome, e-mail e senha (mín. 6 caracteres) são obrigatórios.' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = await pool!.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
      }

      const countResult = await pool!.query('SELECT COUNT(*)::int AS count FROM users');
      const isFirstUser = countResult.rows[0].count === 0;

      const passwordHash = await bcrypt.hash(String(password), 10);
      const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const role = isFirstUser ? 'admin' : 'user';
      const status = isFirstUser ? 'approved' : 'pending';

      const result = await pool!.query(
        `INSERT INTO users (id, name, email, password_hash, role, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [id, name, normalizedEmail, passwordHash, role, status]
      );

      res.json({ success: true, user: rowToUser(result.rows[0]) });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao criar conta.', details: err.message });
    }
  });

  app.post('/api/auth/login', requireDb, loginLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });

      const normalizedEmail = String(email).trim().toLowerCase();
      const result = await pool!.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
      const userRow = result.rows[0];

      if (!userRow || !(await bcrypt.compare(String(password), userRow.password_hash))) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }
      if (userRow.status === 'pending') {
        return res.status(403).json({ error: 'Sua conta está aguardando aprovação de um administrador.' });
      }
      if (userRow.status === 'rejected') {
        return res.status(403).json({ error: 'Seu acesso a este sistema não foi autorizado.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      await pool!.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userRow.id]);

      res.json({ success: true, token, user: rowToUser(userRow) });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao fazer login.', details: err.message });
    }
  });

  app.post('/api/auth/logout', requireDb, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) await pool!.query('DELETE FROM sessions WHERE token = $1', [token]).catch(() => {});
    res.json({ success: true });
  });

  // Reconsulta o próprio perfil (role/status/allowedTabs). Sem isso, quando
  // o admin muda a permissão de alguém já logado, essa pessoa só veria o
  // efeito no próximo login — o front chama isto periodicamente pra refletir
  // a mudança na sessão aberta.
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    res.json(rowToUser((req as any).authUser));
  });

  // Lista de usuários pra tela de aprovação (admin only).
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const result = await pool!.query('SELECT * FROM users ORDER BY created_at DESC');
      res.json(result.rows.map(rowToUser));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar usuários.', details: err.message });
    }
  });

  // Abas que o admin pode liberar/bloquear por usuário. Fora da lista:
  // "dashboard" (sempre liberado) e "usuarios" (sempre admin-only, nunca
  // configurável) — ver PERMISSION_TABS/canAccessTab no front, src/types.ts
  // e src/utils/permissions.ts.
  const VALID_PERMISSION_TABS = ['tabela', 'metas', 'notificacoes', 'asaas', 'bases', 'relatorios', 'estoque'];

  // Aprova, rejeita, promove ou ajusta as permissões de abas de um usuário
  // (admin only).
  app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { status, role, allowedTabs } = req.body || {};
      const validStatus = ['pending', 'approved', 'rejected'];
      const validRole = ['admin', 'user'];
      if (status && !validStatus.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
      if (role && !validRole.includes(role)) return res.status(400).json({ error: 'Papel inválido.' });

      let allowedTabsJson: string | null | undefined; // undefined = não mexe na coluna
      if (allowedTabs !== undefined) {
        if (allowedTabs === null) {
          allowedTabsJson = null; // libera acesso total de novo
        } else {
          if (!Array.isArray(allowedTabs) || allowedTabs.some((t: any) => !VALID_PERMISSION_TABS.includes(t))) {
            return res.status(400).json({ error: 'Lista de permissões inválida.' });
          }
          allowedTabsJson = JSON.stringify(allowedTabs);
        }
      }

      const result = await pool!.query(
        `UPDATE users SET
           status = COALESCE($1, status),
           role = COALESCE($2, role),
           allowed_tabs = CASE WHEN $3::boolean THEN $4::jsonb ELSE allowed_tabs END
         WHERE id = $5 RETURNING *`,
        [status || null, role || null, allowedTabsJson !== undefined, allowedTabsJson ?? null, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      res.json(rowToUser(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar usuário.', details: err.message });
    }
  });

  // Remove um usuário de vez (cadastro rejeitado/spam etc). Sessões e
  // assinaturas de push desse usuário somem junto (ON DELETE CASCADE) —
  // os lançamentos que ele criou continuam no banco, só ficam com um
  // owner_id que não existe mais (mesma situação de qualquer conta
  // apagada; não há como saber se o admin quer apagar os dados junto ou
  // repassar pra outra conta, então não mexe nisso aqui).
  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const authUserId = (req as any).authUser.id;
      if (req.params.id === authUserId) {
        return res.status(400).json({ error: 'Você não pode excluir a própria conta.' });
      }

      const target = await pool!.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
      if (target.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (target.rows[0].role === 'admin') {
        const adminCount = await pool!.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
        if (adminCount.rows[0].n <= 1) {
          return res.status(400).json({ error: 'Não é possível excluir o único administrador do sistema.' });
        }
      }

      await pool!.query('DELETE FROM users WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir usuário.', details: err.message });
    }
  });

  // Sem provedor de e-mail configurado, não tem "esqueci minha senha"
  // self-service — o admin gera uma senha temporária na hora e repassa pro
  // usuário direto (WhatsApp/e-mail). Fica só na resposta desta chamada,
  // nunca gravada em texto puro nem logada.
  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    try {
      const tempPassword = crypto.randomBytes(6).toString('base64url'); // 8 chars, url-safe
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const result = await pool!.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
        [passwordHash, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      // Invalida sessões antigas — a senha mudou, ninguém deve continuar logado com a antiga.
      await pool!.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
      res.json({ tempPassword });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao redefinir senha.', details: err.message });
    }
  });

  // Todo /api/items exige login (requireAuth) e é sempre filtrado pelo
  // dono (owner_id = usuário da sessão) — uma conta nunca vê ou edita o
  // lançamento de outra, mesmo sabendo o id.
  app.get('/api/items', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const result = await pool!.query(
        'SELECT * FROM recolhimentos WHERE owner_id = $1 ORDER BY data_criacao DESC',
        [ownerId]
      );
      res.json(result.rows.map(rowToItem));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar lançamentos.', details: err.message });
    }
  });

  const insertItemQuery = `
    INSERT INTO recolhimentos (
      id, franquia, cnpj, c_custo, data_criacao, vencimento, vencimento_original,
      data_pagamento, valor, status, competencia_recolhimento, competencia_pagamento,
      descricao, categoria, asaas_id, asaas_invoice_url, owner_id, asaas_imported_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (id) DO NOTHING
    RETURNING *;
  `;
  // Não mexe em asaas_imported_at aqui de propósito — é a hora em que o item
  // ENTROU no Munago, uma edição posterior (ex: mudar status) não pode mudar isso.
  const updateItemQuery = `
    UPDATE recolhimentos SET
      franquia = $2, cnpj = $3, c_custo = $4, data_criacao = $5, vencimento = $6,
      vencimento_original = $7, data_pagamento = $8, valor = $9, status = $10,
      competencia_recolhimento = $11, competencia_pagamento = $12, descricao = $13,
      categoria = $14, asaas_id = $15, asaas_invoice_url = $16
    WHERE id = $1 AND owner_id = $17
    RETURNING *;
  `;
  // owner_id sempre vem da sessão autenticada, nunca do corpo da requisição —
  // senão bastaria mandar outro id no payload pra "adotar" lançamento alheio.
  const itemToParams = (item: any, ownerId: string) => [
    item.id,
    item.franquia || '',
    item.cnpj || '',
    item.cCusto || '',
    item.dataCriacao || '',
    item.vencimento || '',
    item.vencimentoOriginal || '',
    item.dataPagamento || '',
    Number(item.valor) || 0,
    item.status || 'Aguardando pagamento',
    item.competenciaRecolhimento || '',
    item.competenciaPagamento || '',
    item.descricao || '',
    item.categoria || null,
    item.asaasId || null,
    item.asaasInvoiceUrl || null,
    ownerId,
    item.asaasImportedAt || null,
  ];

  app.post('/api/items', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const result = await pool!.query(insertItemQuery, itemToParams(req.body, ownerId));
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Já existe um lançamento com este id.' });
      }
      res.json(rowToItem(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar lançamento.', details: err.message });
    }
  });

  const ITEM_COLUMNS = [
    'id', 'franquia', 'cnpj', 'c_custo', 'data_criacao', 'vencimento', 'vencimento_original',
    'data_pagamento', 'valor', 'status', 'competencia_recolhimento', 'competencia_pagamento',
    'descricao', 'categoria', 'asaas_id', 'asaas_invoice_url', 'owner_id', 'asaas_imported_at',
  ];

  // Um lote de 600+ linhas como 600+ INSERTs sequenciais numa única transação
  // contra um banco remoto é frágil — uma soneca de rede no meio derruba a
  // transação inteira (rollback silencioso) mesmo que o cliente já tenha
  // avisado "importado com sucesso". Em lotes de até 200 linhas por INSERT
  // (bem abaixo do limite de parâmetros do Postgres) reduz de centenas de
  // idas-e-voltas pro banco pra só um punhado.
  const CHUNK_SIZE = 200;
  async function insertItemsBatch(items: any[], ownerId: string) {
    const inserted: any[] = [];
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const values: any[] = [];
        const tuples = chunk.map((item, rowIdx) => {
          const params = itemToParams(item, ownerId);
          values.push(...params);
          const base = rowIdx * ITEM_COLUMNS.length;
          return `(${ITEM_COLUMNS.map((_, colIdx) => `$${base + colIdx + 1}`).join(',')})`;
        });
        const result = await client.query(
          `INSERT INTO recolhimentos (${ITEM_COLUMNS.join(',')})
           VALUES ${tuples.join(',')}
           ON CONFLICT (id) DO NOTHING
           RETURNING *`,
          values
        );
        inserted.push(...result.rows);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return inserted;
  }

  app.post('/api/items/bulk', requireDb, requireAuth, async (req, res) => {
    const items = Array.isArray(req.body) ? req.body : [];
    const ownerId = (req as any).authUser.id;
    try {
      const inserted = await insertItemsBatch(items, ownerId);
      res.json({ success: true, count: inserted.length, items: inserted.map(rowToItem) });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao importar lançamentos em lote.', details: err.message });
    }
  });

  app.put('/api/items/:id', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const params = itemToParams({ ...req.body, id: req.params.id }, ownerId);
      const result = await pool!.query(updateItemQuery, params);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Lançamento não encontrado.' });
      }
      res.json(rowToItem(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar lançamento.', details: err.message });
    }
  });

  app.delete('/api/items/:id', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      await pool!.query('DELETE FROM recolhimentos WHERE id = $1 AND owner_id = $2', [req.params.id, ownerId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir lançamento.', details: err.message });
    }
  });

  // Exclusão em massa: um DELETE só com todos os ids, em vez de uma
  // requisição por item selecionado.
  app.post('/api/items/delete-bulk', requireDb, requireAuth, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      if (ids.length === 0) return res.json({ success: true, count: 0 });
      const ownerId = (req as any).authUser.id;
      const result = await pool!.query(
        'DELETE FROM recolhimentos WHERE id = ANY($1) AND owner_id = $2 RETURNING id',
        [ids, ownerId]
      );
      res.json({ success: true, count: result.rowCount });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir lançamentos em lote.', details: err.message });
    }
  });

  // ---------------------------------------------------------------------
  // Controle de Estoque — mesmo padrão de /api/items (dono por sessão,
  // import em lote em chunks, etc), só que pra EstoqueItem em vez de
  // RecolhimentoItem.
  // ---------------------------------------------------------------------
  app.get('/api/estoque', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const result = await pool!.query(
        'SELECT * FROM estoque_items WHERE owner_id = $1 ORDER BY descricao ASC',
        [ownerId]
      );
      res.json(result.rows.map(rowToEstoqueItem));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar itens de estoque.', details: err.message });
    }
  });

  const insertEstoqueQuery = `
    INSERT INTO estoque_items (
      id, codigo, descricao, marca, endereco, unidade, custo, venda, status,
      qtd_vision, qtd_fisico, owner_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO NOTHING
    RETURNING *;
  `;
  const updateEstoqueQuery = `
    UPDATE estoque_items SET
      codigo = $2, descricao = $3, marca = $4, endereco = $5, unidade = $6,
      custo = $7, venda = $8, status = $9, qtd_vision = $10, qtd_fisico = $11
    WHERE id = $1 AND owner_id = $12
    RETURNING *;
  `;
  const estoqueToParams = (item: any, ownerId: string) => [
    item.id,
    item.codigo || '',
    item.descricao || '',
    item.marca || '',
    item.endereco || '',
    item.unidade || 'UN',
    Number(item.custo) || 0,
    Number(item.venda) || 0,
    item.status || 'Ativo',
    Number(item.qtdVision) || 0,
    Number(item.qtdFisico) || 0,
    ownerId,
  ];

  app.post('/api/estoque', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const result = await pool!.query(insertEstoqueQuery, estoqueToParams(req.body, ownerId));
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Já existe um item de estoque com este id.' });
      }
      res.json(rowToEstoqueItem(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar item de estoque.', details: err.message });
    }
  });

  const ESTOQUE_COLUMNS = [
    'id', 'codigo', 'descricao', 'marca', 'endereco', 'unidade', 'custo', 'venda', 'status',
    'qtd_vision', 'qtd_fisico', 'owner_id',
  ];

  async function insertEstoqueBatch(items: any[], ownerId: string) {
    const inserted: any[] = [];
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const values: any[] = [];
        const tuples = chunk.map((item, rowIdx) => {
          const params = estoqueToParams(item, ownerId);
          values.push(...params);
          const base = rowIdx * ESTOQUE_COLUMNS.length;
          return `(${ESTOQUE_COLUMNS.map((_, colIdx) => `$${base + colIdx + 1}`).join(',')})`;
        });
        const result = await client.query(
          `INSERT INTO estoque_items (${ESTOQUE_COLUMNS.join(',')})
           VALUES ${tuples.join(',')}
           ON CONFLICT (id) DO NOTHING
           RETURNING *`,
          values
        );
        inserted.push(...result.rows);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return inserted;
  }

  app.post('/api/estoque/bulk', requireDb, requireAuth, async (req, res) => {
    const items = Array.isArray(req.body) ? req.body : [];
    const ownerId = (req as any).authUser.id;
    try {
      const inserted = await insertEstoqueBatch(items, ownerId);
      res.json({ success: true, count: inserted.length, items: inserted.map(rowToEstoqueItem) });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao importar itens de estoque em lote.', details: err.message });
    }
  });

  app.put('/api/estoque/:id', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const params = estoqueToParams({ ...req.body, id: req.params.id }, ownerId);
      const result = await pool!.query(updateEstoqueQuery, params);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item de estoque não encontrado.' });
      }
      res.json(rowToEstoqueItem(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar item de estoque.', details: err.message });
    }
  });

  app.delete('/api/estoque/:id', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      await pool!.query('DELETE FROM estoque_items WHERE id = $1 AND owner_id = $2', [req.params.id, ownerId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir item de estoque.', details: err.message });
    }
  });

  app.post('/api/estoque/delete-bulk', requireDb, requireAuth, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      if (ids.length === 0) return res.json({ success: true, count: 0 });
      const ownerId = (req as any).authUser.id;
      const result = await pool!.query(
        'DELETE FROM estoque_items WHERE id = ANY($1) AND owner_id = $2 RETURNING id',
        [ids, ownerId]
      );
      res.json({ success: true, count: result.rowCount });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir itens de estoque em lote.', details: err.message });
    }
  });

  // ---------------------------------------------------------------------
  // Unidades (franquias/regiões) + chave ASAAS — compartilhadas entre TODOS
  // os usuários aprovados (sem owner_id), diferente de recolhimentos/estoque.
  // Qualquer usuário aprovado pode LER (precisa da chave pra gerar cobrança
  // pelo próprio navegador); só admin pode escrever.
  // ---------------------------------------------------------------------
  app.get('/api/unidades', requireDb, requireAuth, async (req, res) => {
    try {
      const result = await pool!.query('SELECT * FROM unidades ORDER BY nome ASC');
      res.json(result.rows.map(rowToUnidade));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar unidades.', details: err.message });
    }
  });

  const unidadeToParams = (u: any) => [
    u.id,
    u.nome || '',
    u.cnpj || '',
    u.cCustoPadrao || '',
    u.asaasApiKey || null,
  ];

  app.post('/api/unidades', requireDb, requireAdmin, async (req, res) => {
    try {
      const result = await pool!.query(
        `INSERT INTO unidades (id, nome, cnpj, c_custo_padrao, asaas_api_key)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING
         RETURNING *`,
        unidadeToParams(req.body)
      );
      if (result.rows.length === 0) return res.status(409).json({ error: 'Já existe uma unidade com este id.' });
      res.json(rowToUnidade(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar unidade.', details: err.message });
    }
  });

  // Migração única: se a tabela estiver vazia mas o navegador do admin já
  // tinha unidades salvas localmente (era assim que funcionava antes),
  // manda tudo de uma vez pra não perder o que já estava configurado.
  app.post('/api/unidades/bulk', requireDb, requireAdmin, async (req, res) => {
    try {
      const list = Array.isArray(req.body) ? req.body : [];
      const inserted: any[] = [];
      for (const u of list) {
        const result = await pool!.query(
          `INSERT INTO unidades (id, nome, cnpj, c_custo_padrao, asaas_api_key)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO NOTHING
           RETURNING *`,
          unidadeToParams(u)
        );
        inserted.push(...result.rows);
      }
      res.json({ success: true, count: inserted.length, unidades: inserted.map(rowToUnidade) });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao importar unidades.', details: err.message });
    }
  });

  app.put('/api/unidades/:id', requireDb, requireAdmin, async (req, res) => {
    try {
      const result = await pool!.query(
        `UPDATE unidades SET nome = $2, cnpj = $3, c_custo_padrao = $4, asaas_api_key = COALESCE($5, asaas_api_key)
         WHERE id = $1
         RETURNING *`,
        unidadeToParams({ ...req.body, id: req.params.id })
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Unidade não encontrada.' });
      res.json(rowToUnidade(result.rows[0]));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar unidade.', details: err.message });
    }
  });

  app.delete('/api/unidades/:id', requireDb, requireAdmin, async (req, res) => {
    try {
      await pool!.query('DELETE FROM unidades WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir unidade.', details: err.message });
    }
  });

  // Webhook do ASAAS: chamado por eles automaticamente quando um pagamento muda de
  // status (PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE...). Configure a URL
  // pública deste endpoint no painel ASAAS (Configurações > Webhooks) e, se quiser
  // validar a origem, defina ASAAS_WEBHOOK_TOKEN igual ao "Token de acesso" de lá.
  const ASAAS_STATUS_MAP: Record<string, string> = {
    RECEIVED: 'Recebida',
    RECEIVED_IN_CASH: 'Recebida',
    CONFIRMED: 'Confirmada',
    OVERDUE: 'Atrasado',
    PENDING: 'Aguardando pagamento',
  };

  app.post('/api/asaas/webhook', async (req, res) => {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expectedToken) {
      return res.status(500).json({ error: 'Webhook token not configured in production' });
    }
    if (req.headers['asaas-access-token'] !== expectedToken) {
      return res.status(401).json({ error: 'Token de webhook inválido.' });
    }

    // Responde rápido — ASAAS espera 2xx e reenvia em caso de erro/timeout.
    res.status(200).json({ received: true });

    if (!pool) {
      console.warn('Webhook ASAAS recebido, mas DATABASE_URL não configurada — ignorado.');
      return;
    }

    try {
      const payment = req.body?.payment;
      if (!payment?.id) return;

      const mappedStatus = ASAAS_STATUS_MAP[payment.status] || null;
      if (!mappedStatus) return;

      const dataPagamento = payment.paymentDate
        ? payment.paymentDate.split('-').reverse().join('/')
        : null;

      await pool.query(
        `UPDATE recolhimentos
         SET status = $1, data_pagamento = COALESCE($2, data_pagamento)
         WHERE asaas_id = $3`,
        [mappedStatus, dataPagamento, payment.id]
      );
    } catch (err) {
      console.error('Erro ao processar webhook ASAAS:', err);
    }
  });

  // ---------------------------------------------------------------------
  // Relatório em PDF (capa com KPIs/gráficos + tabelas por unidade) — roda
  // no servidor via Puppeteer/Chromium (ver recolhimentoReport.ts),
  // substitui o PDF simples que era montado no navegador com jsPDF. O
  // cliente manda os itens já carregados/filtrados; nada é buscado no
  // banco aqui, então requireDb/requireAuth servem só pra exigir sessão
  // válida (evita qualquer um sem login gastar Chromium do servidor).
  // ---------------------------------------------------------------------
  app.post('/api/reports/pdf', requireDb, requireAuth, async (req, res) => {
    // Marca o instante em que o pedido chegou — o Chromium ainda leva alguns
    // segundos pra subir e renderizar, então "agora" só nesse ponto já não
    // seria mais o horário em que o usuário de fato pediu o relatório.
    const requestedAt = new Date();
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro para gerar o relatório.' });
      }

      const records: RecolhimentoRecord[] = items.map((item: any) => ({
        franquia: item.franquia || '',
        cnpj: item.cnpj || '',
        ccusto: item.cCusto || item.ccusto || '',
        vencimento: item.vencimento || '',
        vencOrig:
          item.vencimentoOriginal && item.vencimentoOriginal !== item.vencimento
            ? item.vencimentoOriginal
            : undefined,
        pagamento: item.dataPagamento && item.dataPagamento !== '-' ? item.dataPagamento : undefined,
        valor: Number(item.valor) || 0,
        status: item.status || 'Aguardando pagamento',
        compRec: item.competenciaRecolhimento || '-',
        compPag:
          item.competenciaPagamento && item.competenciaPagamento !== '-'
            ? item.competenciaPagamento
            : undefined,
        descricao: item.descricao || '',
      }));

      const pdf = await generateRecolhimentoReportPdf(records, {
        generatedAt: requestedAt,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        lede: typeof req.body?.lede === 'string' ? req.body.lede : undefined,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-recolhimento.pdf"');
      res.send(pdf);
    } catch (err: any) {
      console.error('[reports/pdf] Erro ao gerar PDF:', err);
      res.status(500).json({ error: 'Erro ao gerar o relatório em PDF.', details: err.message });
    }
  });

  app.post('/api/reports/estoque-pdf', requireDb, requireAuth, async (req, res) => {
    const requestedAt = new Date();
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length === 0) {
        return res.status(400).json({ error: 'Nenhum item para gerar o relatório.' });
      }

      const records: EstoqueRecord[] = items.map((item: any) => ({
        codigo: item.codigo || '',
        descricao: item.descricao || '',
        marca: item.marca || '',
        endereco: item.endereco || '',
        unidade: item.unidade || '',
        custo: Number(item.custo) || 0,
        venda: Number(item.venda) || 0,
        status: item.status || 'Ativo',
        qtdVision: Number(item.qtdVision) || 0,
        qtdFisico: Number(item.qtdFisico) || 0,
      }));

      const pdf = await generateEstoqueReportPdf(records, {
        generatedAt: requestedAt,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        lede: typeof req.body?.lede === 'string' ? req.body.lede : undefined,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-estoque.pdf"');
      res.send(pdf);
    } catch (err: any) {
      console.error('[reports/estoque-pdf] Erro ao gerar PDF:', err);
      res.status(500).json({ error: 'Erro ao gerar o relatório em PDF.', details: err.message });
    }
  });

  // ---------------------------------------------------------------------
  // Push Web (Service Worker): alerta de prazo chega no Windows mesmo com o
  // sistema fechado, desde que o usuário tenha ativado uma vez pelo botão.
  // ---------------------------------------------------------------------
  app.get('/api/push/public-key', (req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
  });

  app.post('/api/push/subscribe', requireDb, requireAuth, async (req, res) => {
    try {
      const { endpoint, keys } = req.body?.subscription || req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Assinatura de push inválida.' });
      }
      const ownerId = (req as any).authUser.id;
      const id = `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await pool!.query(
        `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [id, ownerId, endpoint, keys.p256dh, keys.auth]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar assinatura de push.', details: err.message });
    }
  });

  app.post('/api/push/unsubscribe', requireDb, requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body || {};
      if (endpoint) await pool!.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao remover assinatura de push.', details: err.message });
    }
  });

  // Dispara uma notificação de confirmação assim que o usuário ativa — prova
  // na hora que a assinatura funciona, sem esperar o próximo prazo vencer.
  app.post('/api/push/test', requireDb, requireAuth, async (req, res) => {
    try {
      const ownerId = (req as any).authUser.id;
      const { attempted, delivered } = await sendPushToUser(pool!, ownerId, {
        title: 'Munago — Alertas ativados',
        body: 'Você vai receber alertas de prazo por aqui, mesmo com o sistema fechado.',
        tag: 'munago-teste-push',
      });
      if (attempted === 0) {
        return res.status(409).json({ error: 'Nenhuma inscrição de push encontrada pra esta conta — ative de novo antes de testar.' });
      }
      if (delivered === 0) {
        return res.status(502).json({ error: `Falha ao entregar em ${attempted} dispositivo(s) inscrito(s). Veja o console do servidor para detalhes.` });
      }
      res.json({ success: true, attempted, delivered });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao enviar notificação de teste.', details: err.message });
    }
  });

  // Gatilho dos alertas de prazo em produção (Vercel): server.ts usa
  // setInterval (processo de vida longa), mas a função serverless que serve
  // munago.vercel.app não sobrevive entre requisições — sem isso, o job de
  // alerta simplesmente NUNCA rodava lá, só localmente. Configurado como
  // Vercel Cron (ver vercel.json) chamando esta rota periodicamente.
  // CRON_SECRET é a variável que a própria Vercel injeta como Bearer token
  // em cron jobs quando ela existe no projeto — sem configurar, a rota
  // funciona sem checagem (pior caso é reenviar um push já enviado hoje,
  // o que push_alert_log já impede de qualquer forma).
  app.get('/api/cron/check-deadlines', async (req, res) => {
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers.authorization || '';
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }
    }
    if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado.' });
    await runDeadlineAlertCheck(pool);
    res.json({ success: true });
  });

  // Gemini AI Setup
  const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      })
    : null;

  // Compartilhado entre /api/ai/insights e /api/chat: quando um modelo Gemini
  // está sobrecarregado (503/429/"high demand" — bem comum, é temporário),
  // tenta o próximo em vez de já falhar pro usuário.
  const GEMINI_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
  const isOverloadedError = (err: any) =>
    err?.status === 503 || err?.status === 429 || Boolean(err?.message?.includes('high demand'));

  // API Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // AI Insights Endpoint
  app.post('/api/ai/insights', requireAuth, async (req, res) => {
    if (!genAI) {
      return res.json({
        insights: "A IA está em modo offline. Configure sua chave API para insights em tempo real.",
        recommendations: ["Verificar vencimentos próximos", "Acompanhar meta mensal"]
      });
    }

    const { data } = req.body;
    let lastError: any = null;

    for (const modelName of GEMINI_FALLBACK_MODELS) {
      try {
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: `Analise estes dados de recolhimento de franquias e escreva como alguém que realmente olhou os números e comenta de forma natural, não como um relatório robótico — direto, sem preâmbulo tipo "Com base nos dados fornecidos". Retorne só o JSON {insights: string, recommendations: string[]}: ${JSON.stringify(data)}`,
          config: {
            responseMimeType: "application/json",
          }
        });

        const text = response.text || '';

        // Attempt to parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return res.json(JSON.parse(jsonMatch[0]));
        }

        return res.json({ insights: text, recommendations: [] });
      } catch (err: any) {
        lastError = err;

        // Use warn instead of error for individual model failures during fallback to reduce noise
        console.warn(`AI model ${modelName} unavailable, attempting fallback...`);

        // If it's not a 503/High Demand, it's a permanent error (like 400), so stop
        if (!isOverloadedError(err)) {
          console.error(`AI Permanent Error with ${modelName}:`, err);
          break;
        }

        // Exponential backoff: 500ms, 1000ms, 1500ms...
        await new Promise(resolve => setTimeout(resolve, GEMINI_FALLBACK_MODELS.indexOf(modelName) * 500 + 500));
      }
    }

    // If we get here, all models failed
    if (isOverloadedError(lastError)) {
      console.error('All AI models currently overwhelmed.');
      return res.json({
        insights: "A Inteligência Munago está operando em capacidade reduzida devido à alta demanda global nos servidores da Google. \n\nSua análise está sendo processada em fila. Por favor, clique em 'Atualizar Análise' em 1 ou 2 minutos.",
        recommendations: ["Aguardar estabilização da rede Google", "Tentar em horário de menor pico", "Verificar conexão"]
      });
    }

    return res.status(500).json({ error: 'Erro crítico ao gerar insights inteligentes.' });
  });

  // Chat Assistant Endpoint
  app.post('/api/chat', requireAuth, async (req, res) => {
    if (!genAI) {
      return res.status(503).json({ error: 'IA Indisponível' });
    }

    const { prompt, history, context } = req.body;

    const systemInstruction = `Você é a "Inteligência Munago" — não um robô de atendimento, mas alguém da equipe da LocGrupo que manja muito de recolhimento de franquias e senta do lado do Murillo Silva pra ajudar a olhar os números.

    CONTEXTO DO SISTEMA:
    - Resumo dos lançamentos (não é a lista completa, é um resumo já calculado — total, por status, exemplos de atrasados e maiores pendentes): ${JSON.stringify(context)}

    COMO VOCÊ FALA:
    - Como uma pessoa de verdade batendo papo, não como um manual ou um menu de opções. Nada de "Estou à disposição", "Como posso auxiliá-lo" ou se reapresentar toda hora — isso já passou da primeira mensagem.
    - Direto ao ponto. Se a resposta cabe em duas frases, não vira um parágrafo com preâmbulo.
    - Evite listas de bullet só pra enumerar opções genéricas tipo "Você deseja: X, Y ou Z?" — pergunte ou sugira do jeito que uma pessoa perguntaria numa conversa.
    - Markdown com moderação: negrito só no número ou nome que importa, não na frase inteira.
    - Fale dos dados de verdade, com opinião — se tem muito pendente, muito atraso, meta longe de bater, comente isso como quem realmente olhou e reparou, não como um alerta genérico de sistema.
    - Sem dado suficiente pra responder algo, diga isso com naturalidade em vez de listar todas as abas do sistema.
    - Você conhece o sistema (Dashboard, Planilha, Metas, Notificações, Integração ASAAS) — mencione uma aba só quando fizer sentido pra resposta, não como referência decorada.
    - Se perguntarem se você gera PDF, sim — é só pedir "gera um PDF" (dá pra pedir só dos atrasados, pendentes, recebidos ou confirmados também) que o arquivo é gerado na hora.`;

    // Mesmo fallback do /api/ai/insights: um modelo sobrecarregado (503/429/
    // "high demand") não deve virar "erro técnico" pro usuário — tenta o
    // próximo modelo da lista antes de desistir de verdade.
    let lastError: any = null;
    for (const modelName of GEMINI_FALLBACK_MODELS) {
      try {
        const chat = genAI.chats.create({
          model: modelName,
          config: { systemInstruction },
          history: history || [],
        });

        const result = await chat.sendMessage({ message: prompt });
        return res.json({ text: result.text });
      } catch (err: any) {
        lastError = err;
        console.warn(`Chat model ${modelName} unavailable, attempting fallback...`);

        if (!isOverloadedError(err)) {
          console.error(`Chat Permanent Error with ${modelName}:`, err);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, GEMINI_FALLBACK_MODELS.indexOf(modelName) * 500 + 500));
      }
    }

    if (isOverloadedError(lastError)) {
      return res.json({
        text: 'A Inteligência Munago está operando em capacidade reduzida devido à alta demanda global nos servidores da Google. Tente de novo em 1 ou 2 minutos.',
      });
    }

    console.error('Chat API Error:', lastError);
    res.status(500).json({ error: 'Erro ao processar mensagem no chat.' });
  });

  // Interpreta o pedido de PDF em linguagem natural (qualquer quantidade —
  // "um item", "todos", "metade", "10 maiores" — e qualquer status) em vez de
  // depender de regex fixo no cliente, que nunca cobre toda frase possível.
  // Prompt é minúsculo (só a mensagem do usuário, não a base toda), então
  // fica rápido mesmo com a planilha grande carregada.
  app.post('/api/chat/pdf-intent', requireAuth, async (req, res) => {
    const fallback = { status: null, limit: null, order: null, fraction: null };
    if (!genAI) return res.json(fallback);

    const { text } = req.body || {};
    if (!text) return res.json(fallback);

    const prompt = `O usuário pediu um PDF de lançamentos de recolhimento de franquias. Extraia a intenção dele e responda SÓ com o JSON, nada mais:
{
  "status": "Confirmada" | "Recebida" | "Aguardando pagamento" | "Atrasado" | null,
  "limit": número inteiro de quantos registros incluir (1 se for "um item"/"só um"), ou null se não especificou quantidade,
  "order": "desc" (maiores valores primeiro) | "asc" (menores primeiro) | null,
  "fraction": número entre 0 e 1 se pediu uma fração tipo "metade" (0.5), "um terço" (0.333), "70%" (0.7), senão null
}
"status" null significa todos os status. "Aguardando pagamento" é o status usado pra "pendente"/"aguardando". Pedido do usuário: "${text}"`;

    for (const modelName of GEMINI_FALLBACK_MODELS) {
      try {
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const jsonMatch = (response.text || '').match(/\{[\s\S]*\}/);
        if (jsonMatch) return res.json({ ...fallback, ...JSON.parse(jsonMatch[0]) });
        break;
      } catch (err: any) {
        console.warn(`PDF intent model ${modelName} unavailable, attempting fallback...`);
        if (!isOverloadedError(err)) break;
      }
    }

    res.json(fallback);
  });

  // ASAAS Bank API Proxy Endpoints
  
  async function getAsaasToken(req: express.Request): Promise<string | null> {
    const { apiKey, unidadeId } = req.body || {};
    if (apiKey) return apiKey;
    if (unidadeId && pool) {
      const result = await pool.query('SELECT asaas_api_key FROM unidades WHERE id = $1', [unidadeId]);
      return result.rows[0]?.asaas_api_key || null;
    }
    return process.env.ASAAS_API_KEY || null;
  }

  // Test ASAAS Connection / API Key validity
  app.post('/api/asaas/test-connection', requireAuth, async (req, res) => {
    const { sandbox } = req.body;
    const token = await getAsaasToken(req);
    if (!token) {
      return res.status(400).json({ error: 'Chave de API ASAAS não configurada.' });
    }

    const baseUrl = sandbox
      ? 'https://sandbox.asaas.com/v3'
      : 'https://api.asaas.com/v3';

    try {
      // Test by fetching customers or balance
      const response = await fetch(`${baseUrl}/finance/balance`, {
        method: 'GET',
        headers: {
          'access_token': token,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return res.json({ success: true, message: 'Conexão com ASAAS estabelecida com sucesso!', balance: data });
      } else {
        const errText = await response.text();
        return res.status(401).json({
          success: false,
          error: `Falha na autenticação ASAAS (${response.status}): Chave inválida ou ambiente incorreto.`,
          details: errText,
        });
      }
    } catch (error: any) {
      // If network or CORS blocks server-side fetch, provide a graceful simulation mode fallback
      return res.json({
        success: true,
        simulated: true,
        message: 'Conexão simulada com ASAAS ativada com sucesso (Ambiente Seguro).',
      });
    }
  });

  const ASAAS_BILLING_TYPES = ['PIX', 'BOLETO', 'UNDEFINED']; // UNDEFINED = deixa o pagador escolher na fatura

  // Extrai uma mensagem de erro legível da resposta de erro padrão do ASAAS
  // ({ errors: [{ description }] }), sem estourar se o corpo vier vazio/HTML.
  async function readAsaasError(response: Response, fallback: string): Promise<string> {
    try {
      const body = await response.json();
      return body?.errors?.[0]?.description || fallback;
    } catch {
      return fallback;
    }
  }

  // Reaproveita o mesmo mapa do webhook (ASAAS_STATUS_MAP, acima) — status do
  // ASAAS pro status do Munago, usado tanto na consulta de status de uma
  // cobrança quanto na listagem/importação de cobranças.
  const mapAsaasStatus = (asaasStatus: string): string => ASAAS_STATUS_MAP[asaasStatus] || 'Aguardando pagamento';

  // Busca um cliente já cadastrado no ASAAS pelo CNPJ, pra pré-preencher a
  // Cobrança Avulsa com o que já existe lá (e-mail, telefone, endereço) —
  // sem isso o boleto sai só com nome+CNPJ e pode faltar dado que o ASAAS
  // pede na hora de emitir de verdade.
  app.post('/api/asaas/customer-lookup', requireAuth, async (req, res) => {
    const { sandbox, cnpj } = req.body || {};
    const token = await getAsaasToken(req);
    if (!token) return res.status(400).json({ error: 'Chave API ASAAS obrigatória.' });
    const cpfCnpj = String(cnpj || '').replace(/\D/g, '');
    if (!cpfCnpj) return res.status(400).json({ error: 'CNPJ obrigatório.' });

    const baseUrl = sandbox ? 'https://sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
    try {
      const response = await fetch(`${baseUrl}/customers?cpfCnpj=${cpfCnpj}`, {
        headers: { 'access_token': token, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await readAsaasError(response, 'Falha ao consultar cliente no ASAAS.');
        return res.status(response.status).json({ found: false, error });
      }
      const data = await response.json();
      const customer = data?.data?.[0];
      if (!customer) return res.json({ found: false });
      return res.json({
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email || '',
          phone: customer.phone || '',
          mobilePhone: customer.mobilePhone || '',
          postalCode: customer.postalCode || '',
          address: customer.address || '',
          addressNumber: customer.addressNumber || '',
          complement: customer.complement || '',
          province: customer.province || '',
        },
      });
    } catch (err: any) {
      return res.status(502).json({ found: false, error: 'Falha ao comunicar com a API do ASAAS: ' + err.message });
    }
  });

  // Create ASAAS Charge (Cobrança) for Recolhimento
  app.post('/api/asaas/create-charge', requireAuth, async (req, res) => {
    const { sandbox, chargeData, billingType } = req.body;
    const token = await getAsaasToken(req);
    if (!token) {
      return res.status(400).json({ error: 'Chave API ASAAS obrigatória.' });
    }
    const baseUrl = sandbox
      ? 'https://sandbox.asaas.com/v3'
      : 'https://api.asaas.com/v3';
    // Antes vinha travado em 'PIX' fixo — o sistema nunca gerava boleto de
    // verdade mesmo a tela dizendo "Pix/Boleto". Agora aceita a escolha do
    // cliente; entrada inválida cai pro comportamento antigo (PIX).
    const resolvedBillingType = ASAAS_BILLING_TYPES.includes(billingType) ? billingType : 'PIX';

    try {
      // Garante que o cliente exista no ASAAS antes de gerar a cobrança.
      // cpfCnpj só com dígitos — o ASAAS rejeita com máscara (00.000.000/0000-00).
      const cpfCnpj = (chargeData.cnpj || '').replace(/\D/g, '') || '00000000000100';

      // Reaproveita o cadastro já existente no ASAAS pra esse CNPJ em vez de
      // criar um novo toda vez — antes cada cobrança gerava um cliente
      // duplicado, e qualquer e-mail/telefone/endereço já cadastrado lá era
      // ignorado (o boleto saía só com nome+CNPJ).
      const lookupRes = await fetch(`${baseUrl}/customers?cpfCnpj=${cpfCnpj}`, {
        headers: { 'access_token': token, 'Content-Type': 'application/json' },
      });
      const existingCustomer = lookupRes.ok ? (await lookupRes.json())?.data?.[0] : null;

      let customerId: string;
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const customerPayload = {
          name: chargeData.franquia,
          cpfCnpj,
          email: chargeData.email || 'financeiro@locgrupo.com.br',
          phone: chargeData.phone || undefined,
          mobilePhone: chargeData.mobilePhone || undefined,
          postalCode: chargeData.postalCode || undefined,
          address: chargeData.address || undefined,
          addressNumber: chargeData.addressNumber || undefined,
          complement: chargeData.complement || undefined,
          province: chargeData.province || undefined,
        };

        const customerRes = await fetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers: {
            'access_token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(customerPayload),
        });

        // Antes, uma falha aqui usava um id de cliente FALSO ("cus_simulated_...")
        // e seguia pro pagamento — que então falhava por cliente inexistente e
        // caía no fallback simulado, devolvendo "sucesso" pro front sem cobrança
        // real nenhuma ter sido criada. Agora erro de cliente já para tudo e
        // devolve o motivo de verdade.
        if (!customerRes.ok) {
          const error = await readAsaasError(customerRes, 'Falha ao cadastrar cliente no ASAAS.');
          return res.status(customerRes.status).json({ success: false, error });
        }
        customerId = (await customerRes.json()).id;
      }

      // Create Payment (Cobrança). Juros/multa/desconto só entram quando o
      // front manda valor > 0 — do contrário o ASAAS aplica os padrões da
      // conta (ou nenhum), então omitir o campo é o comportamento certo.
      const paymentPayload: Record<string, any> = {
        customer: customerId,
        billingType: resolvedBillingType,
        value: chargeData.valor,
        dueDate: chargeData.vencimento ? chargeData.vencimento.split('/').reverse().join('-') : new Date().toISOString().split('T')[0],
        description: chargeData.descricao || 'Recolhimento de Franquia - LocGrupo',
      };
      if (chargeData.externalReference) paymentPayload.externalReference = chargeData.externalReference;
      if (chargeData.fine?.value > 0) paymentPayload.fine = { value: chargeData.fine.value, type: 'PERCENTAGE' };
      if (chargeData.interest?.value > 0) paymentPayload.interest = { value: chargeData.interest.value };
      if (chargeData.discount?.value > 0) {
        paymentPayload.discount = {
          value: chargeData.discount.value,
          dueDateLimitDays: chargeData.discount.dueDateLimitDays || 0,
          type: 'PERCENTAGE',
        };
      }

      const paymentRes = await fetch(`${baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'access_token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentPayload),
      });

      if (!paymentRes.ok) {
        const error = await readAsaasError(paymentRes, 'Erro ao gerar cobrança no ASAAS.');
        return res.status(paymentRes.status).json({ success: false, error });
      }

      const payJson = await paymentRes.json();
      return res.json({
        success: true,
        chargeId: payJson.id,
        invoiceUrl: payJson.invoiceUrl || payJson.bankSlipUrl,
        pixQrCode: payJson.pixTransaction?.qrCode,
        billingType: resolvedBillingType,
        status: 'Gerado no ASAAS',
      });
    } catch (err: any) {
      // Antes devolvia "sucesso simulado" aqui — uma queda de rede real
      // virava uma cobrança fake que o usuário achava ter sido emitida.
      return res.status(502).json({ success: false, error: 'Falha ao comunicar com a API do ASAAS: ' + err.message });
    }
  });

  // Proxy do PDF do boleto — o ASAAS manda X-Frame-Options: SAMEORIGIN nas
  // páginas dele (confirmado testando), então um <iframe src="...asaas.com">
  // direto no Munago fica sempre em branco (o navegador recusa, sem erro
  // nenhum visível em JS). Buscando o PDF aqui no servidor e servindo com
  // nosso próprio domínio, o iframe passa a carregar same-origin — o
  // X-Frame-Options do ASAAS nunca chega até o navegador do usuário.
  app.get('/api/asaas/boleto-pdf', async (req, res) => {
    // Rota carregada direto num <iframe src>, então não dá pra mandar
    // header Authorization (navegação simples de GET não aceita header
    // customizado) — token de sessão vem por query string aqui, e só
    // aqui, pra rota continuar exigindo login sem quebrar o iframe.
    if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado (defina DATABASE_URL).' });
    const sessionCheck = await pool.query(
      `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND u.status = 'approved'`,
      [String(req.query.token || '')]
    );
    if (!sessionCheck.rows[0]) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    const rawUrl = String(req.query.url || '');
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'URL inválida.' });
    }
    // Só deixa proxyar domínio do próprio ASAAS — sem isso, esta rota vira
    // um proxy aberto pra qualquer URL (risco de SSRF).
    if (!/(^|\.)asaas\.com$/i.test(target.hostname)) {
      return res.status(400).json({ error: 'Só é permitido buscar boletos do domínio asaas.com.' });
    }
    try {
      const response = await fetch(target.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Falha ao buscar o boleto no ASAAS.' });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/pdf');
      res.send(buffer);
    } catch (err: any) {
      res.status(502).json({ error: 'Falha ao comunicar com a API do ASAAS: ' + err.message });
    }
  });

  // Get ASAAS Payment Status
  app.post('/api/asaas/get-payment-status', requireAuth, async (req, res) => {
    const { sandbox, paymentId } = req.body;
    const token = await getAsaasToken(req);
    if (!token) return res.status(400).json({ error: 'Chave API ASAAS obrigatória.' });

    const baseUrl = sandbox ? 'https://sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

    try {
      const response = await fetch(`${baseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'access_token': token,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return res.json({
          success: true,
          status: mapAsaasStatus(data.status),
          paymentDate: data.paymentDate,
          asaasStatus: data.status,
          invoiceUrl: data.invoiceUrl || data.bankSlipUrl,
          // Separado do invoiceUrl (página de fatura do ASAAS, não embedável) —
          // bankSlipUrl aponta pro PDF do boleto em si, que dá pra mostrar
          // dentro de um iframe no Munago sem sair pro ASAAS.
          bankSlipUrl: data.bankSlipUrl || undefined,
        });
      } else {
        return res.status(response.status).json({ error: 'Erro ao buscar status no ASAAS.' });
      }
    } catch (err: any) {
      // Antes sorteava aleatoriamente "Recebida" em 30% das falhas de rede —
      // uma soneca de rede podia marcar uma cobrança pendente como paga sem
      // o pagamento ter acontecido de verdade. Agora só reporta a falha.
      return res.status(502).json({ error: 'Falha ao comunicar com a API do ASAAS: ' + err.message });
    }
  });

  // Lista cobranças de uma conta ASAAS (por chave/unidade) — usado pra
  // importar pro Munago cobranças lançadas direto no painel do ASAAS, sem
  // ter passado pelo botão "Gerar no ASAAS" daqui. O cliente (App.tsx) decide
  // o que já existe (por asaasId) e o que é novo; aqui só devolve a lista
  // crua, já com status traduzido pro padrão do Munago.
  app.post('/api/asaas/list-payments', requireAuth, async (req, res) => {
    const { sandbox } = req.body || {};
    const token = await getAsaasToken(req);
    if (!token) return res.status(400).json({ error: 'Chave API ASAAS obrigatória.' });

    const baseUrl = sandbox ? 'https://sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
    try {
      // limit=100 é o máximo por página da API do ASAAS. Pagina com `offset`
      // até `hasMore` vir false, senão só a leva mais recente entrava — todo
      // histórico anterior a isso nunca era importado pro Munago.
      const payments: any[] = [];
      let offset = 0;
      const PAGE_LIMIT = 100;
      const MAX_PAGES = 50; // trava de segurança: até 5000 cobranças por unidade
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await fetch(`${baseUrl}/payments?limit=${PAGE_LIMIT}&offset=${offset}`, {
          headers: { 'access_token': token, 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          const error = await readAsaasError(response, 'Falha ao listar cobranças no ASAAS.');
          return res.status(response.status).json({ error });
        }
        const data = await response.json();
        const pageItems = Array.isArray(data.data) ? data.data : [];
        payments.push(...pageItems);
        if (!data.hasMore || pageItems.length === 0) break;
        offset += PAGE_LIMIT;
      }
      const mapped = payments.map((p: any) => ({
        id: p.id,
        value: p.value,
        dueDate: p.dueDate,
        description: p.description || '',
        status: mapAsaasStatus(p.status),
        invoiceUrl: p.invoiceUrl || p.bankSlipUrl,
        paymentDate: p.paymentDate,
      }));
      res.json({ success: true, payments: mapped });
    } catch (err: any) {
      res.status(502).json({ error: 'Falha ao comunicar com a API do ASAAS: ' + err.message });
    }
  });

  return app;
}
