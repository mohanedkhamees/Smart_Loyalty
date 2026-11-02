# Smart Loyalty – Free Infrastructure and Costs

**Document:** 10_Free_Infrastructure_and_Costs  
**Phase:** 0 (Documentation – refined)  
**Status:** Draft for approval  
**Last updated:** 2026-11-01 (verified integrity pass)

---

## 1. Purpose

Clarify what can run on free tiers for **development** and **testing**, what is required for **commercial production**, and which services **require payment**. Vendor quotas and terms change — verify before committing.

**Do not promise zero-cost commercial operation.**

---

## 2. Guiding rules

1. Prefer free plans for initial development and testing.  
2. **No paid APIs or subscriptions without explicit approval.**  
3. Wallet Simulator instead of Apple/Google.  
4. No Stripe **live** charges in MVP.  
5. Supabase Free for initial development; Postgres in the **EU**, preferably **Frankfurt if available**.  
6. Next.js + TypeScript + Prisma with **connection pooling**.  
7. GitHub for source control.  
8. Vercel **only where its current terms permit the intended usage**.

---

## 3. Four environments (distinguish clearly)

| Mode | Intent | Typical stack | Cost expectation |
|------|--------|---------------|------------------|
| **Free development** | Local + preview builds; engineers iterate | Local Next.js; Supabase Free; GitHub; Wallet Simulator | Aim for €0 platform fees |
| **Free testing** | Shared demo/staging for QA | Supabase Free; host preview if ToS allows; Simulator | Aim for €0; watch pause/limits |
| **Commercial production** | Real businesses, real customers, possibly paid plans | Likely paid Supabase; host plan that **allows commercial SaaS**; custom domain; monitoring | **Not zero-cost** in general |
| **Paid-required services** | Cannot be honestly replaced by free forever | Apple Developer, Google Wallet issuer, Stripe live fees, production email/SMS, maps/geofence vendors | Requires approval + budget |

---

## 4. Recommended components

| Concern | Free development / testing | Commercial production | Requires payment? |
|---------|----------------------------|----------------------|-------------------|
| Source control | GitHub Free | GitHub (plan as needed) | Usually free for private small teams; confirm |
| App framework | Next.js + TypeScript | Same | No (OSS) |
| ORM | Prisma + **Supabase pooler** (or equivalent) | Same + hardened pooling | Prisma OSS free; pooler/Accelerate may have tiers |
| DB + Auth | Supabase Free, EU/Frankfurt if available | Supabase Pro (typical) when size, pause, or support requires | Free for early; **paid likely in production** |
| App hosting | Candidate: Vercel Hobby **if terms allow** non-commercial/dev use | Vercel Pro or alternative host whose ToS allow SaaS | Hobby often unsuitable for commercial SaaS — **verify ToS** |
| Wallets | Simulator | Apple / Google when approved | Simulator free; real wallets **paid** |
| Payments | Manual subscription rows | Stripe live | Test mode free; live has fees |
| Email | Supabase Auth email | Custom SMTP often required | Custom SMTP usually paid |

---

## 5. Vercel usage caveat

Vercel is **not** assumed allowed for every usage mode:

- Use for development/preview only after confirming current Hobby terms.  
- Before commercial production traffic or paid customers, **re-read Vercel terms** and upgrade or choose another host if required.  
- Documentation must not claim “free Vercel forever for SaaS production.”

---

## 6. Supabase + Prisma pooling (mandatory design)

Free Supabase **direct** connection limits are too low for typical serverless Next.js.

**Requirement:** from Phase 1, Prisma `DATABASE_URL` must use Supabase’s **connection pooler** (e.g. transaction mode) or an approved equivalent. Document both pooled and direct URLs in env docs at implementation time.

---

## 7. Typical free-tier limitation categories

### Vercel (Hobby – verify current)

Commercial use restrictions; function duration; cron limits; build/bandwidth caps.

### Supabase Free

DB size; egress; auth email rate limits; connection limits; project pause on inactivity; confirm Frankfurt on free.

### Apple / Google Wallet

**Not** available as free production issuance. Use Simulator until paid accounts approved.

### Stripe

Test mode for development when billing phase starts; live mode needs activated account and incurs fees.

---

## 8. Cost posture by phase (illustrative)

| Phase | Platform cash cost | Notes |
|-------|--------------------|-------|
| 0 Docs | €0 | |
| 1–3 Foundation + Simulator | Aim €0 | Free Supabase + free-eligible hosting; may break if projects pause |
| 4 Stripe test | €0 fees | Live fees later |
| 5 Real wallets | Paid Apple (+ Google usage) | Explicit approval |
| Commercial launch | **Expect paid DB/host** | Do not promise €0 |

---

## 9. Engineering practices

1. Pool Prisma connections.  
2. Feature-flag Apple/Google/Stripe.  
3. Simulator updates in-request.  
4. Small seeds; prune test tenants.  
5. No secrets in git.  
6. No paid API keys in the project without approval.  
7. Revisit host ToS before first paying tenant.

---

## 10. Unresolved cost decisions

1. Production host: Vercel Pro vs alternative (if Hobby ToS unsuitable for intended usage).  
2. Confirm Frankfurt on the chosen Supabase free project.  
3. Timeline/budget for Apple Developer / Google Wallet issuer (explicit approval required).  
4. Manual invoicing for pilot tenants vs wait for Stripe.  
5. Whether any paid observability/email provider is approved before commercial launch.

**Note:** Subscription package **prices remain placeholders** (see `08_Subscription_and_Pricing.md`); this document does not finalize commercial pricing. Loyalty ledger/idempotency rules are product/architecture concerns documented in `03_Database_Design.md` and do not introduce paid APIs.

---

## 11. Related documents

- `02_System_Architecture.md`  
- `06_Wallet_Integration.md`  
- `08_Subscription_and_Pricing.md`  
- `09_Development_Roadmap.md`  
