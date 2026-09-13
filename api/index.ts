import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/server/app.js';

// Função serverless única que recebe TODO /api/* (ver rewrite em vercel.json).
// O app Express é montado uma vez e reaproveitado entre chamadas na mesma
// instância "quente" da função — evita recriar rotas/reconectar o banco a
// cada requisição.
let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
