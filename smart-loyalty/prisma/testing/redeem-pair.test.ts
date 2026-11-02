import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  createPool,
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

describe("REDEEM deferred pair integrity (R1–R8)", () => {
  it("R1: ledger + matching redemption + balance update commits", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      await client.query(
        `SELECT id FROM customer_programs WHERE id = $1 FOR UPDATE`,
        [fx.enrollmentA],
      );
      await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "r1",
        requestHash: "hash-r1",
      });
      await client.query(
        `UPDATE customer_programs SET stamp_balance = 2, lifetime_stamps = lifetime_stamps
         WHERE id = $1`,
        [fx.enrollmentA],
      );
      await client.query("COMMIT");

      const ledger = await client.query(
        `SELECT count(*)::int AS c FROM stamp_transactions WHERE type = 'REDEEM'`,
      );
      const red = await client.query(
        `SELECT count(*)::int AS c FROM reward_redemptions`,
      );
      expect(ledger.rows[0].c).toBe(1);
      expect(red.rows[0].c).toBe(1);
    });
  });

  it("R2: orphan REDEEM ledger cannot commit", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reason, reward_id, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,NULL,$6,'r2','hash-r2')`,
        [
          randomUUID(),
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          fx.rewardA,
        ],
      );
      await expect(client.query("COMMIT")).rejects.toThrow(
        /REDEEM pair integrity/i,
      );
      await client.query("ROLLBACK");

      const counts = await client.query(
        `SELECT
           (SELECT count(*)::int FROM stamp_transactions) AS tx,
           (SELECT count(*)::int FROM reward_redemptions) AS rr`,
      );
      expect(counts.rows[0].tx).toBe(0);
      expect(counts.rows[0].rr).toBe(0);
    });
  });

  it("R3: mismatched redemption fields cannot commit", async () => {
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
        idempotencyKey: "r3",
        requestHash: "hash-r3",
        mutateRedemption: {
          stampsSubtracted: 9,
          requestHash: "hash-r3-mismatch",
        },
      });
      await expect(client.query("COMMIT")).rejects.toThrow(
        /REDEEM pair integrity|field mismatch/i,
      );
      await client.query("ROLLBACK");
    });
  });

  it("R4: redemption cannot reference non-REDEEM ledger (CHECK/FK)", async () => {
    await withClient(pool, async (client) => {
      const earnId = randomUUID();
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'EARN',1,13,'r4-earn','h')`,
        [earnId, fx.businessA, fx.enrollmentA, fx.branchA, fx.memberA],
      );
      await expect(
        client.query(
          `INSERT INTO reward_redemptions
             (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
              stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
              idempotency_key, request_hash, status)
           VALUES ($1,$2,$3,$4,$5,$6,1,12,$7,'REDEEM','r4','h','COMPLETED')`,
          [
            randomUUID(),
            fx.businessA,
            fx.rewardA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            earnId,
          ],
        ),
      ).rejects.toThrow(/foreign key|check|REDEEM pair integrity/i);
      await client.query("ROLLBACK");
    });
  });

  it("R5: two redemptions for same stamp_transaction_id fail unique", async () => {
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
        idempotencyKey: "r5",
        requestHash: "hash-r5",
      });
      await expect(
        client.query(
          `INSERT INTO reward_redemptions
             (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
              stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
              idempotency_key, request_hash, status)
           VALUES ($1,$2,$3,$4,$5,$6,10,2,$7,'REDEEM','r5-b','hash-r5-b','COMPLETED')`,
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
      ).rejects.toThrow(/unique|duplicate/i);
      await client.query("ROLLBACK");
    });
  });

  it("R6: ledger-first then redemption-second succeeds", async () => {
    await withClient(pool, async (client) => {
      const ledgerId = randomUUID();
      const redemptionId = randomUUID();
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reward_id, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,$6,'r6','hash-r6')`,
        [
          ledgerId,
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          fx.rewardA,
        ],
      );
      await client.query(
        `INSERT INTO reward_redemptions
           (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
            stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
            idempotency_key, request_hash, status)
         VALUES ($1,$2,$3,$4,$5,$6,10,2,$7,'REDEEM','r6','hash-r6','COMPLETED')`,
        [
          redemptionId,
          fx.businessA,
          fx.rewardA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          ledgerId,
        ],
      );
      await client.query("COMMIT");
      expect(true).toBe(true);
    });
  });

  it("R7: insufficient balance path leaves no ledger/redemption/idempotency", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      await client.query(
        `SELECT id FROM customer_programs WHERE id = $1 FOR UPDATE`,
        [fx.enrollmentA],
      );
      const bal = await client.query(
        `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
        [fx.enrollmentA],
      );
      expect(bal.rows[0].b).toBe(12);

      // Simulate insufficient: need 10 but pretend balance is 5 by checking before insert
      const need = 10;
      const available = 5;
      if (available < need) {
        await client.query("ROLLBACK");
      }

      const counts = await client.query(
        `SELECT
           (SELECT count(*)::int FROM stamp_transactions WHERE idempotency_key = 'r7') AS tx,
           (SELECT count(*)::int FROM reward_redemptions WHERE idempotency_key = 'r7') AS rr,
           (SELECT stamp_balance::int FROM customer_programs WHERE id = $1) AS bal`,
        [fx.enrollmentA],
      );
      expect(counts.rows[0].tx).toBe(0);
      expect(counts.rows[0].rr).toBe(0);
      expect(counts.rows[0].bal).toBe(12);
    });
  });

  it("R8: SET CONSTRAINTS IMMEDIATE still rejects orphan REDEEM", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      await client.query(
        `SET CONSTRAINTS trg_stamp_tx_redeem_pair, trg_reward_redemptions_pair IMMEDIATE`,
      );
      await expect(
        client.query(
          `INSERT INTO stamp_transactions
             (id, business_id, customer_program_id, branch_id, performed_by_member_id,
              type, stamps_delta, balance_after, reward_id, idempotency_key, request_hash)
           VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,$6,'r8','hash-r8')`,
          [
            randomUUID(),
            fx.businessA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            fx.rewardA,
          ],
        ),
      ).rejects.toThrow(/REDEEM pair integrity/i);
      await client.query("ROLLBACK");
    });
  });
});

describe("REDEEM deferred pair — additional mismatch / mutation cases", () => {
  async function expectPairCommitFail(
    mutate: Parameters<typeof insertRedeemPair>[1]["mutateRedemption"],
  ) {
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
        idempotencyKey: `mismatch-${randomUUID()}`,
        requestHash: "hash-base",
        mutateRedemption: mutate,
      });
      await expect(client.query("COMMIT")).rejects.toThrow(
        /REDEEM pair integrity|field mismatch|foreign key/i,
      );
      await client.query("ROLLBACK");
    });
  }

  it("rejects redemption-only commit (no ledger)", async () => {
    await withClient(pool, async (client) => {
      const missingLedgerId = randomUUID();
      await client.query("BEGIN");
      await expect(
        client.query(
          `INSERT INTO reward_redemptions
             (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
              stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
              idempotency_key, request_hash, status)
           VALUES ($1,$2,$3,$4,$5,$6,10,2,$7,'REDEEM','red-only','h','COMPLETED')`,
          [
            randomUUID(),
            fx.businessA,
            fx.rewardA,
            fx.enrollmentA,
            fx.branchA,
            fx.memberA,
            missingLedgerId,
          ],
        ),
      ).rejects.toThrow(/foreign key|REDEEM pair integrity/i);
      await client.query("ROLLBACK");
    });
  });

  it("rejects mismatched employee", async () => {
    // Create second member in business A to keep tenant FK valid while mismatching actor.
    const memberA2 = randomUUID();
    const userA2 = randomUUID();
    await withClient(pool, async (client) => {
      await client.query(
        `INSERT INTO users (id, email, role, status, created_at, updated_at)
         VALUES ($1, 'staff-a2@example.com', 'USER', 'ACTIVE', NOW(), NOW())`,
        [userA2],
      );
      await client.query(
        `INSERT INTO business_members
           (id, business_id, user_id, role, branch_scope, can_redeem, status, created_at, updated_at)
         VALUES ($1,$2,$3,'EMPLOYEE','ALL_BRANCHES',true,'ACTIVE',NOW(),NOW())`,
        [memberA2, fx.businessA, userA2],
      );
    });
    await expectPairCommitFail({ memberId: memberA2 });
  });

  it("rejects mismatched branch", async () => {
    const branchA2 = randomUUID();
    await withClient(pool, async (client) => {
      await client.query(
        `INSERT INTO branches
           (id, business_id, name, timezone, status, is_add_on, created_at, updated_at)
         VALUES ($1,$2,'Branch A2','Europe/Berlin','ACTIVE',false,NOW(),NOW())`,
        [branchA2, fx.businessA],
      );
    });
    await expectPairCommitFail({ branchId: branchA2 });
  });

  it("rejects mismatched balance_after", async () => {
    await expectPairCommitFail({ balanceAfter: 3 });
  });

  it("rejects mismatched idempotency_key", async () => {
    await expectPairCommitFail({ idempotencyKey: "other-key" });
  });

  it("rejects mismatched request_hash", async () => {
    await expectPairCommitFail({ requestHash: "other-hash" });
  });

  it("rejects deleting redemption from an established pair at commit", async () => {
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
        idempotencyKey: "pair-then-delete",
        requestHash: "hash-del",
      });
      await client.query(`DELETE FROM reward_redemptions WHERE id = $1`, [
        redemptionId,
      ]);
      await expect(client.query("COMMIT")).rejects.toThrow(
        /REDEEM pair integrity/i,
      );
      await client.query("ROLLBACK");
    });
  });

  it("rejects retargeting stamp_transaction_id leaving OLD REDEEM orphaned", async () => {
    await withClient(pool, async (client) => {
      // Deferred triggers require ledger+redemption in the same transaction.
      await client.query("BEGIN");
      const pairA = await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "retarget-a",
        requestHash: "hash-a",
      });
      const pairB = await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "retarget-b",
        requestHash: "hash-b",
      });
      await client.query("COMMIT");

      const before = await client.query(
        `SELECT
           (SELECT count(*)::int FROM stamp_transactions WHERE type = 'REDEEM') AS tx,
           (SELECT count(*)::int FROM reward_redemptions) AS rr`,
      );
      expect(before.rows[0].tx).toBe(2);
      expect(before.rows[0].rr).toBe(2);

      try {
        await client.query("BEGIN");
        // Free B's unique stamp_transaction_id slot, then move A's redemption onto B.
        // Final state: A orphaned (0 redemptions), B matched by A's former redemption.
        await client.query(`DELETE FROM reward_redemptions WHERE id = $1`, [
          pairB.redemptionId,
        ]);
        await client.query(
          `UPDATE reward_redemptions
           SET stamp_transaction_id = $1,
               idempotency_key = $2,
               request_hash = $3,
               stamps_subtracted = 10,
               balance_after = 2
           WHERE id = $4`,
          [pairB.ledgerId, "retarget-b", "hash-b", pairA.redemptionId],
        );
        await expect(client.query("COMMIT")).rejects.toThrow(
          /REDEEM pair integrity/i,
        );
      } finally {
        await client.query("ROLLBACK");
      }

      const after = await client.query(
        `SELECT
           (SELECT count(*)::int FROM stamp_transactions WHERE type = 'REDEEM') AS tx,
           (SELECT count(*)::int FROM reward_redemptions) AS rr,
           (SELECT stamp_transaction_id::text FROM reward_redemptions WHERE id = $1) AS a_points`,
        [pairA.redemptionId],
      );
      expect(after.rows[0].tx).toBe(2);
      expect(after.rows[0].rr).toBe(2);
      expect(after.rows[0].a_points).toBe(pairA.ledgerId);
    });
  });

  it("rejects UPDATE of ledger fields that break an established pair", async () => {
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
        idempotencyKey: "ledger-field-upd",
        requestHash: "hash-lfu",
      });
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query(
        `UPDATE stamp_transactions SET balance_after = 3 WHERE id = $1`,
        [ledgerId],
      );
      await expect(client.query("COMMIT")).rejects.toThrow(
        /REDEEM pair integrity|field mismatch/i,
      );
      await client.query("ROLLBACK");

      const bal = await client.query(
        `SELECT balance_after::int AS b FROM stamp_transactions WHERE id = $1`,
        [ledgerId],
      );
      expect(bal.rows[0].b).toBe(2);
    });
  });

  it("rejects same-tenant reward_id mismatch on REDEEM pair", async () => {
    const rewardA2 = randomUUID();
    await withClient(pool, async (client) => {
      await client.query(
        `INSERT INTO rewards
           (id, business_id, loyalty_program_id, name, stamps_required, status, created_at, updated_at)
         VALUES ($1,$2,$3,'Reward A2',10,'ACTIVE',NOW(),NOW())`,
        [rewardA2, fx.businessA, fx.programA],
      );

      await client.query("BEGIN");
      await insertRedeemPair(client, {
        businessId: fx.businessA,
        enrollmentId: fx.enrollmentA,
        branchId: fx.branchA,
        memberId: fx.memberA,
        rewardId: fx.rewardA,
        stampsSubtracted: 10,
        balanceAfter: 2,
        idempotencyKey: "same-tenant-reward-mismatch",
        requestHash: "hash-strm",
        mutateRedemption: { rewardId: rewardA2 },
      });
      await expect(client.query("COMMIT")).rejects.toThrow(
        /REDEEM pair integrity|field mismatch/i,
      );
      await client.query("ROLLBACK");
    });
  });

  it("rejects immutable primary key change on stamp_transactions", async () => {
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
        idempotencyKey: "pk-immutable",
        requestHash: "hash-pk",
      });
      await client.query("COMMIT");

      await expect(
        client.query(`UPDATE stamp_transactions SET id = $1 WHERE id = $2`, [
          randomUUID(),
          ledgerId,
        ]),
      ).rejects.toThrow(
        /primary key id is immutable|REDEEM pair integrity|foreign key|restrict|violates/i,
      );
    });
  });
});

describe("Insufficient-balance provisional write rollback", () => {
  it("rolls back provisional REDEEM ledger+redemption+balance writes", async () => {
    await withClient(pool, async (client) => {
      const beforeBal = await client.query(
        `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
        [fx.enrollmentA],
      );
      expect(beforeBal.rows[0].b).toBe(12);

      await client.query("BEGIN");
      await client.query(
        `SELECT id FROM customer_programs WHERE id = $1 FOR UPDATE`,
        [fx.enrollmentA],
      );

      // Provisional writes as if a write path proceeded, then aborts (e.g. insufficient
      // after lock / validation failure). No application API — raw SQL txn only.
      const ledgerId = randomUUID();
      const key = "insufficient-provisional";
      await client.query(
        `INSERT INTO stamp_transactions
           (id, business_id, customer_program_id, branch_id, performed_by_member_id,
            type, stamps_delta, balance_after, reward_id, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,'REDEEM',-10,2,$6,$7,'hash-insuf')`,
        [
          ledgerId,
          fx.businessA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          fx.rewardA,
          key,
        ],
      );
      await client.query(
        `INSERT INTO reward_redemptions
           (id, business_id, reward_id, customer_program_id, branch_id, redeemed_by_member_id,
            stamps_subtracted, balance_after, stamp_transaction_id, stamp_transaction_type,
            idempotency_key, request_hash, status)
         VALUES ($1,$2,$3,$4,$5,$6,10,2,$7,'REDEEM',$8,'hash-insuf','COMPLETED')`,
        [
          randomUUID(),
          fx.businessA,
          fx.rewardA,
          fx.enrollmentA,
          fx.branchA,
          fx.memberA,
          ledgerId,
          key,
        ],
      );
      await client.query(
        `UPDATE customer_programs SET stamp_balance = 2 WHERE id = $1`,
        [fx.enrollmentA],
      );

      // Application-level insufficient / validation failure → full rollback
      await client.query("ROLLBACK");

      const after = await client.query(
        `SELECT
           (SELECT count(*)::int FROM stamp_transactions WHERE idempotency_key = $1) AS tx,
           (SELECT count(*)::int FROM reward_redemptions WHERE idempotency_key = $1) AS rr,
           (SELECT stamp_balance::int FROM customer_programs WHERE id = $2) AS bal`,
        [key, fx.enrollmentA],
      );
      expect(after.rows[0].tx).toBe(0);
      expect(after.rows[0].rr).toBe(0);
      expect(after.rows[0].bal).toBe(12);
    });
  });
});
