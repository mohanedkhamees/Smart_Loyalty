# Smart Loyalty

Independent multi-tenant SaaS for digital stamp card loyalty programs.

Local businesses create stamp cards; customers hold one central account and collect stamps across branches. Stamps are issued by authorized staff only. Apple Wallet / Google Wallet come later; MVP uses a Wallet Simulator.

## Repository layout

| Path | Purpose |
|------|---------|
| [`docs/`](docs/) | Phase 0 product and technical documentation |
| [`smart-loyalty/`](smart-loyalty/) | Next.js application (App Router) |

## Documentation

Start here:

1. [Product Requirements](docs/01_PRD.md)
2. [System Architecture](docs/02_System_Architecture.md)
3. [Database Design](docs/03_Database_Design.md)
4. [User Roles and Permissions](docs/04_User_Roles_and_Permissions.md)
5. [User Flows](docs/05_User_Flows.md)
6. [Wallet Integration](docs/06_Wallet_Integration.md)
7. [Security and GDPR](docs/07_Security_and_GDPR.md)
8. [Subscription and Pricing](docs/08_Subscription_and_Pricing.md)
9. [Development Roadmap](docs/09_Development_Roadmap.md)
10. [Free Infrastructure and Costs](docs/10_Free_Infrastructure_and_Costs.md)

## Stack (application)

- Node.js 24 LTS (see [`.nvmrc`](.nvmrc))
- Next.js 16, React 19, TypeScript, Tailwind CSS 4

## Local development

```bash
# Use Node 24
nvm use

cd smart-loyalty
npm install
cp ../.env.example .env.local   # placeholders only
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts (in `smart-loyalty/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run build` | Production build |

## Status

Phase 1A: repository foundation and minimal application shell.  
Prisma, Supabase Auth, tenancy, and dashboards are not implemented yet.
