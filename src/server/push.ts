import webpush from 'web-push';
import type { Pool } from 'pg';

// VAPID identifica o servidor pro serviço de push do navegador (é o mesmo
// par de chaves sempre — se mudar, toda assinatura antiga para de funcionar).
// Em produção, defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no ambiente com um
// par gerado uma única vez (ex: `npx web-push generate-vapid-keys`).
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';

export function configureWebPush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    console.warn(
      '[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas — gerando um par temporário.\n' +
      '[push] Isso funciona para este boot, mas some no próximo restart e invalida as assinaturas.\n' +
      '[push] Para produção, defina no .env:\n' +
      `[push] VAPID_PUBLIC_KEY="${generated.publicKey}"\n` +
      `[push] VAPID_PRIVATE_KEY="${generated.privateKey}"`
    );
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:muurisattos@gmail.com',
      generated.publicKey,
      generated.privateKey
    );
    return;
  }

  vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:muurisattos@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

// Assinatura permanentemente inválida — nunca vai funcionar de novo, então
// não faz sentido guardar nem tentar reenviar pra ela depois. 404/410 = o
// próprio navegador cancelou. 400/401/403 = credencial (VAPID) não bate mais
// com a que gerou essa assinatura — acontece sempre que a chave VAPID é
// trocada/rotacionada (assinaturas antigas nunca revalidam sozinhas).
const PERMANENTLY_INVALID_STATUS_CODES = [400, 401, 403, 404, 410];

// Manda a notificação pra todos os dispositivos inscritos do usuário; remove
// do banco qualquer assinatura permanentemente inválida. Devolve quantas
// realmente foram entregues — sem isso, quem chama isto (ex: /api/push/test)
// não tinha como saber que "terminou sem exceção" não é o mesmo que "chegou
// em algum dispositivo de verdade" (podia não ter nenhuma assinatura, ou
// todas falharem, e ainda assim reportar sucesso).
export async function sendPushToUser(
  pool: Pool,
  userId: string,
  payload: PushPayload
): Promise<{ attempted: number; delivered: number }> {
  const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

  const results = await Promise.all(
    rows.map(async (row): Promise<boolean> => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return true;
      } catch (err: any) {
        if (PERMANENTLY_INVALID_STATUS_CODES.includes(err.statusCode)) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]).catch(() => {});
        } else {
          console.error('[push] Falha ao enviar notificação:', err.message || err);
        }
        return false;
      }
    })
  );

  return { attempted: rows.length, delivered: results.filter(Boolean).length };
}

const parseVencimento = (v: string): Date | null => {
  if (!v) return null;
  const parts = v.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return isNaN(d.getTime()) ? null : d;
};

// Checa lançamentos vencendo em até 2 dias ou já atrasados, e manda um push
// por lançamento (no máximo um por dia, via push_alert_log). Uma execução só
// — quem dispara repetidamente é o chamador (setInterval no server.ts local,
// ou o cron da Vercel em produção via /api/cron/check-deadlines).
export async function runDeadlineAlertCheck(pool: Pool): Promise<void> {
  try {
    const { rows: items } = await pool.query(
      `SELECT id, franquia, valor, vencimento, status, owner_id
       FROM recolhimentos
       WHERE status IN ('Aguardando pagamento', 'Atrasado') AND owner_id IS NOT NULL`
    );

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    for (const item of items) {
      const due = parseVencimento(item.vencimento);
      if (!due) continue;
      const diffDays = (due.getTime() - now.getTime()) / (1000 * 3600 * 24);
      if (diffDays > 2) continue; // ainda longe do vencimento

      const already = await pool.query(
        'SELECT 1 FROM push_alert_log WHERE item_id = $1 AND alert_date = $2',
        [item.id, today]
      );
      if (already.rows.length > 0) continue;

      const overdue = diffDays < 0 || item.status === 'Atrasado';
      await sendPushToUser(pool, item.owner_id, {
        title: overdue ? 'Munago — Recolhimento atrasado' : 'Munago — Recolhimento vencendo',
        body: `${item.franquia}: R$ ${Number(item.valor).toFixed(2)} ${overdue ? 'está atrasado' : `vence em ${item.vencimento}`}.`,
        tag: `prazo-${item.id}`,
        url: '/',
      });

      await pool.query(
        'INSERT INTO push_alert_log (item_id, alert_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [item.id, today]
      );
    }
  } catch (err) {
    console.error('[push] Erro ao checar prazos:', err);
  }
}

// Uso local (server.ts, processo de vida longa) — na Vercel um setInterval
// não sobrevive entre invocações da função serverless, por isso lá o
// gatilho é o cron (/api/cron/check-deadlines), não esta função.
export function startDeadlineAlertJob(pool: Pool, intervalMs = 30 * 60 * 1000) {
  runDeadlineAlertCheck(pool);
  return setInterval(() => runDeadlineAlertCheck(pool), intervalMs);
}
