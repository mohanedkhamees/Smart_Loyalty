# RLS preparation (Phase 1B.2)

**Status:** Preparation only. RLS is **not** fully enabled or complete.

App authorization remains mandatory even when a DB role bypasses RLS
(see `docs/07_Security_and_GDPR.md`).

## Policy matrix (draft)

| Table                       | Tenant key    | Intended policy shape                              | Notes                  |
| --------------------------- | ------------- | -------------------------------------------------- | ---------------------- |
| `businesses`                | `id`          | member of business OR platform admin               | Root tenant            |
| `business_members`          | `business_id` | same-business members; users see own rows          |                        |
| `member_branch_assignments` | `business_id` | same-business                                      |                        |
| `branches`                  | `business_id` | same-business                                      |                        |
| `loyalty_programs`          | `business_id` | same-business                                      |                        |
| `rewards`                   | `business_id` | same-business                                      |                        |
| `customer_programs`         | `business_id` | same-business staff; customer sees own enrollments |                        |
| `wallet_passes`             | `business_id` | same-business / owning customer                    |                        |
| `stamp_transactions`        | `business_id` | same-business staff; customer limited history      | Append-oriented        |
| `reward_redemptions`        | `business_id` | same-business                                      |                        |
| `subscriptions`             | `business_id` | owners/managers billing scope                      |                        |
| `users`                     | global        | self + constrained admin                           | Not tenant-keyed       |
| `customers`                 | global        | self + staff via enrollment join                   | Not tenant-keyed alone |
| `subscription_plans`        | global        | read for authenticated; write platform admin       | Catalog                |

## Session model (TBD with auth phase)

Suggested server pattern after Auth SSR exists:

```sql
SELECT set_config('app.business_id', '<uuid>', true);
SELECT set_config('app.user_id', '<uuid>', true);
```

Policies would compare `business_id::text = current_setting('app.business_id', true)`.

Exact JWT claim → setting mapping is **not** finalized in 1B.2.

## Companion SQL (stubs — do not apply as “complete RLS”)

See `00_enable_rls_stubs.sql`. These statements are documentation aids for a later
phase. Applying them without session variables and non-bypass roles can lock out
migrations/seeds.

## Explicit non-claims

- RLS is not enabled as a finished security control in Phase 1B.2.
- Composite FKs / CHECKs / deferred REDEEM triggers are the integrity controls delivered now.
- Service-role / Prisma bypass roles must still go through application authz.
