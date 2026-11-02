import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  createPool,
  insertEarn,
  insertRedeemPair,
  seedTwoTenants,
  wipePublicData,
  type TenantFixture,
  withClient,
} from "./db";

let pool: pg.Pool;
let fx: TenantFixture;

beforeAll(() => {
  pool = createPool();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await withClient(pool, async (client) => {
    await wipePublicData(client);
    fx = await seedTwoTenants(client);
  });
});

describe("CITEXT", () => {
  it("has citext extension installed in PostgreSQL catalog", async () => {
    await withClient(pool, async (client) => {
      const res = await client.query(
        `SELECT extname FROM pg_extension WHERE extname = 'citext'`,
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0].extname).toBe("citext");
    });
  });

  it("enforces case-insensitive uniqueness on users.email", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO users (id, email, role, status, created_at, updated_at)
           VALUES ($1, 'OWNER-A@example.com', 'USER', 'ACTIVE', NOW(), NOW())`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/unique|duplicate/i);
    });
  });

  it("stores customers.email as citext (case-insensitive compare)", async () => {
    await withClient(pool, async (client) => {
      const res = await client.query(
        `SELECT email = 'CUSTOMER-A@EXAMPLE.COM' AS matches
         FROM customers WHERE id = $1`,
        [fx.customerA],
      );
      expect(res.rows[0].matches).toBe(true);
    });
  });
});

describe("Cross-tenant composite FKs", () => {
  it("accepts same-tenant member_branch_assignment and earn", async () => {
    await withClient(pool, async (client) => {
      await client.query(
        `INSERT INTO member_branch_assignments (business_id, member_id, branch_id)
         VALUES ($1, $2, $3)`,
        [fx.businessA, fx.memberA, fx.branchA],
      );
      const id = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 1,
        balanceAfter: 13,
        idempotencyKey: "earn-same-tenant",
        requestHash: "h-same",
      });
      expect(id).toBeTruthy();
    });
  });

  it("rejects member_branch_assignments with other-tenant branch", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO member_branch_assignments (business_id, member_id, branch_id)
           VALUES ($1, $2, $3)`,
          [fx.businessA, fx.memberA, fx.branchB],
        ),
      ).rejects.toThrow(
        /foreign key|member_branch_assignments_branch_business/i,
      );
    });
  });

  it("rejects stamp_transactions with other-tenant branch", async () => {
    await withClient(pool, async (client) => {
      await expect(
        insertEarn(client, {
          businessId: fx.businessA,
          enrollmentId: fx.enrollmentA,
          branchId: fx.branchB,
          memberId: fx.memberA,
          delta: 1,
          balanceAfter: 13,
          idempotencyKey: "earn-x-branch",
          requestHash: "h1",
        }),
      ).rejects.toThrow(/foreign key|stamp_transactions_branch_business/i);
    });
  });

  it("rejects stamp_transactions with other-tenant member", async () => {
    await withClient(pool, async (client) => {
      await expect(
        insertEarn(client, {
          businessId: fx.businessA,
          enrollmentId: fx.enrollmentA,
          branchId: fx.branchA,
          memberId: fx.memberB,
          delta: 1,
          balanceAfter: 13,
          idempotencyKey: "earn-x-member",
          requestHash: "h1",
        }),
      ).rejects.toThrow(/foreign key|stamp_transactions_member_business/i);
    });
  });

  it("rejects reward_redemptions with other-tenant enrollment", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await expect(
          insertRedeemPair(client, {
            businessId: fx.businessA,
            enrollmentId: fx.enrollmentA,
            branchId: fx.branchA,
            memberId: fx.memberA,
            rewardId: fx.rewardA,
            stampsSubtracted: 10,
            balanceAfter: 2,
            idempotencyKey: "redeem-x-enroll",
            requestHash: "h1",
            mutateRedemption: { enrollmentId: fx.enrollmentB },
          }),
        ).rejects.toThrow(/foreign key|enrollment_business/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("rejects stamp_transactions with other-tenant reward_id", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await expect(
          client.query(
            `INSERT INTO stamp_transactions
               (id, business_id, customer_program_id, branch_id, performed_by_member_id,
                type, stamps_delta, balance_after, reward_id, idempotency_key, request_hash)
             VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,$6,'earn-x-reward','h')`,
            [
              randomUUID(),
              fx.businessA,
              fx.enrollmentA,
              fx.branchA,
              fx.memberA,
              fx.rewardB,
            ],
          ),
        ).rejects.toThrow(/foreign key|stamp_transactions_reward_business/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });
});

describe("Valid ledger type rows", () => {
  it("accepts valid EARN, ADJUST, and REVERSAL rows", async () => {
    await withClient(pool, async (client) => {
      const earnId = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 2,
        balanceAfter: 14,
        idempotencyKey: "valid-earn",
        requestHash: "h-earn",
      });

      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reason, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'ADJUST',-1,13,'manual correction','valid-adjust','h-adj')`,
        [randomUUID(), fx.businessA, fx.enrollmentA, fx.branchA, fx.memberA],
      );

      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
            idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REVERSAL',-2,11,'undo earn',$6,'valid-rev','h-rev')`,
        [
          randomUUID(),
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          earnId,
        ],
      );

      const counts = await client.query(
        `SELECT type::text, count(*)::int AS c FROM stamp_transactions GROUP BY type ORDER BY 1`,
      );
      expect(counts.rows).toEqual(
        expect.arrayContaining([
          { type: "EARN", c: 1 },
          { type: "ADJUST", c: 1 },
          { type: "REVERSAL", c: 1 },
        ]),
      );
    });
  });
});

describe("CHECK constraints", () => {
  it("rejects EARN with reward_id set", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, reward_id, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'EARN',1,13,NULL,$6,'chk-earn-reward','h')`,
          [
            randomUUID(),
            fx.businessA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            fx.rewardA,
          ],
        ),
      ).rejects.toThrow(/stamp_tx_type_shape|check/i);
    });
  });

  it("rejects REDEEM with null reward_id", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, reward_id, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,NULL,NULL,'chk-redeem-null','h')`,
          [randomUUID(), fx.businessA, fx.enrollmentA, fx.branchA, fx.memberA],
        ),
      ).rejects.toThrow(/stamp_tx_type_shape|check/i);
    });
  });

  it("rejects EARN with non-null reason", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'EARN',1,13,'nope','chk-earn-reason','h')`,
          [randomUUID(), fx.businessA, fx.enrollmentA, fx.branchA, fx.memberA],
        ),
      ).rejects.toThrow(/stamp_tx_reason_by_type|check/i);
    });
  });

  it("rejects loyalty_programs.stamps_required <= 0", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO loyalty_programs
             (id, business_id, name, stamps_required, status, card_theme_json, created_at, updated_at)
           VALUES ($1,$2,'Bad',0,'ARCHIVED','{}'::jsonb, NOW(), NOW())`,
          [randomUUID(), fx.businessA],
        ),
      ).rejects.toThrow(/stamps_required_pos|check/i);
    });
  });

  it("rejects customer_programs.stamp_balance < 0", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `UPDATE customer_programs SET stamp_balance = -1 WHERE id = $1`,
          [fx.enrollmentA],
        ),
      ).rejects.toThrow(/stamp_balance_nonneg|check/i);
    });
  });

  it("rejects rewards.stamps_required <= 0", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO rewards
             (id, business_id, loyalty_program_id, name, stamps_required, status, created_at, updated_at)
           VALUES ($1,$2,$3,'Bad',0,'ARCHIVED',NOW(),NOW())`,
          [randomUUID(), fx.businessA, fx.programA],
        ),
      ).rejects.toThrow(/rewards_stamps_required_pos|check/i);
    });
  });

  it("rejects ADJUST with blank reason", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'ADJUST',1,13,'   ','chk-adj-blank','h')`,
          [randomUUID(), fx.businessA, fx.enrollmentA, fx.branchA, fx.memberA],
        ),
      ).rejects.toThrow(/stamp_tx_reason_by_type|check/i);
    });
  });

  it("rejects REDEEM with non-NULL reason", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, reward_id, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,'nope',$6,'chk-redeem-reason','h')`,
          [
            randomUUID(),
            fx.businessA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            fx.rewardA,
          ],
        ),
      ).rejects.toThrow(/stamp_tx_reason_by_type|check/i);
    });
  });

  it("rejects ADJUST with zero delta", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'ADJUST',0,12,'noop','chk-adj-zero','h')`,
          [randomUUID(), fx.businessA, fx.enrollmentA, fx.branchA, fx.memberA],
        ),
      ).rejects.toThrow(/stamp_tx_type_shape|check/i);
    });
  });

  it("rejects reward_redemptions.stamps_subtracted <= 0", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      const ledgerId = randomUUID();
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reward_id, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,$6,'chk-rr-stamps','h')`,
        [
          ledgerId,
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          fx.rewardA,
        ],
      );
      await expect(
        client.query(
          `INSERT INTO reward_redemptions
             (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
              stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
              idempotency_key, request_hash, status)
           VALUES ($1,$2,$3,$4,$5,$6,0,2,$7,'REDEEM','chk-rr-stamps','h','COMPLETED')`,
          [
            randomUUID(),
            fx.businessA,
            fx.rewardA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            ledgerId,
          ],
        ),
      ).rejects.toThrow(/reward_redemptions_stamps_pos|check/i);
      await client.query("ROLLBACK");
    });
  });

  it("rejects reward_redemptions.balance_after < 0", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      const ledgerId = randomUUID();
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reward_id, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,$6,'chk-rr-bal','h')`,
        [
          ledgerId,
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          fx.rewardA,
        ],
      );
      await expect(
        client.query(
          `INSERT INTO reward_redemptions
             (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
              stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
              idempotency_key, request_hash, status)
           VALUES ($1,$2,$3,$4,$5,$6,10,-1,$7,'REDEEM','chk-rr-bal','h','COMPLETED')`,
          [
            randomUUID(),
            fx.businessA,
            fx.rewardA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            ledgerId,
          ],
        ),
      ).rejects.toThrow(/reward_redemptions_balance_nonneg|check/i);
      await client.query("ROLLBACK");
    });
  });
});

describe("Historical FK ON DELETE RESTRICT", () => {
  it("rejects deleting a reward referenced by a REDEEM ledger row", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "fk-reward-del",
        requestHash: "h",
      });
      await client.query("COMMIT");

      await expect(
        client.query(`DELETE FROM rewards WHERE id = $1`, [fx.rewardA]),
      ).rejects.toThrow(/foreign key|restrict|violates/i);
    });
  });

  it("rejects deleting a stamp transaction that is a reversal target", async () => {
    await withClient(pool, async (client) => {
      const originalId = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 2,
        balanceAfter: 14,
        idempotencyKey: "fk-rev-target",
        requestHash: "h",
      });
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
            idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REVERSAL',-2,12,'undo',$6,'fk-rev-row','h')`,
        [
          randomUUID(),
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          originalId,
        ],
      );

      await expect(
        client.query(`DELETE FROM stamp_transactions WHERE id = $1`, [
          originalId,
        ]),
      ).rejects.toThrow(/foreign key|restrict|violates/i);
    });
  });
});

describe("Historical FK ON UPDATE RESTRICT", () => {
  it("rejects updating a reward id referenced by a stamp transaction", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      const { ledgerId } = await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "fk-reward-upd-ledger",
        requestHash: "h",
      });
      await client.query("COMMIT");

      const newRewardId = randomUUID();
      await expect(
        client.query(`UPDATE rewards SET id = $1 WHERE id = $2`, [
          newRewardId,
          fx.rewardA,
        ]),
      ).rejects.toThrow(/foreign key|restrict|violates/i);

      const intact = await client.query(
        `SELECT reward_id::text AS rid FROM stamp_transactions WHERE id = $1`,
        [ledgerId],
      );
      expect(intact.rows[0].rid).toBe(fx.rewardA);
    });
  });

  it("rejects updating a reward id referenced by a redemption", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      const { redemptionId } = await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "fk-reward-upd-redemption",
        requestHash: "h",
      });
      await client.query("COMMIT");

      await expect(
        client.query(`UPDATE rewards SET id = $1 WHERE id = $2`, [
          randomUUID(),
          fx.rewardA,
        ]),
      ).rejects.toThrow(/foreign key|restrict|violates/i);

      const intact = await client.query(
        `SELECT reward_id::text AS rid FROM reward_redemptions WHERE id = $1`,
        [redemptionId],
      );
      expect(intact.rows[0].rid).toBe(fx.rewardA);
    });
  });

  it("rejects updating a reversal target transaction id", async () => {
    await withClient(pool, async (client) => {
      const originalId = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 2,
        balanceAfter: 14,
        idempotencyKey: "fk-rev-target-upd",
        requestHash: "h",
      });
      const reversalId = randomUUID();
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
            idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REVERSAL',-2,12,'undo',$6,'fk-rev-upd-row','h')`,
        [
          reversalId,
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          originalId,
        ],
      );

      // May fail via immutable-PK trigger and/or ON UPDATE RESTRICT FKs.
      await expect(
        client.query(`UPDATE stamp_transactions SET id = $1 WHERE id = $2`, [
          randomUUID(),
          originalId,
        ]),
      ).rejects.toThrow(
        /foreign key|restrict|violates|immutable|REDEEM pair integrity/i,
      );

      const intact = await client.query(
        `SELECT reversal_of_transaction_id::text AS rid
         FROM stamp_transactions WHERE id = $1`,
        [reversalId],
      );
      expect(intact.rows[0].rid).toBe(originalId);
    });
  });

  it("keeps established redeem pairs intact after blocked reward id update", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      const { ledgerId, redemptionId } = await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "fk-upd-intact-pair",
        requestHash: "h-intact",
      });
      await client.query("COMMIT");

      await expect(
        client.query(`UPDATE rewards SET id = $1 WHERE id = $2`, [
          randomUUID(),
          fx.rewardA,
        ]),
      ).rejects.toThrow(/foreign key|restrict|violates/i);

      const counts = await client.query(
        `SELECT
           (SELECT count(*)::int FROM stamp_transactions WHERE id = $1) AS tx,
           (SELECT count(*)::int FROM reward_redemptions WHERE id = $2) AS rr,
           (SELECT reward_id::text FROM stamp_transactions WHERE id = $1) AS tx_reward,
           (SELECT reward_id::text FROM reward_redemptions WHERE id = $2) AS rr_reward`,
        [ledgerId, redemptionId],
      );
      expect(counts.rows[0].tx).toBe(1);
      expect(counts.rows[0].rr).toBe(1);
      expect(counts.rows[0].tx_reward).toBe(fx.rewardA);
      expect(counts.rows[0].rr_reward).toBe(fx.rewardA);
    });
  });
});

describe("Partial unique indexes", () => {
  it("rejects a second ACTIVE loyalty program per business", async () => {
    await withClient(pool, async (client) => {
      await expect(
        client.query(
          `INSERT INTO loyalty_programs
             (id, business_id, name, stamps_required, status, card_theme_json, created_at, updated_at)
           VALUES ($1,$2,'Second',10,'ACTIVE','{}'::jsonb, NOW(), NOW())`,
          [randomUUID(), fx.businessA],
        ),
      ).rejects.toThrow(
        /loyalty_programs_one_active_per_business|unique|duplicate/i,
      );
    });
  });

  it("allows multiple EARN rows (partial unique does not affect non-REVERSAL)", async () => {
    await withClient(pool, async (client) => {
      await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 1,
        balanceAfter: 13,
        idempotencyKey: "earn-1",
        requestHash: "h1",
      });
      await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 1,
        balanceAfter: 14,
        idempotencyKey: "earn-2",
        requestHash: "h2",
      });
      const res = await client.query(
        `SELECT count(*)::int AS c FROM stamp_transactions WHERE type = 'EARN'`,
      );
      expect(res.rows[0].c).toBe(2);
    });
  });

  it("rejects a second REVERSAL of the same original", async () => {
    await withClient(pool, async (client) => {
      const originalId = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 2,
        balanceAfter: 14,
        idempotencyKey: "orig-earn",
        requestHash: "h-orig",
      });

      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
            idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REVERSAL',-2,12,'mistake',$6,'rev-1','h-rev-1')`,
        [
          randomUUID(),
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          originalId,
        ],
      );

      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
              idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'REVERSAL',-2,12,'again',$6,'rev-2','h-rev-2')`,
          [
            randomUUID(),
            fx.businessA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            originalId,
          ],
        ),
      ).rejects.toThrow(/stamp_tx_one_reversal_per_original|unique|duplicate/i);
    });
  });
});

describe("REVERSAL structural constraints", () => {
  it("rejects reversal targeting another enrollment", async () => {
    await withClient(pool, async (client) => {
      const originalId = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 1,
        balanceAfter: 13,
        idempotencyKey: "orig-for-cross",
        requestHash: "h",
      });

      // Create a second enrollment in business A for same customer is blocked by
      // UNIQUE(customer_id, business_id). Use program B tenant instead via FK fail:
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
              idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'REVERSAL',-1,11,'cross',$6,'rev-cross','h')`,
          [
            randomUUID(),
            fx.businessB,
            fx.enrollmentB,
            fx.branchB,
            fx.memberB,
            originalId,
          ],
        ),
      ).rejects.toThrow(/foreign key|reversal_enrollment/i);
    });
  });

  it("rejects REVERSAL without reason", async () => {
    await withClient(pool, async (client) => {
      const originalId = await insertEarn(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        delta: 1,
        balanceAfter: 13,
        idempotencyKey: "orig-noreason",
        requestHash: "h",
      });

      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reason, reversal_of_transaction_id,
              idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'REVERSAL',-1,11,NULL,$6,'rev-noreason','h')`,
          [
            randomUUID(),
            fx.businessA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            originalId,
          ],
        ),
      ).rejects.toThrow(/stamp_tx_reason_by_type|check/i);
    });
  });
});
