# Munago — instruções para o Claude Code

## Regra obrigatória: skill + aprovação antes de mexer em áreas sensíveis

Antes de qualquer mudança em uma destas áreas:

- **UI/UX** (telas, componentes, cores, layout, acessibilidade)
- **Banco de dados** (schema, queries, migrations, pool de conexões, `src/server/db.ts`)
- **Segurança** (autenticação, sessões, permissões, rotas da API, chaves, dados sensíveis)
- **Configuração** (`vercel.json`, `vite.config.ts`, variáveis de ambiente, dependências, deploy)

siga este fluxo:

1. Procure a skill mais adequada em `.claude/skills/` (lista abaixo). Se nenhuma servir,
   procure nas skills globais disponíveis.
2. **Antes de executar**, mostre ao usuário um resumo curto:
   - qual skill vai usar e por quê;
   - o que essa skill faz / quais práticas ela aplica;
   - o que exatamente será alterado.
3. **Só execute depois que o usuário der permissão explícita.** Sem resposta = não executa.

Correções triviais fora dessas áreas (texto, typo, log) não precisam desse fluxo.

## Skills do projeto (`.claude/skills/`, só nesta máquina — fora do git)

| Área | Skills |
|---|---|
| UI/UX | `ui-design-system`, `frontend-design`, `react-best-practices`, `react-ui-patterns`, `baseline-ui`, `radix-ui-design-system` |
| Banco (Postgres/RDS) | `postgresql`, `postgres-best-practices`, `postgresql-optimization`, `database-migration`, `database-design`, `database-optimizer` |
| Segurança | `api-security-best-practices`, `backend-security-coder`, `frontend-security-coder`, `auth-implementation-patterns`, `cc-skill-security-review`, `broken-authentication` |
| Backend / Config / Deploy | `nodejs-backend-patterns`, `nodejs-best-practices`, `api-design-principles`, `deployment-engineer`, `deployment-validation-config-validate` |

Origem: `C:\Users\Murillo Silva\.gemini\skills` (coleção completa, ~1.000 skills). Para
trazer outra skill de lá, copie a pasta dela para `.claude/skills/` e atualize esta tabela.

## Contexto do projeto

- Front: React + Vite + Tailwind. Back: Express em função serverless única na Vercel (`api/index.ts` → `src/server/app.ts`). Banco: Postgres no AWS RDS (`pool` em `src/server/db.ts`, `max: 3` por instância).
- Commits vão direto na `main` (sem branch/PR); push dispara deploy de produção na Vercel.
- Paleta do app: slate + azul→índigo (`from-blue-600 to-indigo-600`); dourado não é mais usado nas telas.
