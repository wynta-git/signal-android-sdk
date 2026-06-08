#!/bin/bash
# Seeds MongoDB with the 4 documents needed for notifications-engine FCM push.
# Run on the EC2 server: bash seed_notifications_mongo.sh

MONGO_URI="mongodb://admin:glgpam2026@localhost:27017/pam?authSource=admin"

# ── Edit these two values ─────────────────────────────────────────────────────
PAM_PROJECT_ID="taj-rummy"
USER_ID="your-user-id"
# ─────────────────────────────────────────────────────────────────────────────

DEVICE_TOKEN="cKsMrwDYRiKXULxJX_jLCf:APA91bG9zSB1eUfFeVV9rdm7yOXv9eFIUq3f20fhJ0EIsbf-0eCwny7lrmmkkfKMUhSflsz2rvyv1MWudwk92WiAwaj7rc22cKWFJt1lUU-vs7mtPn8sTl8"
TEMPLATE_ID="tmpl-push-001"

cat > /tmp/seed_pam.js << 'JSEOF'
const PROJECT_ID   = __PROJECT_ID__;
const USER_ID      = __USER_ID__;
const DEVICE_TOKEN = __DEVICE_TOKEN__;
const TEMPLATE_ID  = __TEMPLATE_ID__;

const fcmCred = {
  "type": "service_account",
  "project_id": "taj-rummy-firebase",
  "private_key_id": "fa44b96b1184271da6cab686d971cce23fb74dda",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDbswtcFJhf0WFK\nUvzNx3mOdXNQbGv1UlbmDhNSCd4HNQzYH+BLC2+ZwmlYsjjJdsDjRvEfJFYRER63\n/lrjny/kfIK7HpuCqTRh+eXrsrpLqQA5orhfS2RC4QBnrbt9dh7Qkqm+G5vRrz2y\nQspz0VwzXZVj82OMchqKCixr0f5aVZbXDP3Hme7/ovqZlOGzzrZU8Y251NLjz//O\n+QMk72Nbcev6ZpePAwi5HMN2lJDNPyqTOiqvlRH4vJi5HS917ciupiGkCKzutpS8\nXhF0MvTVH0pTjK3CGTmXlWmJrxPcoVDOqJcCmoJE8TtUmDzVBV4LJyFrYAKWw6EW\nwMGa4/hzAgMBAAECggEAUftogEZhK9Q+mVUJaCKJDituyfKDgKpmqfdTp1fuRcM6\nlUWj1W0hin98/y+WODt7s/Prk0LkaP759w/Py8PBw+HgiMHdpu7MEMmHTiJGGWip\noFhDs6+27Kv4kjfG0ITs78ji1YGI7kCV5bi9wmU8IiDIV+FhYu3LUHqGY/+bCgrY\nPXpfh9In2Xrs/D3C+gKzFoWFrNwWLXstWANyq/ID6pQb5pRi4F23QWhQGOg/LWII\nQgOae9dnJN2TQKEF4HQQeOTRZKEb5Erv79EutZYV9Kn2q0EAMYPvSrueDKMbSuT7\n8p/n4QoD05iI1Xm+g+s5PQCkSrD0wp0LeigvCnfwGQKBgQDtpll+pVgf56aTjXjE\n5lbDI8drE7HfNbaMppRu4qvuLyxPNIx5L+H77gBM2GI2J+CWGfDxS0IlnLpeUhRl\nMW+1/bY4DBgo1nrhSjnsrAklViqLrX9lIAIuUTNwRSYxe8WivAVBNAGU9tuar/TO\nO+Plw6K4L/3WKRLwhEII7tG7mwKBgQDsqd3zEJcjE7T2zXDKgshmlBNUKe+wka4q\nSxda1SH6LvpGQ22k/3Cxxd2yfMIhjrLl72neX46TRiOGjLy2wryxfbWA2JmsXbYI\nYr8rTPZhfuIz0eEtaTX5R1jCSCuy7qI7uCTNo9OF4U10PN+k3iYhtkEP6Qt+bGz0\npLvaNcMgCQKBgQDE1Gp7QmbixfJpc1r7eeuSZCfev8kqnko75Bw8WvEbrWZ9k4Bl\nPwtkpZMKEo4FXLHeoE23DCYVEOIrDMBnr7JegWxSr3GzITFVNy0SoMpSajOCzIgf\nMYuc4RRBgIRJp8HhLukLQA+vWWY5kFKqHWB8BLTY6KbMoehV3LT0wRhk0QKBgB57\nTnv1AhJhgmhbU5CxwY/8uHSZpiaOzOjjnRF07BhmHpQYMTIUOHadLo3DpdleoMoe\nyPr8QcfUO9UjoVbExDr0HwGGZFygAUcZONgh5IXwKsBT4vXPXEVMHDGBzCcSt1CL\nyim2VRMkTq6O/JsmhbDH4Z9j+7f/zRTBdvSHAifJAoGARroRxBputCD36f51k8AX\ngyjC7HXWDLQPHSrfly4zkmOBojdQYugreZSMFzyI+fAjnTApO+WqbLCNfLb5aPro\n83/18Qf/RfgEy7KnZfHEImyhwszHjhoreXm7gvVvtymG1Tl9ltL7koANoOhF3vQH\nX+haBFzWvM8emJokH7phxPw=\n-----END PRIVATE KEY-----\n",
  "client_email": "fcm-service-manager@taj-rummy-firebase.iam.gserviceaccount.com",
  "client_id": "109962372702889183607",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/fcm-service-manager%40taj-rummy-firebase.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

// 1. Project with FCM credential
db.projects.updateOne(
  { project_id: PROJECT_ID },
  { $set: { project_id: PROJECT_ID, name: PROJECT_ID, "settings.fcm_service_account_json": JSON.stringify(fcmCred) } },
  { upsert: true }
);
print("1. projects: upserted");

// 2. Device token
db.device_tokens.updateOne(
  { project_id: PROJECT_ID, user_id: USER_ID, token: DEVICE_TOKEN },
  { $set: { project_id: PROJECT_ID, user_id: USER_ID, token: DEVICE_TOKEN, platform: "android" } },
  { upsert: true }
);
print("2. device_tokens: upserted");

// 3. User
db.users.updateOne(
  { project_id: PROJECT_ID, user_id: USER_ID },
  { $set: { project_id: PROJECT_ID, user_id: USER_ID, traits: { name: "Test User" } } },
  { upsert: true }
);
print("3. users: upserted");

// 4. Notification template
db.notification_templates.updateOne(
  { project_id: PROJECT_ID, template_id: TEMPLATE_ID },
  { $set: {
    project_id: PROJECT_ID,
    template_id: TEMPLATE_ID,
    push: {
      title: "Hello {{ user.name }}",
      body: "This is a test push from PAM."
    }
  }},
  { upsert: true }
);
print("4. notification_templates: upserted");

print("Done. Send a SendJob with project_id=" + PROJECT_ID + " user_id=" + USER_ID + " template_id=" + TEMPLATE_ID);
JSEOF

# Substitute shell variables into the JS file
sed -i \
  -e "s|__PROJECT_ID__|\"$PAM_PROJECT_ID\"|g" \
  -e "s|__USER_ID__|\"$USER_ID\"|g" \
  -e "s|__DEVICE_TOKEN__|\"$DEVICE_TOKEN\"|g" \
  -e "s|__TEMPLATE_ID__|\"$TEMPLATE_ID\"|g" \
  /tmp/seed_pam.js

mongosh "$MONGO_URI" /tmp/seed_pam.js
