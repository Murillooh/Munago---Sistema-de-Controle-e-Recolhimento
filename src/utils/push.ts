// Lógica de inscrição de push compartilhada entre o botão flutuante
// (BrowserNotifications) e o teste manual da Central de Alertas
// (NotificationsView) — as duas telas precisam do mesmo fluxo (registrar
// service worker, pegar a chave VAPID, assinar, mandar pro servidor) e não
// faz sentido cada uma reimplementar isso do zero.

// VAPID vem em base64url; a Push API do navegador quer Uint8Array.
export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type EnsurePushSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no-token' | 'no-vapid' | 'subscribe-failed' | 'server-rejected'; details?: string };

// Uma PushSubscription fica permanentemente amarrada à applicationServerKey
// (VAPID pública) usada na hora do subscribe() — não dá pra "atualizar" a
// chave de uma assinatura existente, só descartar e assinar de novo. Sem
// essa checagem, girar a chave VAPID no servidor deixa toda assinatura
// antiga inválida pra sempre: o navegador continua reaproveitando o mesmo
// objeto de sempre (getSubscription() não sabe nada de chave nova),
// mandando pro servidor uma assinatura que nunca mais vai validar — o envio
// falha (400/401/403), a linha morta é limpa, e ninguém percebe porque o
// front nunca chega a saber que o envio de verdade falhou.
function sameApplicationServerKey(existing: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  if (bytes.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[i] !== expected[i]) return false;
  }
  return true;
}

// Garante que o navegador tem uma inscrição de push ativa (com a chave VAPID
// atual) e registrada no servidor. Idempotente: se já existe assinatura com
// a mesma chave, só reaproveita; se a chave mudou, descarta e recria.
export async function ensurePushSubscription(sessionToken: string | null): Promise<EnsurePushSubscriptionResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!sessionToken) {
    return { ok: false, reason: 'no-token' };
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const keyRes = await fetch('/api/push/public-key');
    const { publicKey } = await keyRes.json();
    if (!publicKey) return { ok: false, reason: 'no-vapid' };
    const expectedKey = urlBase64ToUint8Array(publicKey);

    let subscription = await reg.pushManager.getSubscription();
    if (subscription && !sameApplicationServerKey(subscription.options?.applicationServerKey, expectedKey)) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey,
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ subscription }),
    });
    if (!res.ok) return { ok: false, reason: 'server-rejected' };

    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao ativar push:', err);
    return { ok: false, reason: 'subscribe-failed', details: err?.message };
  }
}

// Preferência por navegador de receber alertas de prazo. Desligado = sem
// push (inscrição cancelada aqui e no servidor), sem alerta local com a aba
// aberta e sem o botão flutuante pedindo pra ativar. Evento avisa os outros
// componentes montados (botão flutuante x Central de Alertas) na hora.
const ALERTS_DISABLED_KEY = 'munago_alerts_disabled';
export const ALERTS_PREF_EVENT = 'munago-alerts-pref';

export function areAlertsDisabled(): boolean {
  try {
    return localStorage.getItem(ALERTS_DISABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAlertsDisabled(disabled: boolean) {
  try {
    if (disabled) localStorage.setItem(ALERTS_DISABLED_KEY, 'true');
    else localStorage.removeItem(ALERTS_DISABLED_KEY);
  } catch {
    // storage bloqueado — vale só pra esta sessão via evento
  }
  window.dispatchEvent(new CustomEvent(ALERTS_PREF_EVENT, { detail: { disabled } }));
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

// Cancela a inscrição de push deste navegador e remove do servidor — sem
// isso o servidor continuaria mandando alertas pro endpoint antigo.
export async function disablePushSubscription(sessionToken: string | null): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  if (sessionToken) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
  }
  await subscription.unsubscribe().catch(() => {});
}
