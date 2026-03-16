#!/usr/bin/env python3
"""
Nelson Weekly Coaching Runner
Usage: python3 scripts/run-coaching.sh
Runs every Monday to generate coaching for all users.
Set CRON_SECRET and APP_URL as environment variables or hardcode below.
"""

import subprocess
import json
import time
import sys
import os
from datetime import datetime, timezone, timedelta

# ============================================================
# CONFIG - set these or pass as env vars
# ============================================================
APP_URL = os.environ.get("NELSON_APP_URL", "https://thenelson.app")
CRON_SECRET = os.environ.get("NELSON_CRON_SECRET", "")
DELAY_BETWEEN_USERS = 2  # seconds between Anthropic calls to avoid rate limits

# ============================================================
# WEEK CALCULATION (ISO 8601, Monday = week start)
# Matches getPreviousWeekId() in the cron route exactly.
# ============================================================
def get_previous_week_id() -> str:
    now = datetime.now(timezone.utc)
    last_week = now - timedelta(days=7)
    # Anchor on Thursday for ISO year determination
    day_of_week = last_week.isoweekday()  # Mon=1, Sun=7
    thursday = last_week + timedelta(days=(4 - day_of_week))
    year = thursday.year
    jan4 = datetime(year, 1, 4, tzinfo=timezone.utc)
    week_one_monday = jan4 - timedelta(days=((jan4.isoweekday() - 1) % 7))
    week_num = round((thursday - week_one_monday).days / 7) + 1
    return f"{year}-W{str(week_num).zfill(2)}"

# ============================================================
# FETCH ALL USER EMAILS via cron endpoint
# ============================================================
def get_all_emails() -> list[str]:
    """
    Calls the cron endpoint with dryRun to get user list only.
    Falls back to manual list if needed.
    """
    # We'll parse emails from the full cron run result instead.
    # This function is a placeholder -- see run_all_users() below.
    return []

# ============================================================
# GENERATE COACHING FOR ONE USER
# ============================================================
def generate_for_user(email: str, week_id: str) -> dict:
    payload = json.dumps({"email": email, "weekId": week_id})
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

# ============================================================
# FETCH USER LIST FROM FIRESTORE VIA CRON
# We fire the cron once to get the full result, then re-run
# any failures sequentially.
# ============================================================
def run_cron() -> dict:
    result = subprocess.run(
        [
            "curl", "-s", "-X", "GET",
            f"{APP_URL}/api/cron/generate-weekly-coaching",
            "-H", f"Authorization: Bearer {CRON_SECRET}",
            "--max-time", "600"
        ],
        capture_output=True,
        text=True
    )
    try:
        return json.loads(result.stdout)
    except Exception:
        return {"success": False, "error": f"Invalid response: {result.stdout[:200]}"}

# ============================================================
# MAIN
# ============================================================
def main():
    if not CRON_SECRET:
        print("ERROR: NELSON_CRON_SECRET env var not set.")
        print("Run: export NELSON_CRON_SECRET='your_secret_here'")
        sys.exit(1)

    week_id = get_previous_week_id()
    print(f"\nNelson Coaching Runner")
    print(f"Week: {week_id}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    # Step 1: Run the cron to get all users in one shot
    print("\nStep 1: Running cron for all users...")
    cron_result = run_cron()

    if not cron_result.get("success") and "results" not in cron_result:
        print(f"CRON FAILED: {cron_result.get('error', 'Unknown error')}")
        sys.exit(1)

    results = cron_result.get("results", [])
    total = len(results)
    succeeded = [r for r in results if r.get("success")]
    failed = [r for r in results if not r.get("success")]

    print(f"Initial run: {len(succeeded)}/{total} succeeded")

    if failed:
        print(f"\nStep 2: Retrying {len(failed)} failed users sequentially...")
        retry_results = []
        for i, user in enumerate(failed):
            email = user["email"]
            error = user.get("error", "unknown")
            print(f"  [{i+1}/{len(failed)}] {email}")
            print(f"    Previous error: {error[:80]}")

            retry = generate_for_user(email, week_id)
            if retry.get("success"):
                print(f"    ✓ Success")
                retry_results.append({"email": email, "success": True})
            else:
                retry_error = retry.get("error", "unknown")
                validation_errors = retry.get("validationErrors", [])
                print(f"    ✗ Failed: {retry_error[:80]}")
                if validation_errors:
                    for ve in validation_errors:
                        print(f"      Rule: {ve.get('rule')} | {ve.get('message')}")
                retry_results.append({
                    "email": email,
                    "success": False,
                    "error": retry_error,
                    "validationErrors": validation_errors
                })

            if i < len(failed) - 1:
                time.sleep(DELAY_BETWEEN_USERS)

        # Step 3: Second retry for any still failing
        still_failed = [r for r in retry_results if not r.get("success")]
        if still_failed:
            print(f"\nStep 3: Final retry for {len(still_failed)} remaining...")
            for i, user in enumerate(still_failed):
                email = user["email"]
                print(f"  [{i+1}/{len(still_failed)}] {email}")
                retry = generate_for_user(email, week_id)
                if retry.get("success"):
                    print(f"    ✓ Success on final retry")
                else:
                    print(f"    ✗ Still failing: {retry.get('error', 'unknown')[:80]}")
                    validation_errors = retry.get("validationErrors", [])
                    if validation_errors:
                        for ve in validation_errors:
                            print(f"      Rule: {ve.get('rule')} | {ve.get('message')}")
                if i < len(still_failed) - 1:
                    time.sleep(DELAY_BETWEEN_USERS)

    print(f"\n{'='*50}")
    print(f"Done. Check Firebase to confirm all users have W{week_id.split('W')[1]} coaching.")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    main()