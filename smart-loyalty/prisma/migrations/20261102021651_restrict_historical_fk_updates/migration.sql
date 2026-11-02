-- Prevent parent PK updates from rewriting historical loyalty FK columns.
-- Preserve ON DELETE RESTRICT; change ON UPDATE CASCADE → ON UPDATE RESTRICT.
-- Does not edit prior applied migrations.

-- ---------------------------------------------------------------------------
-- stamp_transactions → rewards
-- ---------------------------------------------------------------------------

ALTER TABLE "stamp_transactions"
  DROP CONSTRAINT "stamp_transactions_reward_id_fkey";

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reward_id_fkey"
  FOREIGN KEY ("reward_id")
  REFERENCES "rewards" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE "stamp_transactions"
  DROP CONSTRAINT "stamp_transactions_reward_business_fkey";

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reward_business_fkey"
  FOREIGN KEY ("reward_id", "business_id")
  REFERENCES "rewards" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- reward_redemptions → rewards
-- ---------------------------------------------------------------------------

ALTER TABLE "reward_redemptions"
  DROP CONSTRAINT "reward_redemptions_reward_id_fkey";

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_reward_id_fkey"
  FOREIGN KEY ("reward_id")
  REFERENCES "rewards" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE "reward_redemptions"
  DROP CONSTRAINT "reward_redemptions_reward_business_fkey";

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_reward_business_fkey"
  FOREIGN KEY ("reward_id", "business_id")
  REFERENCES "rewards" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- stamp_transactions → stamp_transactions (reversal target)
-- ---------------------------------------------------------------------------

ALTER TABLE "stamp_transactions"
  DROP CONSTRAINT "stamp_transactions_reversal_of_transaction_id_fkey";

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reversal_of_transaction_id_fkey"
  FOREIGN KEY ("reversal_of_transaction_id")
  REFERENCES "stamp_transactions" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE "stamp_transactions"
  DROP CONSTRAINT "stamp_transactions_reversal_enrollment_fkey";

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reversal_enrollment_fkey"
  FOREIGN KEY ("reversal_of_transaction_id", "business_id", "customer_program_id")
  REFERENCES "stamp_transactions" ("id", "business_id", "customer_program_id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- reward_redemptions → stamp_transactions (typed REDEEM ledger link)
-- Historical pair link: parent ledger PK must not rewrite child FK via CASCADE.
-- ---------------------------------------------------------------------------

ALTER TABLE "reward_redemptions"
  DROP CONSTRAINT "reward_redemptions_stamp_transaction_id_business_id_stamp__fkey";

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_stamp_transaction_id_business_id_stamp__fkey"
  FOREIGN KEY ("stamp_transaction_id", "business_id", "stamp_transaction_type")
  REFERENCES "stamp_transactions" ("id", "business_id", "type")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;
