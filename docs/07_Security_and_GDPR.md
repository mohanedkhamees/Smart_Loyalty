# Smart Loyalty – Security and GDPR

**Document:** 07_Security_and_GDPR  
**Phase:** 0 (Documentation – refined)  
**Status:** Draft for approval  
**Last updated:** 2026-11-01 (verified integrity pass)

---

## 1. Purpose

Security and privacy design baseline. **Not legal advice.** Formal DPIA, DPA language, and counsel review are required before production processing of personal data at scale.

Legal role allocation that cannot yet be determined is marked as an **unresolved legal decision**.

---

## 2. Threat model (summary)

| Threat | Example | Control |
|--------|---------|---------|
| Cross-tenant access | Staff of A reads B | `business_id` scoping, composite FKs, RLS, server authz |
| Privilege escalation | Customer self-stamps; Employee adjusts | Staff-only APIs; ADJUST/REVERSAL Owner/Manager only; REDEEM separate |
| Duplicate stamp/redeem/adjust | Double-submit or key reuse with new payload | Idempotency keys + request_hash; replay vs conflict |
| QR guessing | Brute force token | CSPRNG; hash at rest; rate limits; tenant-scoped lookup |
| Session hijacking | Cookie theft | HTTPS; secure cookies; Supabase session practices |
| Secret exposure | Keys in git | Env/secret store only |
| Insider abuse | Extra stamps | Audit with member + branch + reason (adjust) |
| Connection misuse | Prisma service role | Never expose to browser; app authz mandatory |

---

## 3. Strict tenant isolation

1. Authenticate every protected operation.  
2. Authorize via ACTIVE `business_members` (or platform admin for `/admin` only).  
3. Derive `business_id` server-side from membership.  
4. Validate related entities share `business_id` (composite FKs).  
5. Employees never query other businesses’ customers.  
6. Treat isolation failures as Sev-1.

---

## 4. PostgreSQL RLS and Prisma pooling

| Aspect | Strategy |
|--------|----------|
| RLS goal | Defense in depth for non-bypass DB roles |
| Tenant tables | RLS by `business_id` (Phase 1 SQL companion) |
| Global tables | Separate policies (`users`, `customers`, `subscription_plans`) |
| Prisma | Uses pooled connection to Supabase; often privileged role |
| Rule | **App authz is mandatory** even when RLS is bypassed by service role |
| Pooling | **Required** from Phase 1 (Supabase pooler or equivalent) — free direct limits are insufficient for serverless |

---

## 5. Server-side authorization

Sensitive operations (earn, redeem, adjust, branch create, member invite, subscription changes, exports) run only on the server with role, branch-scope, and status checks. Clients never receive service-role keys.

---

## 6. Secure QR tokens

| Step | Requirement |
|------|-------------|
| Generate | CSPRNG ≥ 128 bits |
| Store | `qr_token_hash`; optional AEAD ciphertext for re-display; **no plaintext secret column** |
| Validate | Hash → lookup → assert enrollment `business_id` |
| Rotate | Supported via `qr_last_rotated_at` |
| Rate limit | Scan and stamp endpoints |

---

## 7. Idempotency and abuse controls

- **Required** idempotency keys + `request_hash` for `EARN`, `REDEEM`, `ADJUST`, and `REVERSAL`.  
- Unique per `(business_id, idempotency_key)` on the stamp ledger.  
- **Concurrent same key (PostgreSQL-safe):** `INSERT … ON CONFLICT (business_id, idempotency_key) DO NOTHING`, then `SELECT` existing row and compare `request_hash` (match → original result; differ → CONFLICT); **never** apply a second balance change.  
- Do not use exception-catching of unique violations as the primary control path.  
- Rate limit auth, QR lookup, stamp, redeem, adjust, and reverse surfaces.  
- Numeric rate thresholds **TBD** (operational tuning).

---

## 8. Audit trail

| Event | Record |
|-------|--------|
| EARN | Ledger `EARN`; `reward_id` NULL; member, branch, delta, balance_after, idempotency fields |
| REDEEM | Ledger `REDEEM` (`reward_id` NOT NULL) **and** matching `reward_redemptions`; single balance update |
| ADJUST | Ledger only; Owner/Manager; reason required |
| REVERSAL | Ledger only; Owner/Manager; reason; `reversal_of_transaction_id`; composite FK same business+enrollment; once per original; amount policy **TBD** |
| Cancel redemption | **Not in MVP**; no `CANCELLED` status; policy **TBD** |
| Wallet sync | `wallet_passes.last_synced_at` / metadata |

Prefer append-oriented history; corrections via compensating transactions.

---

## 9. Historical retention and archiving

| Topic | Policy |
|-------|--------|
| Stamp / redemption history | Retain for audit; do not hard-delete on branch inactivation |
| Branch archive | `INACTIVE` + `archived_at`; block new ops; keep FKs to history |
| Business archive | `SUSPENDED` / `CLOSED`; block writes; retain data per retention |
| Draft retention window | 24 months after last enrollment activity for txn history — **confirm with counsel** |
| Erasure requests | Anonymize identity; txn handling **TBD with counsel** |

---

## 10. Data minimization for employees

Employees see display name, balance, reward availability, limited recent history for **this business** — not email/phone by default.

---

## 11. GDPR

### 11.1 Controller / processor — unresolved legal decision

**Unresolved legal decision:** Whether the platform operator is controller, joint controller, and/or processor for tenant customer loyalty data; DPA/SCC templates. Engineering still implements export/deletion capabilities and isolation without claiming a final legal allocation.

### 11.2 Data subject capabilities

| Right | Approach |
|-------|----------|
| Access / portability | Export profile, enrollments, stamps, redemptions |
| Rectification | Edit profile fields |
| Erasure | Process **TBD with counsel** |
| Restriction | Status flags on customers / enrollments |

### 11.3 Transfers and children

Prefer EU Postgres (Frankfurt if available). Subprocessors documented when chosen. Children: no knowingly onboarding; age-gate **TBD** if market requires.

---

## 12. Application security practices

HTTPS; server input validation; Next.js Server Action CSRF protections; Prisma parameterization; secrets in env; least privilege (no employee billing).

---

## 13. Stamp / redeem / adjust checklist

1. Valid session.  
2. ACTIVE membership; correct role (`ADJUST`/`REVERSAL` ⇒ Owner/Manager; `REDEEM` ⇒ `can_redeem`).  
3. Branch ∈ business and permitted.  
4. Enrollment ∈ same business.  
5. Idempotency resolved (replay vs conflict vs apply).  
6. Rate limit OK.  
7. Status gates (suspended/closed; PAST_DUE grace **TBD**).  
8. Transactional lock + audit fields; redeem uses ledger type `REDEEM` only.  
9. Insufficient redeem balance → full transaction rollback and `INSUFFICIENT_BALANCE` (no REDEEM/`reward_redemptions`/balance/wallet side effects).  
10. Customer cannot call staff earn/redeem/adjust successfully.

---

## 14. Incident response (lightweight)

Rotate secrets; suspend tenant if cross-tenant breach; assess notification duties **with counsel**; postmortem + isolation tests.

---

## 15. Related documents

- `02_System_Architecture.md`  
- `03_Database_Design.md`  
- `04_User_Roles_and_Permissions.md`  
- `10_Free_Infrastructure_and_Costs.md`  
