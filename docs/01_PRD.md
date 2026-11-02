# Smart Loyalty – Product Requirements Document (PRD)

**Document:** 01_PRD  
**Phase:** 0 (Documentation – refined)  
**Status:** Draft for approval  
**Last updated:** 2026-11-01 (verified integrity pass)

---

## 1. Product vision

Smart Loyalty is an independent, multi-tenant SaaS platform for **digital stamp cards**. It does not require a POS, ordering system, or a native customer mobile app.

Businesses subscribe, configure one Stamp Card program (MVP), and operate across one or more branches. Customers hold a **single central account**, join many businesses, and collect stamps that are issued **only by authorized employees**. Rewards become available after the configured stamp threshold. Apple Wallet and Google Wallet are future adapters; the **Wallet Simulator** is the MVP card surface.

### Target customers (businesses)

- Cafés and restaurants  
- Bakeries  
- Barbershops and hair salons  
- Beauty salons  
- Retail stores  
- Other local brick-and-mortar businesses  

### End users

| Persona | Description |
|---------|-------------|
| Platform Administrator | Operates Smart Loyalty: tenants, plans, platform metrics |
| Business Owner | Full control of one tenant: settings, staff, branches, billing |
| Manager | Business operations without billing access |
| Employee | Staff interface: scan, issue stamps, redeem when authorized; selected branches by default |
| Customer | Central account; multiple business cards; cannot self-stamp |

---

## 2. Problem statement

Physical stamp cards are lost, forged, and hard to measure. POS-tied loyalty tools are expensive and lock businesses into ordering stacks. Local businesses need a **standalone** digital stamp card that works in the browser (and later in native wallets), with stamps validated by staff.

---

## 3. MVP product model (confirmed)

Smart Loyalty MVP is **exclusively** a Digital Stamp Card SaaS:

| Rule | MVP behavior |
|------|----------------|
| Programs per business | **One active** Stamp Card program |
| Branches | Many branches; **all share** the same Stamp Card |
| Customer balance | **One shared balance** per business enrollment (not per branch) |
| Stamp issuance | Employees (and Owner/Manager in staff mode) only |
| Self-stamping | **Forbidden** |
| Rewards | Available after configured stamp threshold; staff redeems |
| Redemption math | **Subtract** required stamps; **preserve** remainder (e.g. 12 − 10 = 2) |
| Multiple rewards | Allowed whenever balance permits; each redemption recorded separately |
| Duplicate ops | Idempotency **required** on EARN, REDEEM, ADJUST, REVERSAL; `INSERT … ON CONFLICT DO NOTHING` then compare `request_hash` |
| Ledger types | `EARN` / `REDEEM` / `ADJUST` / `REVERSAL` — redemption is never an ADJUST; `reward_id` only on REDEEM |
| Manual adjustments / reversals | Owners and Managers only; `reversal_of_transaction_id`; same business/enrollment; once; full vs partial **TBD** (not approved) |
| Cancel completed redemption | **TBD**; not in MVP; status enum is `COMPLETED` only |
| Future programs | Schema supports multiple programs later **without redesign** |

### Global branch loyalty (critical)

Example: Berlin Mitte (3 stamps) + Charlottenburg (2) + Kreuzberg (4) → **one balance of 9** for that business. Redemption may occur at **any authorized branch** of the same business. Each earn/redeem records the **branch** and **employee** for audit.

---

## 4. Goals and non-goals

### Goals (MVP → early v1)

1. Multi-tenant SaaS with strict business data isolation.  
2. Business self-registration, dashboard, branches, employees.  
3. Customer central account; join via business QR; Email+Password or Email OTP / Magic Link.  
4. Employee-only stamp issuance and staff-confirmed redemption with audit trail and idempotency.  
5. One active Stamp Card per business; shared balance across branches.  
6. Subscription tiers with included branches and purchasable add-on branches (prices remain placeholders).  
7. Wallet Simulator with dynamic updates; architecture ready for Apple/Google later.  
8. Develop and test primarily on free infrastructure; no paid APIs without approval.

### Non-goals

- Real Apple PassKit / Google Wallet production issuance in MVP.  
- Stripe **live** payments in MVP (prepare schema/UX only).  
- Final commercial pricing in this documentation phase.  
- Geofencing and marketing automation (hooks only).  
- Customer self-service stamp collection.  
- Native iOS/Android customer apps.  
- POS / inventory / ordering integrations.  
- Multiple concurrent active stamp programs per business in MVP UI.

---

## 5. Core product requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | SaaS platform with centralized platform administration | Must |
| R2 | Multi-tenant architecture with complete business data isolation | Must |
| R3 | Business registration and business dashboard | Must |
| R4 | Multiple branches per business under one subscription | Must |
| R5 | Additional paid branches beyond plan included quota | Must (live billing later) |
| R6 | Employee accounts, roles, and branch assignment | Must |
| R7 | Central customer account (one identity, many businesses) | Must |
| R8 | Customer scans business QR → mobile-first registration/join | Must |
| R9 | Customers join multiple businesses with the same account | Must |
| R10 | MVP: one active Stamp Card per business; schema allows more later | Must |
| R11 | Stamps issued by authorized staff only | Must |
| R12 | Employees scan customer card QR codes | Must |
| R13 | Dynamic stamp card updates (Simulator first) | Must |
| R14 | Reward available after stamp threshold; staff redeems; subtract-required math | Must |
| R15 | Apple Wallet integration | Should (post-MVP) |
| R16 | Google Wallet integration | Should (post-MVP) |
| R17 | Wallet Simulator independent of Apple/Google credentials | Must (MVP) |
| R18 | Per-business subscription; server-side limit enforcement | Must |
| R19 | Future geofencing and location-based notifications | Could (design only) |
| R20 | Global branch loyalty: shared balance; per-txn branch audit | Must |
| R21 | Idempotent EARN, REDEEM, ADJUST, REVERSAL via ON CONFLICT DO NOTHING + request_hash compare | Must |
| R22 | Multiple sequential redemptions when balance allows | Must |
| R23 | Manual ADJUST/REVERSAL: Owner/Manager only; REVERSAL links once to original; distinct from REDEEM | Must |
| R24 | PAST_DUE grace period before restriction (duration TBD) | Must |
| R25 | REDEEM ledger ↔ reward_redemptions field integrity; reward_id required on REDEEM | Must |
| R26 | No ambiguous redemption cancellation in MVP (cancellation policy TBD) | Must |
| R27 | Insufficient balance on REDEEM → full rollback + `INSUFFICIENT_BALANCE`; no ledger/redemption/balance/wallet side effects | Must |

---

## 6. User-facing surfaces

1. **Marketing site** – positioning, pricing overview (placeholders), CTAs.  
2. **Auth** – Email+Password and Email OTP / Magic Link (Supabase Auth).  
3. **Business dashboard** – overview, stamp card settings, customers, branches, employees, wallet cards, rewards, analytics, subscription, settings.  
4. **Staff interface** – mobile-first; business/branch context; scan; stamp; redeem; history.  
5. **Customer** – `/join/[businessSlug]`; account with multiple simulator cards.  
6. **Platform admin** – tenants, plans, aggregate statistics.

---

## 7. Success metrics (product)

| Metric | Intent |
|--------|--------|
| Time-to-first-card | Owner configures Stamp Card & join QR in one session |
| Join conversion | % of QR opens that complete registration/join |
| Stamp latency | Staff completes add-stamp quickly on mobile |
| Multi-business rate | Customers enrolled in ≥2 businesses over time |
| Cross-branch usage | Stamps earned across multiple branches on same enrollment |
| Upgrade drivers | Branch or employee limit pressure |

Exact numeric targets deferred until baseline traffic exists.

---

## 8. Constraints

### Technical preferences

- Next.js, TypeScript, PostgreSQL, Supabase, Prisma, Tailwind CSS.  
- GitHub for source control.  
- Vercel only where current terms permit the intended usage (see `10_Free_Infrastructure_and_Costs.md`).  
- Stripe for future billing.  
- Database region: **EU, preferably Frankfurt**.

### Development constraint

MVP development and testing use **free plans wherever possible**. No paid APIs or subscriptions without **explicit approval**. Free development ≠ free commercial production.

### Legal / privacy

GDPR obligations apply. Controller/processor allocation remains an **unresolved legal decision** until counsel confirms. See `07_Security_and_GDPR.md`.

---

## 9. Acceptance criteria (documentation vs build)

- **Phase 0:** Documentation under `/docs` approved.  
- **Later phases:** Schema, auth, tenancy, join, staff stamp/redeem with idempotency, subscription limits, Wallet Simulator — see `09_Development_Roadmap.md`.

---

## 10. Open product questions

Tracked in `09_Development_Roadmap.md` § Decisions still open. Confirmed items (redeem math, branch defaults, adjustments, idempotency, PAST_DUE grace existence, placeholder pricing) are no longer open.

---

## 11. Related documents

- `02_System_Architecture.md`  
- `03_Database_Design.md`  
- `04_User_Roles_and_Permissions.md`  
- `05_User_Flows.md`  
- `06_Wallet_Integration.md`  
- `07_Security_and_GDPR.md`  
- `08_Subscription_and_Pricing.md`  
- `09_Development_Roadmap.md`  
- `10_Free_Infrastructure_and_Costs.md`  
