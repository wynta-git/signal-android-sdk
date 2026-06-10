"""Seed delivery_rate into daily boost snapshots with realistic per-day variation."""
import math
from datetime import date, datetime, timedelta

from pymongo import MongoClient

client = MongoClient(
    "mongodb://admin:glgpam2026@43.204.90.164:27017/?authSource=admin",
    serverSelectionTimeoutMS=5000,
)
db = client["pam"]

doc = db["dashboard_boosts"].find_one({"project_id": "proj_demo"}, {"_id": 0, "daily_boosts": 1})
daily: dict = (doc or {}).get("daily_boosts", {})

if not daily:
    print("No daily_boosts found for proj_demo")
    exit(1)

BASE      = 0.938   # centre point
AMP       = 0.018   # slow sine swing over the full window
NOISE_AMP = 0.006   # per-day noise
WEEKEND   = -0.010  # weekend penalty
START     = date(2026, 5, 1)
PERIOD    = 40      # days for one sine cycle

updates: dict = {}
rates_by_date: dict = {}

for date_str, entry in daily.items():
    d = date.fromisoformat(date_str)
    day_idx = (d - START).days
    wave    = AMP * math.sin(2 * math.pi * day_idx / PERIOD)
    noise   = NOISE_AMP * math.sin(d.toordinal() * 7.3)
    penalty = WEEKEND if d.weekday() >= 5 else 0.0
    rate    = round(BASE + wave + noise + penalty, 4)
    rate    = max(0.880, min(0.970, rate))

    snap = dict(entry.get("snapshot", {}))
    snap["delivery_rate"] = rate
    updates[f"daily_boosts.{date_str}.snapshot"] = snap
    rates_by_date[date_str] = rate

updates["updated_at"] = datetime.utcnow()
db["dashboard_boosts"].update_one({"project_id": "proj_demo"}, {"$set": updates})
print(f"Updated {len(daily)} daily entries with delivery_rate\n")

def show_week(label: str, start: date) -> None:
    dates = [str(start + timedelta(i)) for i in range(7)]
    present = [d for d in dates if d in rates_by_date]
    avg = round(sum(rates_by_date[d] for d in present) / len(present), 4) if present else None
    print(f"{label}:")
    for d in present:
        wd = date.fromisoformat(d).strftime("%a")
        print(f"  {d} ({wd}): {rates_by_date[d]:.4f}  ({rates_by_date[d]*100:.2f}%)")
    print(f"  → avg for period: {avg:.4f} ({avg*100:.2f}%)\n" if avg else "")

show_week("Jun 4-10  (current window)", date(2026, 6, 4))
show_week("May 28-Jun 3 (prev window)", date(2026, 5, 28))
show_week("May 11-17", date(2026, 5, 11))
show_week("May 1-7", date(2026, 5, 1))
