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

// Garante que o navegador tem uma inscrição de push ativa e registrada no
// servidor. Idempotente: se já existe assinatura, só reaproveita.
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

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
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
