import "dotenv/config";
import pg, { type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL / DIRECT_URL required for DB integration tests",
    );
  }
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error(
      "Refusing to run integration tests against a non-local database",
    );
  }
  return url;
}

export function createPool() {
  return new Pool({ connectionString: requireDatabaseUrl() });
}

export async function withClient<T>(
  pool: pg.Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore — connection may not be in a transaction
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function wipePublicData(client: PoolClient): Promise<void> {
  await client.query(`
    TRUNCATE TABLE
      reward_redemptions,
      stamp_transactions,
      wallet_passes,
      customer_programs,
      rewards,
      loyalty_programs,
      member_branch_assignments,
      branches,
      business_members,
      subscriptions,
      subscription_plans,
      customers,
      businesses,
      users
    RESTART IDENTITY CASCADE
  `);
}

export type TenantFixture = {
  businessA: string;
  businessB: string;
  userOwnerA: string;
  userOwnerB: string;
  userCustomerA: string;
  memberA: string;
  memberB: string;
  branchA: string;
  branchB: string;
  programA: string;
  programB: string;
  rewardA: string;
  rewardB: string;
  customerA: string;
  enrollmentA: string;
  enrollmentB: string;
};

export async function seedTwoTenants(
  client: PoolClient,
): Promise<TenantFixture> {
  const ids = {
    businessA: randomUUID(),
    businessB: randomUUID(),
    userOwnerA: randomUUID(),
    userOwnerB: randomUUID(),
    userCustomerA: randomUUID(),
    memberA: randomUUID(),
    memberB: randomUUID(),
    branchA: randomUUID(),
    branchB: randomUUID(),
    programA: randomUUID(),
    programB: randomUUID(),
    rewardA: randomUUID(),
    rewardB: randomUUID(),
    customerA: randomUUID(),
    enrollmentA: randomUUID(),
    enrollmentB: randomUUID(),
  };

  await client.query(
    `INSERT INTO users (id, email, full_name, role, status, created_at, updated_at)
     VALUES
       ($1, 'owner-a@example.com', 'Owner A', 'USER', 'ACTIVE', NOW(), NOW()),
       ($2, 'owner-b@example.com', 'Owner B', 'USER', 'ACTIVE', NOW(), NOW()),
       ($3, 'customer-a@example.com', 'Customer A', 'USER', 'ACTIVE', NOW(), NOW())`,
    [ids.userOwnerA, ids.userOwnerB, ids.userCustomerA],
  );

  await client.query(
    `INSERT INTO businesses (id, name, slug, status, created_at, updated_at)
     VALUES
       ($1, 'Business A', 'business-a', 'ACTIVE', NOW(), NOW()),
       ($2, 'Business B', 'business-b', 'ACTIVE', NOW(), NOW())`,
    [ids.businessA, ids.businessB],
  );

  await client.query(
    `INSERT INTO business_members
       (id, business_id, user_id, role, branch_scope, can_redeem, status, created_at, updated_at)
     VALUES
       ($1, $2, $3, 'OWNER', 'ALL_BRANCHES', true, 'ACTIVE', NOW(), NOW()),
       ($4, $5, $6, 'OWNER', 'ALL_BRANCHES', true, 'ACTIVE', NOW(), NOW())`,
    [
      ids.memberA,
      ids.businessA,
      ids.userOwnerA,
      ids.memberB,
      ids.businessB,
      ids.userOwnerB,
    ],
  );

  await client.query(
    `INSERT INTO branches
       (id, business_id, name, timezone, status, is_add_on, created_at, updated_at)
     VALUES
       ($1, $2, 'Branch A1', 'Europe/Berlin', 'ACTIVE', false, NOW(), NOW()),
       ($3, $4, 'Branch B1', 'Europe/Berlin', 'ACTIVE', false, NOW(), NOW())`,
    [ids.branchA, ids.businessA, ids.branchB, ids.businessB],
  );

  await client.query(
    `INSERT INTO loyalty_programs
       (id, business_id, name, stamps_required, status, card_theme_json, created_at, updated_at)
     VALUES
       ($1, $2, 'Card A', 10, 'ACTIVE', '{}'::jsonb, NOW(), NOW()),
       ($3, $4, 'Card B', 10, 'ACTIVE', '{}'::jsonb, NOW(), NOW())`,
    [ids.programA, ids.businessA, ids.programB, ids.businessB],
  );

  await client.query(
    `INSERT INTO rewards
       (id, business_id, loyalty_program_id, name, stamps_required, status, created_at, updated_at)
     VALUES
       ($1, $2, $3, 'Reward A', 10, 'ACTIVE', NOW(), NOW()),
       ($4, $5, $6, 'Reward B', 10, 'ACTIVE', NOW(), NOW())`,
    [
      ids.rewardA,
      ids.businessA,
      ids.programA,
      ids.rewardB,
      ids.businessB,
      ids.programB,
    ],
  );

  await client.query(
    `INSERT INTO customers (id, user_id, email, status, created_at, updated_at)
     VALUES ($1, $2, 'customer-a@example.com', 'ACTIVE', NOW(), NOW())`,
    [ids.customerA, ids.userCustomerA],
  );

  const qrA = Buffer.from("qr-hash-a-" + ids.enrollmentA);
  const qrB = Buffer.from("qr-hash-b-" + ids.enrollmentB);

  await client.query(
    `INSERT INTO customer_programs
       (id, business_id, customer_id, loyalty_program_id, stamp_balance, lifetime_stamps,
        qr_token_hash, status, joined_at, updated_at)
     VALUES
       ($1, $2, $3, $4, 12, 12, $5, 'ACTIVE', NOW(), NOW()),
       ($6, $7, $3, $8, 12, 12, $9, 'ACTIVE', NOW(), NOW())`,
    [
      ids.enrollmentA,
      ids.businessA,
      ids.customerA,
      ids.programA,
      qrA,
      ids.enrollmentB,
      ids.businessB,
      ids.programB,
      qrB,
    ],
  );

  return ids;
}

export async function insertEarn(
  client: PoolClient,
  args: {
    id?: string;
    businessId: string;
    enrollmentId: string;
    branchId: string;
    memberId: string;
    delta: number;
    balanceAfter: number;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<string> {
  const id = args.id ?? randomUUID();
  await client.query(
    `INSERT INTO stamp_transactions
       (id, business_id, customer_program_id, branch_id, performed_by_member_id,
        type, stamps_delta, balance_after, reason, reward_id, reversal_of_transaction_id,
        idempotency_key, request_hash)
     VALUES
       ($1,$2,$3,$4,$5,'EARN',$6,$7,NULL,NULL,NULL,$8,$9)`,
    [
      id,
      args.businessId,
      args.enrollmentId,
      args.branchId,
      args.memberId,
      args.delta,
      args.balanceAfter,
      args.idempotencyKey,
      args.requestHash,
    ],
  );
  return id;
}

export async function insertRedeemPair(
  client: PoolClient,
  args: {
    ledgerId?: string;
    redemptionId?: string;
    businessId: string;
    enrollmentId: string;
    branchId: string;
    memberId: string;
    rewardId: string;
    stampsSubtracted: number;
    balanceAfter: number;
    idempotencyKey: string;
    requestHash: string;
    mutateRedemption?: Partial<{
      businessId: string;
      enrollmentId: string;
      branchId: string;
      memberId: string;
      rewardId: string;
      stampsSubtracted: number;
      balanceAfter: number;
      idempotencyKey: string;
      requestHash: string;
    }>;
  },
): Promise<{ ledgerId: string; redemptionId: string }> {
  const ledgerId = args.ledgerId ?? randomUUID();
  const redemptionId = args.redemptionId ?? randomUUID();
  const delta = -Math.abs(args.stampsSubtracted);

  await client.query(
    `INSERT INTO stamp_transactions
       (id, business_id, customer_program_id, branch_id, performed_by_member_id,
        type, stamps_delta, balance_after, reason, reward_id, reversal_of_transaction_id,
        idempotency_key, request_hash)
     VALUES
       ($1,$2,$3,$4,$5,'REDEEM',$6,$7,NULL,$8,NULL,$9,$10)`,
    [
      ledgerId,
      args.businessId,
      args.enrollmentId,
      args.branchId,
      args.memberId,
      delta,
      args.balanceAfter,
      args.rewardId,
      args.idempotencyKey,
      args.requestHash,
    ],
  );

  const r = {
    businessId: args.businessId,
    enrollmentId: args.enrollmentId,
    branchId: args.branchId,
    memberId: args.memberId,
    rewardId: args.rewardId,
    stampsSubtracted: args.stampsSubtracted,
    balanceAfter: args.balanceAfter,
    idempotencyKey: args.idempotencyKey,
    requestHash: args.requestHash,
    ...args.mutateRedemption,
  };

  await client.query(
    `INSERT INTO reward_redemptions
       (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
        stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
        idempotency_key, request_hash, status)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,'REDEEM',$10,$11,'COMPLETED')`,
    [
      redemptionId,
      r.businessId,
      r.rewardId,
      r.enrollmentId,
      r.branchId,
      r.memberId,
      r.stampsSubtracted,
      r.balanceAfter,
      ledgerId,
      r.idempotencyKey,
      r.requestHash,
    ],
  );

  return { ledgerId, redemptionId };
}
