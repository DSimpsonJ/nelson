#!/usr/bin/env python3
import subprocess
import json
import time
import os
import sys
import base64
from datetime import datetime, timedelta

APP_URL = os.environ.get("NELSON_APP_URL", "https://thenelson.app")
CRON_SECRET = os.environ.get("NELSON_CRON_SECRET", "")
WEEK_ID = "2026-W19"
DELAY = 3  # seconds between users

def get_emails_from_firestore() -> list[str]:
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    creds_b64 = None
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('FIREBASE_SERVICE_ACCOUNT_BASE64='):
                creds_b64 = line.strip().split('=', 1)[1].strip().strip('"')
                break

    if not creds_b64:
        print("ERROR: FIREBASE_SERVICE_ACCOUNT_BASE64 not found in .env.local")
        sys.exit(1)

    creds = json.loads(base64.b64decode(creds_b64))

    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(creds))

    db = firestore.client()
    users = db.collection('users').get()

    cutoff = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')

    emails = []
    for u in users:
        data = u.to_dict()
        if data.get('hasCommitment') != True:
            continue
        last_checkin = data.get('lastCheckInDate', '')
        if not last_checkin or last_checkin < cutoff:
            continue
        emails.append(u.id)

    return emails

def generate_for_user(email: str) -> dict:
    payload = json.dumps({"email": email, "weekId": WEEK_ID})
    result = subprocess.run(
        [
            "curl", "-s", "-X", "POST",
            f"{APP_URL}/api/generate-weekly-coaching",
            "-H", f"Authorization: Bearer {CRON_SECRET}",
            "-H", "Content-Type: application/json",
            "-d", payload
        ],
        capture_output=True,
        text=True
    )
    try:
        return json.loads(result.stdout)
    except Exception:
        return {"success": False, "error": f"Invalid response: {result.stdout[:200]}"}

if not CRON_SECRET:
    print("ERROR: export NELSON_CRON_SECRET='your_secret'")
    sys.exit(1)

print("Fetching users from Firestore...")
emails = get_emails_from_firestore()
print(f"Found {len(emails)} eligible users\n")
print(f"Running coaching for week {WEEK_ID}\n")

for i, email in enumerate(emails):
    print(f"[{i+1}/{len(emails)}] {email} ... ", end="", flush=True)
    result = generate_for_user(email)
    if result.get("success"):
        print("✓")
    else:
        print(f"✗ {result.get('error', 'unknown')[:100]}")
    if i < len(emails) - 1:
        time.sleep(DELAY)

print("\nDone. Verify in Firestore weeklySummaries/2026-W19.")