#!/bin/bash
# Seeds MongoDB derived_rules collection with sample rules for segmentation.
# Run: bash seed_derived_rules_mongo.sh

MONGO_URI="mongodb://admin:glgpam2026@localhost:27017/pam?authSource=admin"

# ── Edit this value ───────────────────────────────────────────────────────────
PAM_PROJECT_ID="taj-rummy"
# ─────────────────────────────────────────────────────────────────────────────

cat > /tmp/seed_derived_rules.js << 'JSEOF'
const PROJECT_ID = __PROJECT_ID__;
const now = new Date();

const rules = [
  {
    project_id: PROJECT_ID,
    rule_id: "high_value_depositor",
    name: "High Value Depositor",
    sql: "SELECT user_id FROM pam.events_{project_id} WHERE project_id = '{project_id}' AND event_name = 'deposit_success' GROUP BY user_id HAVING SUM(amount) > {threshold}",
    parameters: [
      { key: "threshold", type: "number" }
    ],
    created_at: now,
    updated_at: now
  },
  {
    project_id: PROJECT_ID,
    rule_id: "user_churned",
    name: "User Churned",
    sql: "SELECT DISTINCT user_id FROM pam.events_{project_id} WHERE project_id = '{project_id}' GROUP BY user_id HAVING max(timestamp) < now() - INTERVAL {inactive_days} DAY",
    parameters: [
      { key: "inactive_days", type: "number" }
    ],
    created_at: now,
    updated_at: now
  },
  {
    project_id: PROJECT_ID,
    rule_id: "first_deposit_made",
    name: "Made First Deposit",
    sql: "SELECT DISTINCT user_id FROM pam.events_{project_id} WHERE project_id = '{project_id}' AND event_name = 'deposit_success'",
    parameters: [],
    created_at: now,
    updated_at: now
  },
  {
    project_id: PROJECT_ID,
    rule_id: "repeat_depositor",
    name: "Repeat Depositor",
    sql: "SELECT user_id FROM pam.events_{project_id} WHERE project_id = '{project_id}' AND event_name = 'deposit_success' GROUP BY user_id HAVING count() >= {min_deposits}",
    parameters: [
      { key: "min_deposits", type: "number" }
    ],
    created_at: now,
    updated_at: now
  }
];

rules.forEach(rule => {
  db.derived_rules.updateOne(
    { project_id: rule.project_id, rule_id: rule.rule_id },
    { $set: rule },
    { upsert: true }
  );
  print("Upserted: " + rule.rule_id);
});

print("Done. " + rules.length + " derived rules seeded for project_id=" + PROJECT_ID);
JSEOF

sed -i "s|__PROJECT_ID__|\"$PAM_PROJECT_ID\"|g" /tmp/seed_derived_rules.js

mongo "$MONGO_URI" /tmp/seed_derived_rules.js
