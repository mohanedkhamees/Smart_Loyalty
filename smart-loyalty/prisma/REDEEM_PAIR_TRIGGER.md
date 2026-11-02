# Deferred REDEEM pair integrity trigger

## Purpose

Guarantee that a successful `REDEEM` cannot commit unless the final transaction
state contains **exactly one** matching `reward_redemptions` row with all
documented fields equal to the ledger row.

## Objects

| Object                        | Type                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `redeem_pair_integrity()`     | PL/pgSQL trigger function                                                      |
| `trg_stamp_tx_redeem_pair`    | `CONSTRAINT TRIGGER` on `stamp_transactions` — `DEFERRABLE INITIALLY DEFERRED` |
| `trg_reward_redemptions_pair` | `CONSTRAINT TRIGGER` on `reward_redemptions` — `DEFERRABLE INITIALLY DEFERRED` |

Defined in:

- `20261102014554_redeem_pair_deferred_trigger` (initial)
- `20261102020330_fix_redeem_pair_old_new_validation` (OLD+NEW validation + immutable PKs)

## Why deferred (not statement-local AFTER INSERT)

`DEFERRABLE INITIALLY DEFERRED` runs at **COMMIT**, so ledger-first then
redemption-second mid-transaction is valid, while inconsistent final state aborts.

## OLD and NEW validation (critical)

On `reward_redemptions` **UPDATE**:

- Always validate `NEW.stamp_transaction_id`.
- If `OLD.stamp_transaction_id IS DISTINCT FROM NEW.stamp_transaction_id`,
  **also** validate the abandoned `OLD.stamp_transaction_id`.

This prevents moving a redemption from REDEEM **A** to **B** while leaving **A**
orphaned.

On `stamp_transactions` **UPDATE**:

- Validate `NEW.id` when `NEW.type = 'REDEEM'`.
- If type changed away from `REDEEM`, also validate `OLD.id`.

## Immutable primary keys

`UPDATE` that changes `id` on either table raises immediately. Pair integrity
tracks partners by id; mutable PKs would bypass validation.

## Events covered

Both tables: `AFTER INSERT OR UPDATE OR DELETE`, `FOR EACH ROW`, deferred.

## Commit-time rules (unchanged / not weakened)

1. Every `type = 'REDEEM'` ledger has exactly one `reward_redemptions` row.
2. Every redemption references an existing `REDEEM` ledger.
3. Field equality per docs `03_Database_Design` §5.12.
4. Failure → `RAISE EXCEPTION` → full transaction rollback.
