-- Fix deferred REDEEM pair integrity: on UPDATE, validate both OLD and NEW
-- stamp_transaction_id / ledger id so abandoned partners cannot orphan.
-- Also reject primary-key changes on stamp_transactions and reward_redemptions
-- (IDs are immutable for pair integrity).

CREATE OR REPLACE FUNCTION redeem_pair_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
  v_tx_id uuid;
  v_ledger record;
  v_redemption record;
  v_redemption_count integer;
BEGIN
  -- Immutable primary keys: changing id would bypass pair tracking.
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION
      'REDEEM pair integrity: primary key id is immutable on % (old=%, new=%)',
      TG_TABLE_NAME, OLD.id, NEW.id;
  END IF;

  IF TG_TABLE_NAME = 'stamp_transactions' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.type = 'REDEEM' THEN
        v_ids := array_append(v_ids, OLD.id);
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      IF NEW.type = 'REDEEM' THEN
        v_ids := array_append(v_ids, NEW.id);
      END IF;
    ELSE
      -- UPDATE: validate NEW and/or OLD when either side is/was REDEEM
      IF NEW.type = 'REDEEM' THEN
        v_ids := array_append(v_ids, NEW.id);
      END IF;
      IF OLD.type = 'REDEEM' AND OLD.id IS DISTINCT FROM NEW.id THEN
        v_ids := array_append(v_ids, OLD.id);
      ELSIF OLD.type = 'REDEEM' AND NEW.type IS DISTINCT FROM OLD.type THEN
        -- type changed away from REDEEM: still validate OLD id end-state
        v_ids := array_append(v_ids, OLD.id);
      ELSIF OLD.type = 'REDEEM' THEN
        -- same id still REDEEM (field updates): already covered by NEW.id above
        NULL;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'reward_redemptions' THEN
    IF TG_OP = 'DELETE' THEN
      v_ids := array_append(v_ids, OLD.stamp_transaction_id);
    ELSIF TG_OP = 'INSERT' THEN
      v_ids := array_append(v_ids, NEW.stamp_transaction_id);
    ELSE
      -- UPDATE: always validate NEW; also validate OLD when stamp_transaction_id changes
      v_ids := array_append(v_ids, NEW.stamp_transaction_id);
      IF OLD.stamp_transaction_id IS DISTINCT FROM NEW.stamp_transaction_id THEN
        v_ids := array_append(v_ids, OLD.stamp_transaction_id);
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'redeem_pair_integrity: unexpected table %', TG_TABLE_NAME;
  END IF;

  -- Deduplicate ids to validate
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(v_ids) AS x WHERE x IS NOT NULL)
  INTO v_ids;

  FOREACH v_tx_id IN ARRAY v_ids
  LOOP
    SELECT *
    INTO v_ledger
    FROM stamp_transactions
    WHERE id = v_tx_id;

    SELECT count(*)::integer
    INTO v_redemption_count
    FROM reward_redemptions
    WHERE stamp_transaction_id = v_tx_id;

    IF v_ledger.id IS NULL THEN
      IF v_redemption_count > 0 THEN
        RAISE EXCEPTION
          'REDEEM pair integrity: reward_redemptions exist without stamp_transactions id=%',
          v_tx_id;
      END IF;
      CONTINUE;
    END IF;

    IF v_ledger.type <> 'REDEEM' THEN
      IF v_redemption_count > 0 THEN
        RAISE EXCEPTION
          'REDEEM pair integrity: redemptions reference non-REDEEM ledger id=% type=%',
          v_tx_id, v_ledger.type;
      END IF;
      CONTINUE;
    END IF;

    IF v_redemption_count <> 1 THEN
      RAISE EXCEPTION
        'REDEEM pair integrity: REDEEM ledger id=% requires exactly one reward_redemptions row (found %)',
        v_tx_id, v_redemption_count;
    END IF;

    SELECT *
    INTO v_redemption
    FROM reward_redemptions
    WHERE stamp_transaction_id = v_tx_id;

    IF v_redemption.business_id IS DISTINCT FROM v_ledger.business_id
       OR v_redemption.customer_program_id IS DISTINCT FROM v_ledger.customer_program_id
       OR v_redemption.branch_id IS DISTINCT FROM v_ledger.branch_id
       OR v_redemption.redeemed_by_member_id IS DISTINCT FROM v_ledger.performed_by_member_id
       OR v_redemption.reward_id IS DISTINCT FROM v_ledger.reward_id
       OR v_redemption.stamps_subtracted IS DISTINCT FROM abs(v_ledger.stamps_delta)
       OR v_redemption.balance_after IS DISTINCT FROM v_ledger.balance_after
       OR v_redemption.idempotency_key IS DISTINCT FROM v_ledger.idempotency_key
       OR v_redemption.request_hash IS DISTINCT FROM v_ledger.request_hash
       OR v_redemption.stamp_transaction_type IS DISTINCT FROM 'REDEEM'::"StampTransactionType"
    THEN
      RAISE EXCEPTION
        'REDEEM pair integrity: field mismatch between ledger id=% and reward_redemptions',
        v_tx_id;
    END IF;

    IF v_ledger.reward_id IS NULL THEN
      RAISE EXCEPTION
        'REDEEM pair integrity: ledger id=% has NULL reward_id',
        v_tx_id;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate triggers to bind the replaced function (same names / deferred semantics).
DROP TRIGGER IF EXISTS trg_stamp_tx_redeem_pair ON stamp_transactions;
CREATE CONSTRAINT TRIGGER trg_stamp_tx_redeem_pair
  AFTER INSERT OR UPDATE OR DELETE ON stamp_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION redeem_pair_integrity();

DROP TRIGGER IF EXISTS trg_reward_redemptions_pair ON reward_redemptions;
CREATE CONSTRAINT TRIGGER trg_reward_redemptions_pair
  AFTER INSERT OR UPDATE OR DELETE ON reward_redemptions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION redeem_pair_integrity();
