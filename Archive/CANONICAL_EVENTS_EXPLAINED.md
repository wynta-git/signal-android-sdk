# Canonical Events: Design & Benefits 

## Overview

Your system defines **3 separate canonical money events**:
- `money.deposit` — User deposits money into the account
- `money.transfer` — User transfers money to another account
- `money.credit` — User receives credit (passive inflow, not initiated by user)

---

## Why 3 Separate Events (Not Grouped)?

### Problem: Different Semantics

Even though all 3 represent "money movement," they have **fundamentally different meanings**:

| Aspect | Deposit | Transfer | Credit |
|--------|---------|----------|--------|
| **Direction** | Money IN (user action) | Money OUT (user action) | Money IN (passive) |
| **Trigger** | Active (user initiated) | Active (user initiated) | Passive (system/admin) |
| **Business Context** | User funding account | User sending money | Cashback, bonus, refund |
| **Fraud Risk** | Low (inflow only) | High (can lose funds) | Low (gain only) |
| **Property Needs** | amount, currency, status, method | amount, currency, recipient, status | amount, reason, campaign |
| **Compliance** | KYC requirements | Transaction limits | Bonus tracking |

### Example: Why Grouping Fails

If you **grouped** them as a single `money.transaction` event:

```json
// ❌ Bad: All money movements lumped together
{
  "canonical_event": "money.transaction",
  "properties": {
    "type": "deposit|transfer|credit",  // Need extra field
    "amount": 500,
    "direction": "inbound|outbound"      // Ambiguous
  }
}
```

**Problems:**
- Rules become complex: `WHERE properties.type = 'deposit'` (inefficient string matching)
- Queries mix unrelated logic: funding checks + fraud detection + bonus tracking
- Hard to optimize: different business teams care about different events
- Privacy concerns: why should transfer events see deposit properties?

### Solution: Semantic Separation ✅

```json
// ✅ Good: Each event type is explicit
// Event 1
{
  "canonical_event": "money.deposit",
  "properties": {
    "amount": 500,
    "currency": "INR",
    "status": "success",
    "method": "bank_transfer"
  }
}

// Event 2
{
  "canonical_event": "money.transfer",
  "properties": {
    "amount": 500,
    "currency": "INR",
    "recipient_id": "user456",
    "status": "success"
  }
}

// Event 3
{
  "canonical_event": "money.credit",
  "properties": {
    "amount": 500,
    "reason": "cashback",
    "campaign_id": "SUMMER2026"
  }
}
```

---

## Benefits of Separate Canonical Events

### 1. **Cleaner SQL Queries** 📊

```sql
-- ✅ Simple: Find high-value depositors
SELECT DISTINCT user_id
FROM events_raw
WHERE canonical_event = 'money.deposit'
  AND event_time >= now() - interval 30 day
  AND event_id IN (
    SELECT event_id FROM event_props 
    WHERE key='amount' AND value_number >= 500
  );

-- ❌ Complex: If grouped as money.transaction
SELECT DISTINCT user_id
FROM events_raw e
WHERE e.canonical_event = 'money.transaction'
  AND e.event_time >= now() - interval 30 day
  AND e.event_id IN (
    SELECT event_id FROM event_props 
    WHERE key='type' AND value_string='deposit'
      AND key='amount' AND value_number >= 500  -- Wrong! Can't join same key twice
  );
```

### 2. **Targeted Rules** 🎯

Your rules.py file shows different query patterns for each event:

```python
# Rule 1: Deposits (KYC eligibility)
def high_value_inr_deposit_query(...):
    return f"""
    SELECT 1 FROM poc.events_raw
    WHERE canonical_event = 'money.deposit'
      AND amount >= 500 AND currency = 'INR'
    """

# Rule 2: Transfers (Fraud detection)
def rule_trigger_on_transfer_query(...):
    return f"""
    SELECT 1 FROM poc.events_raw
    WHERE canonical_event = 'money.transfer'
      AND event_time >= now() - interval 7 day
    """

# These rules are team-specific:
# - Deposits: Compliance team (KYC)
# - Transfers: Risk team (Fraud, limits)
```

### 3. **Index & Query Optimization** ⚡

```sql
-- ✅ Can create targeted indexes
CREATE INDEX idx_deposit_amount 
ON events_raw 
WHERE canonical_event = 'money.deposit' 
ORDER BY amount DESC, event_time DESC;

CREATE INDEX idx_transfer_by_user 
ON events_raw 
WHERE canonical_event = 'money.transfer' 
ORDER BY user_id, event_time DESC;

-- ❌ If grouped, indexes cover all 3 types (less effective)
```

### 4. **Different Retention Policies** 🗂️

```sql
-- ✅ Business can set different retention
ALTER TABLE events_raw_deposits TTL event_time + INTERVAL 7 YEAR;
ALTER TABLE events_raw_transfers TTL event_time + INTERVAL 10 YEAR;  -- Regulatory requirement
ALTER TABLE events_raw_credits TTL event_time + INTERVAL 2 YEAR;    -- Short-lived promos

-- ❌ If grouped, can't apply selective retention
```

### 5. **Team Ownership & Debugging** 👥

```
Deposits Team: "Our canonical event is money.deposit"
  - Owns: funding, KYC, payment methods
  - Logs: "Event count: 5,234" (just deposits)
  - Can't be confused with transfers

Transfer Team: "Our canonical event is money.transfer"
  - Owns: fraud detection, limits, recipient validation
  - Logs: "Event count: 12,890" (just transfers)
  - Separate monitoring & alerting

Credit/Promo Team: "Our canonical event is money.credit"
  - Owns: cashback, referrals, promotions
  - Logs: "Event count: 892" (just credits)
```

### 6. **Scalability & Parallelization** 🚀

```python
# ✅ Can process each event type independently
WORKERS = {
    'money.deposit': DepositWorker(fraud_check=False),
    'money.transfer': TransferWorker(fraud_check=True, rate_limit=True),
    'money.credit': CreditWorker(dedup_strict=True),
}

# Route events to right worker
route_to_worker(canonical_event)

# ❌ If grouped, one complex worker handles all logic
```

### 7. **Audit & Compliance Trails** 📋

```
✅ Separate tables = Clear audit:
   - User deposits: 10,500 EUR ← Verify source
   - User transfers: 500 EUR ← Verify destination
   - User credits: 100 EUR cashback ← Verify campaign

❌ Grouped = Confusing audit:
   - User transaction: +10,500 EUR (type: deposit)
   - User transaction: -500 EUR (type: transfer)
   - User transaction: +100 EUR (type: credit)
   → Which ones are regulatory? Easy to miss.
```

---

## Mapping Strategy

Your `canonical_map.json` shows how **client-specific raw events** map to **canonical events**:

```json
{
  "client_id": "client1",
  "event_name": "Deposit",           // Raw event from client1
  "canonical_event": "money.deposit"  // Our canonical form
},
{
  "client_id": "client2",
  "event_name": "MoneyTransferred",         // Different name, same meaning
  "canonical_event": "money.transfer"      // Normalized
},
{
  "client_id": "client3",
  "event_name": "credited",                // Different meaning even though similar name
  "canonical_event": "money.credit"        // Correctly classified
}
```

**Why this layer?**
- Different clients use different names for same event
- Normalization → Single source of truth
- Central control → Easy to update across all clients

---

## When You Might Group Events

❌ **DON'T group if:**
- Different teams own the events
- Different properties needed
- Different compliance requirements
- Different query patterns

✅ **You COULD group if:**
- Same properties required
- Same business rules apply
- Same retention & compliance
- Same team owns both

Example: `payment.initiated` + `payment.processing` → Could be grouped as `payment.*` if they share rules.

---

## Summary Table

| Aspect | Separate (✅ Your Design) | Grouped (❌) |
|--------|---------------------------|------------|
| Query complexity | Simple WHERE clause | Complex JOINs & type checks |
| Performance | Optimized indexes | Broad indexes, slower scans |
| Team clarity | Clear ownership | Ambiguous responsibility |
| Rule definition | Event-specific | Type-field checks |
| Compliance audit | Clear trails per type | Mixed logs, hard to audit |
| Future scaling | Easy to split into services | Harder to parallelize |
| Data retention | Flexible per type | One-size-fits-all TTL |

---

## Your Current Rules

In `worker/rules.py`, you'll see why separation matters:

```python
# Rule for DEPOSITS (KYC checks)
def segment_high_value_inr_deposit_query(...):
    """Only check deposits, not transfers or credits"""
    return f"WHERE canonical_event = 'money.deposit' AND amount >= 500..."

# Rule for TRANSFERS (Fraud/limits)
def rule_trigger_on_transfer_query(...):
    """Only check transfers, not deposits or credits"""
    return f"WHERE canonical_event = 'money.transfer' AND event_time >= ..."

# Different properties, different rules, different teams!
```

---

## Conclusion

**3 separate canonical events** is the right design because:
1. ✅ **Semantic clarity**: Each event type has distinct meaning
2. ✅ **Query efficiency**: Direct WHERE clauses vs. type-field checks
3. ✅ **Scalability**: Can grow independently without affecting others
4. ✅ **Compliance**: Audit trails are clear and unmixed
5. ✅ **Team ownership**: Clear responsibility boundaries
6. ✅ **Business logic**: Rules are event-specific, not generic

This is a **common pattern** in event-driven architectures:
- Stripe: `charge.succeeded`, `charge.failed`, `charge.refunded` (separate, not grouped)
- Twilio: `message.sent`, `message.failed`, `message.received` (separate)
- Your system: `money.deposit`, `money.transfer`, `money.credit` (separate) ✅
