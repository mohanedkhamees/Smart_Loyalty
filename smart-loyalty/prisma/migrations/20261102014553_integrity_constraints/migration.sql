-- Phase 1B.2 integrity: CHECKs, partial uniques, custom composite FKs
-- Prisma cannot emit these (shared business_id / partial indexes / CHECKs).

-- ---------------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "loyalty_programs"
  ADD CONSTRAINT "loyalty_programs_stamps_required_pos"
  CHECK ("stamps_required" > 0);

ALTER TABLE "customer_programs"
  ADD CONSTRAINT "customer_programs_stamp_balance_nonneg"
  CHECK ("stamp_balance" >= 0);

ALTER TABLE "rewards"
  ADD CONSTRAINT "rewards_stamps_required_pos"
  CHECK ("stamps_required" > 0);

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_tx_balance_after_nonneg"
  CHECK ("balance_after" >= 0);

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_tx_type_shape"
  CHECK (
    (
      "type" = 'EARN'
      AND "stamps_delta" > 0
      AND "reward_id" IS NULL
      AND "reversal_of_transaction_id" IS NULL
    )
    OR (
      "type" = 'REDEEM'
      AND "stamps_delta" < 0
      AND "reward_id" IS NOT NULL
      AND "reversal_of_transaction_id" IS NULL
    )
    OR (
      "type" = 'ADJUST'
      AND "stamps_delta" <> 0
      AND "reward_id" IS NULL
      AND "reversal_of_transaction_id" IS NULL
    )
    OR (
      "type" = 'REVERSAL'
      AND "stamps_delta" <> 0
      AND "reward_id" IS NULL
      AND "reversal_of_transaction_id" IS NOT NULL
    )
  );

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_tx_reason_by_type"
  CHECK (
    (
      "type" IN ('ADJUST', 'REVERSAL')
      AND "reason" IS NOT NULL
      AND length(trim("reason")) > 0
    )
    OR (
      "type" IN ('EARN', 'REDEEM')
      AND "reason" IS NULL
    )
  );

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_stamps_pos"
  CHECK ("stamps_subtracted" > 0);

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_balance_nonneg"
  CHECK ("balance_after" >= 0);

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_type_redeem"
  CHECK ("stamp_transaction_type" = 'REDEEM');

-- ---------------------------------------------------------------------------
-- Partial unique indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "loyalty_programs_one_active_per_business"
  ON "loyalty_programs" ("business_id")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "stamp_tx_one_reversal_per_original"
  ON "stamp_transactions" ("reversal_of_transaction_id")
  WHERE "type" = 'REVERSAL';

-- ---------------------------------------------------------------------------
-- Custom composite foreign keys (tenant isolation gaps)
-- ---------------------------------------------------------------------------

ALTER TABLE "member_branch_assignments"
  ADD CONSTRAINT "member_branch_assignments_branch_business_fkey"
  FOREIGN KEY ("branch_id", "business_id")
  REFERENCES "branches" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_branch_business_fkey"
  FOREIGN KEY ("branch_id", "business_id")
  REFERENCES "branches" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_member_business_fkey"
  FOREIGN KEY ("performed_by_member_id", "business_id")
  REFERENCES "business_members" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Optional when reward_id IS NULL (MATCH SIMPLE default)
ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reward_business_fkey"
  FOREIGN KEY ("reward_id", "business_id")
  REFERENCES "rewards" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Optional when reversal_of_transaction_id IS NULL (MATCH SIMPLE default)
ALTER TABLE "stamp_transactions"
  ADD CONSTRAINT "stamp_transactions_reversal_enrollment_fkey"
  FOREIGN KEY ("reversal_of_transaction_id", "business_id", "customer_program_id")
  REFERENCES "stamp_transactions" ("id", "business_id", "customer_program_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_reward_business_fkey"
  FOREIGN KEY ("reward_id", "business_id")
  REFERENCES "rewards" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_enrollment_business_fkey"
  FOREIGN KEY ("customer_program_id", "business_id")
  REFERENCES "customer_programs" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_branch_business_fkey"
  FOREIGN KEY ("branch_id", "business_id")
  REFERENCES "branches" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_member_business_fkey"
  FOREIGN KEY ("redeemed_by_member_id", "business_id")
  REFERENCES "business_members" ("id", "business_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
