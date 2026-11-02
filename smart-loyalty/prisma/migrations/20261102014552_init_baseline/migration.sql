-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BusinessMemberRole" AS ENUM ('OWNER', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "BranchScope" AS ENUM ('ALL_BRANCHES', 'SELECTED_BRANCHES');

-- CreateEnum
CREATE TYPE "BusinessMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LoyaltyProgramStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerProgramStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "WalletPlatform" AS ENUM ('SIMULATOR', 'APPLE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "WalletPassStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "StampTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'REVERSAL');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RewardRedemptionStatus" AS ENUM ('COMPLETED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "full_name" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "logo_url" TEXT,
    "brand_theme_json" JSONB,
    "status" "BusinessStatus" NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_members" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "BusinessMemberRole" NOT NULL,
    "branch_scope" "BranchScope" NOT NULL,
    "can_redeem" BOOLEAN NOT NULL DEFAULT true,
    "status" "BusinessMemberStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL,
    "is_add_on" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_branch_assignments" (
    "business_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_branch_assignments_pkey" PRIMARY KEY ("member_id","branch_id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stamps_required" INTEGER NOT NULL,
    "status" "LoyaltyProgramStatus" NOT NULL,
    "card_theme_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "full_name" TEXT,
    "phone" TEXT,
    "status" "CustomerStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_programs" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "loyalty_program_id" UUID NOT NULL,
    "stamp_balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_stamps" INTEGER NOT NULL DEFAULT 0,
    "qr_token_hash" BYTEA NOT NULL,
    "qr_token_ciphertext" BYTEA,
    "qr_last_rotated_at" TIMESTAMPTZ(6),
    "status" "CustomerProgramStatus" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customer_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_passes" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_program_id" UUID NOT NULL,
    "platform" "WalletPlatform" NOT NULL,
    "serial_number" TEXT NOT NULL,
    "external_pass_id" TEXT,
    "status" "WalletPassStatus" NOT NULL,
    "last_synced_at" TIMESTAMPTZ(6),
    "metadata_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stamp_transactions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_program_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "performed_by_member_id" UUID NOT NULL,
    "type" "StampTransactionType" NOT NULL,
    "stamps_delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT,
    "reward_id" UUID,
    "reversal_of_transaction_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stamp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "loyalty_program_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stamps_required" INTEGER NOT NULL,
    "description" TEXT,
    "status" "RewardStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "customer_program_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "redeemed_by_member_id" UUID NOT NULL,
    "stamps_subtracted" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "stamp_transaction_id" UUID NOT NULL,
    "stamp_transaction_type" "StampTransactionType" NOT NULL DEFAULT 'REDEEM',
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "RewardRedemptionStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "price_monthly_cents" INTEGER NOT NULL,
    "max_branches" INTEGER NOT NULL,
    "max_employees" INTEGER NOT NULL,
    "max_active_programs" INTEGER NOT NULL,
    "max_customers" INTEGER,
    "features_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "past_due_since" TIMESTAMPTZ(6),
    "grace_period_ends_at" TIMESTAMPTZ(6),
    "add_on_branches" INTEGER NOT NULL DEFAULT 0,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "business_members_user_id_idx" ON "business_members"("user_id");

-- CreateIndex
CREATE INDEX "business_members_business_id_idx" ON "business_members"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_business_id_user_id_key" ON "business_members"("business_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_id_business_id_key" ON "business_members"("id", "business_id");

-- CreateIndex
CREATE INDEX "branches_business_id_idx" ON "branches"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_business_id_name_key" ON "branches"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_id_business_id_key" ON "branches"("id", "business_id");

-- CreateIndex
CREATE INDEX "member_branch_assignments_business_id_idx" ON "member_branch_assignments"("business_id");

-- CreateIndex
CREATE INDEX "member_branch_assignments_branch_id_idx" ON "member_branch_assignments"("branch_id");

-- CreateIndex
CREATE INDEX "loyalty_programs_business_id_idx" ON "loyalty_programs"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_programs_id_business_id_key" ON "loyalty_programs"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- CreateIndex
CREATE INDEX "customer_programs_business_id_idx" ON "customer_programs"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_programs_customer_id_loyalty_program_id_key" ON "customer_programs"("customer_id", "loyalty_program_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_programs_customer_id_business_id_key" ON "customer_programs"("customer_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_programs_qr_token_hash_key" ON "customer_programs"("qr_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "customer_programs_id_business_id_key" ON "customer_programs"("id", "business_id");

-- CreateIndex
CREATE INDEX "wallet_passes_business_id_idx" ON "wallet_passes"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_passes_platform_serial_number_key" ON "wallet_passes"("platform", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_passes_customer_program_id_platform_key" ON "wallet_passes"("customer_program_id", "platform");

-- CreateIndex
CREATE INDEX "stamp_transactions_business_id_created_at_idx" ON "stamp_transactions"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stamp_transactions_customer_program_id_created_at_idx" ON "stamp_transactions"("customer_program_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stamp_transactions_branch_id_created_at_idx" ON "stamp_transactions"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stamp_transactions_performed_by_member_id_created_at_idx" ON "stamp_transactions"("performed_by_member_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stamp_transactions_type_created_at_idx" ON "stamp_transactions"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stamp_transactions_reversal_of_transaction_id_idx" ON "stamp_transactions"("reversal_of_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "stamp_transactions_id_business_id_key" ON "stamp_transactions"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "stamp_transactions_id_business_id_type_key" ON "stamp_transactions"("id", "business_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "stamp_transactions_id_business_id_customer_program_id_key" ON "stamp_transactions"("id", "business_id", "customer_program_id");

-- CreateIndex
CREATE UNIQUE INDEX "stamp_transactions_business_id_idempotency_key_key" ON "stamp_transactions"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "rewards_business_id_idx" ON "rewards"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_id_business_id_key" ON "rewards"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_stamp_transaction_id_key" ON "reward_redemptions"("stamp_transaction_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_business_id_idx" ON "reward_redemptions"("business_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_customer_program_id_idx" ON "reward_redemptions"("customer_program_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_reward_id_idx" ON "reward_redemptions"("reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_stamp_transaction_id_business_id_stamp_t_key" ON "reward_redemptions"("stamp_transaction_id", "business_id", "stamp_transaction_type");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_business_id_idempotency_key_key" ON "reward_redemptions"("business_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_business_id_key" ON "subscriptions"("business_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_branch_assignments" ADD CONSTRAINT "member_branch_assignments_member_id_business_id_fkey" FOREIGN KEY ("member_id", "business_id") REFERENCES "business_members"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_branch_assignments" ADD CONSTRAINT "member_branch_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_programs" ADD CONSTRAINT "customer_programs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_programs" ADD CONSTRAINT "customer_programs_loyalty_program_id_business_id_fkey" FOREIGN KEY ("loyalty_program_id", "business_id") REFERENCES "loyalty_programs"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_customer_program_id_business_id_fkey" FOREIGN KEY ("customer_program_id", "business_id") REFERENCES "customer_programs"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_transactions" ADD CONSTRAINT "stamp_transactions_customer_program_id_business_id_fkey" FOREIGN KEY ("customer_program_id", "business_id") REFERENCES "customer_programs"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_transactions" ADD CONSTRAINT "stamp_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_transactions" ADD CONSTRAINT "stamp_transactions_performed_by_member_id_fkey" FOREIGN KEY ("performed_by_member_id") REFERENCES "business_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_transactions" ADD CONSTRAINT "stamp_transactions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_transactions" ADD CONSTRAINT "stamp_transactions_reversal_of_transaction_id_fkey" FOREIGN KEY ("reversal_of_transaction_id") REFERENCES "stamp_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_loyalty_program_id_business_id_fkey" FOREIGN KEY ("loyalty_program_id", "business_id") REFERENCES "loyalty_programs"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_stamp_transaction_id_business_id_stamp__fkey" FOREIGN KEY ("stamp_transaction_id", "business_id", "stamp_transaction_type") REFERENCES "stamp_transactions"("id", "business_id", "type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_customer_program_id_fkey" FOREIGN KEY ("customer_program_id") REFERENCES "customer_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_redeemed_by_member_id_fkey" FOREIGN KEY ("redeemed_by_member_id") REFERENCES "business_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
