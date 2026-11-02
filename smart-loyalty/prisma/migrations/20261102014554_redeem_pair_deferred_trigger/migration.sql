-- Phase 1B.2: DEFERRABLE INITIALLY DEFERRED REDEEM pair integrity.
-- Validates at COMMIT so ledger-first / redemption-second works mid-transaction,
-- while orphan or mismatched pairs cannot commit.

CREATE OR REPLACE FUNCTION redeem_pair_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_ledger record;
  v_redemption record;
  v_redemption_count integer;
BEGIN
  IF TG_TABLE_NAME = 'stamp_transactions' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.type = 'REDEEM' THEN
        v_tx_id := OLD.id;
      ELSE
        RETURN OLD;
      END IF;
    ELSE
      IF NEW.type = 'REDEEM' OR (TG_OP = 'UPDATE' AND OLD.type = 'REDEEM') THEN
        v_tx_id := NEW.id;
      ELSE
        RETURN NEW;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'reward_redemptions' THEN
    IF TG_OP = 'DELETE' THEN
      v_tx_id := OLD.stamp_transaction_id;
    ELSE
      v_tx_id := NEW.stamp_transaction_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'redeem_pair_integrity: unexpected table %', TG_TABLE_NAME;
  END IF;

  SELECT *
  INTO v_ledger
  FROM stamp_transactions
  WHERE id = v_tx_id;

  SELECT count(*)::integer
  INTO v_redemption_count
  FROM reward_redemptions
  WHERE stamp_transaction_id = v_tx_id;

  -- DELETE of REDEEM ledger (or redemption leaving no ledger): end state must not
  -- leave a dangling partner.
  IF v_ledger.id IS NULL THEN
    IF v_redemption_count > 0 THEN
      RAISE EXCEPTION
        'REDEEM pair integrity: reward_redemptions exist without stamp_transactions id=%',
        v_tx_id;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_ledger.type <> 'REDEEM' THEN
    IF v_redemption_count > 0 THEN
      RAISE EXCEPTION
        'REDEEM pair integrity: redemptions reference non-REDEEM ledger id=% type=%',
        v_tx_id, v_ledger.type;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Every REDEEM ledger row must have exactly one matching redemption at commit.
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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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
