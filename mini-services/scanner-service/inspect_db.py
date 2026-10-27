import sqlite3, sys, os
db_path = "data/scanner.db"
if not os.path.exists(db_path):
    print(f"ERROR: {db_path} not found"); sys.exit(1)
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== Recent scan jobs (last 10) ===")
for r in cur.execute("SELECT id, file_hash, status, processor, processing_ms, created_at FROM scan_jobs ORDER BY created_at DESC LIMIT 10"):
    print(f"  id={r['id']}  hash={r['file_hash'][:16]}  status={r['status']}  processor={r['processor']}  ms={r['processing_ms']}  created={r['created_at']}")

print("\n=== Cached result for scn_e9b2fbcbe4c34417 ===")
r = cur.execute("SELECT job_id, amount, processing_ms, processor, raw_response FROM ocr_results WHERE job_id = ?", ("scn_e9b2fbcbe4c34417",)).fetchone()
if r:
    print(f"  amount={r['amount']}  ms={r['processing_ms']}  processor={r['processor']}")
    print(f"  raw_response (first 800 chars): {(r['raw_response'] or '')[:800]}")
else:
    print("  (not found)")

print("\n=== All ocr_results (last 5) ===")
for r in cur.execute("SELECT job_id, amount, processing_ms, processor FROM ocr_results ORDER BY id DESC LIMIT 5"):
    print(f"  job_id={r['job_id']}  amount={r['amount']}  ms={r['processing_ms']}  processor={r['processor']}")

conn.close()
