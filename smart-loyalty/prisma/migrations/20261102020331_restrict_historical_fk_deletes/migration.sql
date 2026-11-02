-- Replace ON DELETE SET NULL with ON DELETE RESTRICT for historical ledger FKs.
-- Does not edit the baseline migration; follow-up only.

ALTER TABLE "stamp_transactions"
  DROP CONSTRAINT "stamp_transactions_reward_id_fkey";

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reward_id_fkey"
  FOREIGN KEY ("reward_id")
  REFERENCES "rewards" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "stamp_transactions"
  DROP CONSTRAINT "stamp_transactions_reversal_of_transaction_id_fkey";

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reversal_of_transaction_id_fkey"
  FOREIGN KEY ("reversal_of_transaction_id")
  REFERENCES "stamp_transactions" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
