# SQL-only constraints checklist (Phase 1B.1)

Prisma `schema.prisma` models entities, enums, single-column relations, and the
compound relations Prisma can express without reusing `business_id` across
multiple `@relation` field lists on the same model.

Everything below is **required by the approved database design** and must be
added in a later migration / raw SQL companion. **Do not apply in Phase 1B.1.**

## Extensions

- [ ] `CREATE EXTENSION IF NOT EXISTS citext;` (if using CITEXT for emails)
- [ ] Confirm CITEXT vs TEXT product decision (still open in Phase 0)

## Partial unique indexes

- [ ] `loyalty_programs`: one `ACTIVE` row per `business_id` (MVP)
- [ ] `stamp_transactions`: `UNIQUE (reversal_of_transaction_id) WHERE type = 'REVERSAL'`

## CHECK constraints

### `loyalty_programs`

- [ ] `stamps_required > 0`

### `customer_programs`

- [ ] `stamp_balance >= 0`

### `rewards`

- [ ] `stamps_required > 0`

### `stamp_transactions`

- [ ] `balance_after >= 0`
- [ ] Type / `reward_id` / `reversal_of_transaction_id` / `stamps_delta` normative CHECK (EARN|REDEEM|ADJUST|REVERSAL)
- [ ] `reason` required (non-blank) for ADJUST/REVERSAL; NULL for EARN/REDEEM

### `reward_redemptions`

- [ ] `stamps_subtracted > 0`
- [ ] `balance_after >= 0`
- [ ] `stamp_transaction_type = 'REDEEM'`

## Composite foreign keys (tenant-safe)

Prisma cannot attach multiple compound FKs that share the same `business_id`
scalar on one model. Parents still expose `UNIQUE (id, business_id)` (and typed /
enrollment-scoped uniques) so these SQL FKs can be added later.

### `member_branch_assignments`

- [ ] `(member_id, business_id)` → `business_members (id, business_id)`
  - *Also represented in Prisma as a compound relation.*
- [ ] `(branch_id, business_id)` → `branches (id, business_id)`
  - *Prisma: single-column `branch_id` only (shared `business_id` conflict).*

### `customer_programs`

- [ ] `(loyalty_program_id, business_id)` → `loyalty_programs (id, business_id)`
  - *Also represented in Prisma as a compound relation.*

### `wallet_passes`

- [ ] `(customer_program_id, business_id)` → `customer_programs (id, business_id)`
  - *Also represented in Prisma as a compound relation.*

### `rewards`

- [ ] `(loyalty_program_id, business_id)` → `loyalty_programs (id, business_id)`
  - *Also represented in Prisma as a compound relation.*

### `stamp_transactions`

- [ ] `(customer_program_id, business_id)` → `customer_programs (id, business_id)`
  - *Also represented in Prisma as a compound relation.*
- [ ] `(branch_id, business_id)` → `branches (id, business_id)`
  - *Prisma: single-column only.*
- [ ] `(performed_by_member_id, business_id)` → `business_members (id, business_id)`
  - *Prisma: single-column only.*
- [ ] **Optional composite:** `(reward_id, business_id)` → `rewards (id, business_id)` when `reward_id` IS NOT NULL
  - *Prisma: optional single-column `reward_id` only.*
- [ ] **Optional composite:** `(reversal_of_transaction_id, business_id, customer_program_id)` → `stamp_transactions (id, business_id, customer_program_id)` when `reversal_of_transaction_id` IS NOT NULL
  - *Prisma: optional single-column self-relation on `reversal_of_transaction_id` only.*

### `reward_redemptions`

- [ ] `(reward_id, business_id)` → `rewards (id, business_id)`
  - *Prisma: single-column only.*
- [ ] `(customer_program_id, business_id)` → `customer_programs (id, business_id)`
  - *Prisma: single-column only.*
- [ ] `(branch_id, business_id)` → `branches (id, business_id)`
  - *Prisma: single-column only.*
- [ ] `(redeemed_by_member_id, business_id)` → `business_members (id, business_id)`
  - *Prisma: single-column only.*
- [ ] **Typed compound FK:** `(stamp_transaction_id, business_id, stamp_transaction_type)` → `stamp_transactions (id, business_id, type)`
  - *Also represented in Prisma as a compound relation.*

## Cross-row / operational integrity (not Prisma schema)

- [ ] REDEEM ledger ↔ `reward_redemptions` field matching (transactional write + tests; triggers optional)
- [ ] Idempotent insert pattern: `ON CONFLICT (business_id, idempotency_key) DO NOTHING`
- [ ] Enrollment `SELECT … FOR UPDATE` before balance mutation
- [ ] RLS policies (later phase — not Phase 1B.1)

## Explicitly unresolved (do not invent)

- [ ] REVERSAL full vs partial amount semantics
- [ ] REVERSAL eligibility / reversing REDEEM vs cancel-redemption policy
- [ ] `reward_redemptions` cancellation (`CANCELLED` status) — blocked in MVP
- [ ] PAST_DUE grace duration and post-grace restrictions
- [ ] `subscription_plans.tier` enum members (column typed as `TEXT` until decided)
- [ ] CITEXT vs TEXT for emails
- [ ] Idempotency key TTL (if any)
