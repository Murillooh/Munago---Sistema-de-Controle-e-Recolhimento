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

// Manda a notificação pra todos os dispositivos inscritos do usuário; remove
// do banco qualquer assinatura que o navegador já invalidou (410/404).
export async function sendPushToUser(pool: Pool, userId: string, payload: PushPayload) {
  const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

  await Promise.all(
    rows.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]).catch(() => {});
        } else {
          console.error('[push] Falha ao enviar notificação:', err.message || err);
        }
      }
    })
  );
}

const parseVencimento = (v: string): Date | null => {
  if (!v) return null;
  const parts = v.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return isNaN(d.getTime()) ? null : d;
};

// Checa periodicamente lançamentos vencendo em até 2 dias ou já atrasados, e
// manda um push por lançamento (no máximo um por dia, via push_alert_log).
// É isso que faz o alerta chegar mesmo com o sistema fechado — o gatilho
// mora aqui no servidor, não no navegador do usuário.
export function startDeadlineAlertJob(pool: Pool, intervalMs = 30 * 60 * 1000) {
  const check = async () => {
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
  };

  check();
  return setInterval(check, intervalMs);
}
