# Munago — Sistema de Controle e Recolhimento

Sistema interno da LocGrupo para gestão de recolhimentos de franquias: planilha de lançamentos, dashboard financeiro, metas, notificações, integração bancária ASAAS (PIX/Boleto) e assistente de IA (Gemini).

## Funcionalidades

- **Dashboard** — visão geral de total, confirmado, em aberto e evolução mensal.
- **Planilha** — CRUD completo de lançamentos, filtros, importação/exportação (Excel e PDF), colunas configuráveis.
- **Gestão de Bases** — unidades (franquias) e categorias mestras, cada unidade com sua própria chave de API ASAAS.
- **Metas** — metas gerais e detalhadas, acompanhamento de progresso.
- **Notificações** — alertas de vencimento, atraso e meta mensal.
- **Integração ASAAS** — geração de cobranças PIX/Boleto, sincronização de status, webhook para atualização automática quando o pagamento é confirmado.
- **Relatórios personalizados** — exportação configurável (colunas, período, status).
- **Autenticação com aprovação** — cadastro fica pendente até um administrador aprovar; o primeiro usuário cadastrado vira admin automaticamente.
- **Isolamento de dados por usuário** — cada conta só acessa seus próprios lançamentos.
- **Assistente de IA** — chat e insights automáticos via Gemini.

## Rodando localmente

**Pré-requisitos:** Node.js

1. Instalar dependências:
   ```
   npm install
   ```
2. Copiar `.env.example` para `.env` e preencher as variáveis necessárias (veja abaixo).
3. Rodar o app:
   ```
   npm run dev
   ```

O servidor sobe em `http://localhost:3000`.

## Variáveis de ambiente

Veja [.env.example](.env.example) para a lista completa. Resumo:

| Variável | Obrigatória? | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | Não | Habilita chat e insights de IA. Sem ela, o sistema funciona em modo offline de IA. |
| `DATABASE_URL` | Não | Connection string Postgres (Supabase, AWS RDS, Cloud SQL etc). Sem ela, os dados ficam só no `localStorage` do navegador. |
| `ASAAS_WEBHOOK_TOKEN` | Não | Valida o webhook do ASAAS (header `asaas-access-token`). Recomendado quando `DATABASE_URL` está configurada. |
| `APP_URL` | Não | URL pública do app, usada em links e callbacks. |

### Banco de dados (opcional, recomendado em produção)

Com `DATABASE_URL` configurada:
- Lançamentos passam a ser persistidos no Postgres, isolados por usuário.
- Cadastro de contas fica real (senha com hash), com fila de aprovação de admin.
- O webhook do ASAAS (`/api/asaas/webhook`) atualiza o status do lançamento automaticamente quando o pagamento é confirmado — configure a URL no painel ASAAS em Configurações > Webhooks.

Sem `DATABASE_URL`, o sistema continua funcionando normalmente com os dados salvos apenas no navegador.

## Build de produção

```
npm run build
npm start
```

## Stack

React 19, Vite, Tailwind CSS, Express, Recharts, dnd-kit, Postgres (`pg`), `bcryptjs`, `@google/genai`.
