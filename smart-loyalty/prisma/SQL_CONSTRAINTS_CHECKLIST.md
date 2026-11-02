# SQL constraints checklist (Phase 1B.2)

Legend:

- **Implemented** — present in applied migrations on disposable Docker Postgres
- **Tested** — covered by `npm run test:db`
- **Deferred** — intentionally not done in 1B.2 (product/RLS/app layers)

## Extensions

- [x] **Implemented / Tested** `CREATE EXTENSION IF NOT EXISTS citext;` (baseline migration)
- [x] **Implemented** CITEXT on `users.email`, `customers.email` (per Database Design)
- [x] **Tested** case-insensitive `users.email` uniqueness; citext compare on `customers.email`

## Partial unique indexes

- [x] **Implemented / Tested** `loyalty_programs`: one `ACTIVE` per `business_id`
- [x] **Implemented / Tested** `stamp_transactions`: one `REVERSAL` per `reversal_of_transaction_id`

## CHECK constraints

### `loyalty_programs`

- [x] **Implemented / Tested** `stamps_required > 0`

### `customer_programs`

- [x] **Implemented** `stamp_balance >= 0`

### `rewards`

- [x] **Implemented** `stamps_required > 0`

### `stamp_transactions`

- [x] **Implemented / Tested** `balance_after >= 0`
- [x] **Implemented / Tested** type / `reward_id` / `reversal_of_transaction_id` / `stamps_delta` shape
- [x] **Implemented / Tested** reason required for ADJUST/REVERSAL; NULL for EARN/REDEEM

### `reward_redemptions`

- [x] **Implemented** `stamps_subtracted > 0`
- [x] **Implemented** `balance_after >= 0`
- [x] **Implemented / Tested** `stamp_transaction_type = 'REDEEM'`

## Composite foreign keys

### Prisma-emitted (baseline) — verified in migrate SQL

- [x] **Implemented** `member_branch_assignments (member_id, business_id)` → `business_members`
- [x] **Implemented** `customer_programs (loyalty_program_id, business_id)` → `loyalty_programs`
- [x] **Implemented** `wallet_passes (customer_program_id, business_id)` → `customer_programs`
- [x] **Implemented** `rewards (loyalty_program_id, business_id)` → `loyalty_programs`
- [x] **Implemented** `stamp_transactions (customer_program_id, business_id)` → `customer_programs`
- [x] **Implemented** typed `reward_redemptions (stamp_transaction_id, business_id, stamp_transaction_type)` → ledger `(id, business_id, type)`

### Custom SQL (integrity migration) — tenant isolation gaps

- [x] **Implemented / Tested** `member_branch_assignments (branch_id, business_id)` → `branches`
- [x] **Implemented / Tested** `stamp_transactions (branch_id, business_id)` → `branches`
- [x] **Implemented / Tested** `stamp_transactions (performed_by_member_id, business_id)` → `business_members`
- [x] **Implemented** `stamp_transactions (reward_id, business_id)` → `rewards` (MATCH SIMPLE)
- [x] **Implemented / Tested** `stamp_transactions (reversal_of_transaction_id, business_id, customer_program_id)` → ledger enrollment unique
- [x] **Implemented / Tested** `reward_redemptions (reward_id|customer_program_id|branch_id|redeemed_by_member_id, business_id)` composites

## REDEEM pair integrity

- [x] **Implemented / Tested** `DEFERRABLE INITIALLY DEFERRED` constraint triggers on `stamp_transactions` and `reward_redemptions`
- [x] **Implemented / Tested** UPDATE validates **OLD and NEW** `stamp_transaction_id` (migration `20261102020330_fix_redeem_pair_old_new_validation`)
- [x] **Implemented / Tested** immutable primary keys on pair tables
- [x] **Tested** R1–R8 (orphan REDEEM blocked at commit; field match; ledger-first order; insufficient-balance no persist; IMMEDIATE path)
- [x] **Tested** retarget orphan, ledger field UPDATE mismatch, same-tenant reward mismatch, provisional insufficient-balance rollback

## Historical FK delete / update behavior

- [x] **Implemented / Tested** reward & reversal single-column FKs → `ON DELETE RESTRICT` (migration `20261102020331_restrict_historical_fk_deletes`)
- [x] **Implemented / Tested** historical reward/reversal/typed-redeem FKs → `ON UPDATE RESTRICT` (migration `20261102021651_restrict_historical_fk_updates`)

## Cross-row / operational patterns

- [x] **Tested** `ON CONFLICT (business_id, idempotency_key) DO NOTHING` + `FOR UPDATE` concurrency
- [x] **Tested** same key + same hash → single balance mutation
- [x] **Tested** same key + different hash → conflict, no second mutation
- [ ] **Deferred** production write-path helpers / loyalty APIs (Phase 1B.3+)
- [ ] **Deferred** RLS enablement (prep only — see `prisma/rls/`)

## Explicitly unresolved (unchanged — do not invent)

- [ ] **Deferred** REVERSAL full vs partial amount semantics
- [ ] **Deferred** REVERSAL eligibility / reversing REDEEM vs cancel-redemption policy
- [ ] **Deferred** `reward_redemptions` cancellation (`CANCELLED`) — blocked in MVP
- [ ] **Deferred** PAST_DUE grace duration and post-grace restrictions
- [ ] **Deferred** `subscription_plans.tier` enum members (column remains TEXT)
- [ ] **Deferred** Idempotency key TTL (if any)
