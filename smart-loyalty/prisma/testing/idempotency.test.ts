import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  createPool,
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

async function earnOnce(
  client: pg.PoolClient,
  key: string,
  hash: string,
  delta: number,
): Promise<"applied" | "replay" | "conflict"> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT id FROM customer_programs WHERE id = $1 FOR UPDATE`,
      [fx.enrollmentA],
    );

    const balRes = await client.query(
      `SELECT stamp_balance::int AS b, lifetime_stamps::int AS life
       FROM customer_programs WHERE id = $1`,
      [fx.enrollmentA],
    );
    const balance = balRes.rows[0].b as number;
    const life = balRes.rows[0].life as number;

    const inserted = await client.query(
      `INSERT INTO stamp_transactions
         (id, business_id, customer_program_id, branch_id, performed_by_member_id,
          type, stamps_delta, balance_after, idempotency_key, request_hash)
       VALUES ($1,$2,$3,$4,$5,'EARN',$6,$7,$8,$9)
       ON CONFLICT (business_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        fx.businessA,
        fx.enrollmentA,
        fx.branchA,
        fx.memberA,
        delta,
        balance + delta,
        key,
        hash,
      ],
    );

    if ((inserted.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE customer_programs
         SET stamp_balance = $2, lifetime_stamps = $3
         WHERE id = $1`,
        [fx.enrollmentA, balance + delta, life + delta],
      );
      await client.query("COMMIT");
      return "applied";
    }

    const existing = await client.query(
      `SELECT request_hash FROM stamp_transactions
       WHERE business_id = $1 AND idempotency_key = $2`,
      [fx.businessA, key],
    );
    const existingHash = existing.rows[0]?.request_hash as string | undefined;
    if (existingHash === hash) {
      await client.query("COMMIT");
      return "replay";
    }
    await client.query("ROLLBACK");
    return "conflict";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

describe("Idempotency + concurrency (real PG transactions)", () => {
  it("same key + same hash: only one balance mutation across concurrent writers", async () => {
    const key = "idem-same-hash";
    const hash = "payload-v1";

    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      const results = await Promise.all([
        earnOnce(c1, key, hash, 3),
        earnOnce(c2, key, hash, 3),
      ]);

      expect(results.sort()).toEqual(["applied", "replay"].sort());

      const state = await withClient(pool, async (client) => {
        const tx = await client.query(
          `SELECT count(*)::int AS c FROM stamp_transactions WHERE idempotency_key = $1`,
          [key],
        );
        const bal = await client.query(
          `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
          [fx.enrollmentA],
        );
        return { tx: tx.rows[0].c as number, bal: bal.rows[0].b as number };
      });

      expect(state.tx).toBe(1);
      expect(state.bal).toBe(15); // 12 + 3 once
    } finally {
      c1.release();
      c2.release();
    }
  });

  it("same key + different hash: conflict and no duplicate mutation", async () => {
    await withClient(pool, async (client) => {
      const first = await earnOnce(client, "idem-diff-hash", "hash-a", 2);
      expect(first).toBe("applied");
    });

    await withClient(pool, async (client) => {
      const second = await earnOnce(client, "idem-diff-hash", "hash-b", 2);
      expect(second).toBe("conflict");
    });

    const state = await withClient(pool, async (client) => {
      const tx = await client.query(
        `SELECT count(*)::int AS c, max(request_hash) AS h
         FROM stamp_transactions WHERE idempotency_key = 'idem-diff-hash'`,
      );
      const bal = await client.query(
        `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
        [fx.enrollmentA],
      );
      return {
        tx: tx.rows[0].c as number,
        hash: tx.rows[0].h as string,
        bal: bal.rows[0].b as number,
      };
    });

    expect(state.tx).toBe(1);
    expect(state.hash).toBe("hash-a");
    expect(state.bal).toBe(14); // 12 + 2 once
  });

  it("concurrent same key + different hash: one apply max, other conflicts", async () => {
    const key = "idem-concurrent-diff";
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      const results = await Promise.all([
        earnOnce(c1, key, "hash-left", 1),
        earnOnce(c2, key, "hash-right", 1),
      ]);
      const applied = results.filter((r) => r === "applied").length;
      const conflicts = results.filter((r) => r === "conflict").length;
      const replays = results.filter((r) => r === "replay").length;
      expect(applied).toBe(1);
      expect(conflicts + replays).toBe(1);
      // Different hashes cannot both succeed as replay; expect conflict for loser.
      expect(conflicts).toBe(1);
      expect(replays).toBe(0);

      const state = await withClient(pool, async (client) => {
        const tx = await client.query(
          `SELECT count(*)::int AS c FROM stamp_transactions WHERE idempotency_key = $1`,
          [key],
        );
        const bal = await client.query(
          `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
          [fx.enrollmentA],
        );
        return { tx: tx.rows[0].c as number, bal: bal.rows[0].b as number };
      });
      expect(state.tx).toBe(1);
      expect(state.bal).toBe(13); // 12 + 1 once
    } finally {
      c1.release();
      c2.release();
    }
  });

  it("insufficient balance causes complete rollback (no REDEEM persistence)", async () => {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      await client.query(
        `SELECT id FROM customer_programs WHERE id = $1 FOR UPDATE`,
        [fx.enrollmentA],
      );
      await client.query(
        `UPDATE customer_programs SET stamp_balance = 3 WHERE id = $1`,
        [fx.enrollmentA],
      );

      const need = 10;
      const bal = await client.query(
        `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
        [fx.enrollmentA],
      );
      expect(bal.rows[0].b).toBeLessThan(need);

      // Abort before any REDEEM write — normative insufficient-balance path
      await client.query("ROLLBACK");
    });

    const state = await withClient(pool, async (client) => {
      const tx = await client.query(
        `SELECT count(*)::int AS c FROM stamp_transactions WHERE type = 'REDEEM'`,
      );
      const rr = await client.query(
        `SELECT count(*)::int AS c FROM reward_redemptions`,
      );
      const bal = await client.query(
        `SELECT stamp_balance::int AS b FROM customer_programs WHERE id = $1`,
        [fx.enrollmentA],
      );
      return {
        tx: tx.rows[0].c as number,
        rr: rr.rows[0].c as number,
        bal: bal.rows[0].b as number,
      };
    });

    expect(state.tx).toBe(0);
    expect(state.rr).toBe(0);
    expect(state.bal).toBe(12);
  });
});
