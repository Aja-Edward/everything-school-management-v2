#!/usr/bin/env python
"""
Concurrency test runner for `manage.py seed_tenant_defaults`.
Spawns N parallel processes that run the management command for the same tenant.
Intended to be run against a staging database, NOT production.

Usage:
  python scripts/concurrent_seed_test.py --slug kebi-international-academy --parallel 6
"""
import os
import sys
import argparse
import subprocess
import time
from multiprocessing.pool import ThreadPool

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

parser = argparse.ArgumentParser()
parser.add_argument('--slug', required=True, help='Tenant slug to seed')
parser.add_argument('--parallel', type=int, default=6, help='Number of parallel processes')
parser.add_argument('--wait', type=float, default=0.1, help='Stagger start (seconds)')
args = parser.parse_args()

CMD = [sys.executable, 'manage.py', 'seed_tenant_defaults', '--slug', args.slug]

print(f"Running {args.parallel} parallel seed processes for tenant '{args.slug}'")
print('Command:', ' '.join(CMD))

def run_seed(i):
    try:
        proc = subprocess.Popen(CMD, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        out, _ = proc.communicate()
        return (i, proc.returncode, out)
    except Exception as e:
        return (i, -1, str(e))

pool = ThreadPool(min(args.parallel, 32))
jobs = []
for i in range(args.parallel):
    jobs.append(pool.apply_async(run_seed, (i,)))
    time.sleep(args.wait)

pool.close()
pool.join()

success = 0
for j in jobs:
    i, rc, out = j.get()
    print('\n' + '-'*60)
    print(f'Process #{i} exit={rc}')
    print(out.strip())
    if rc == 0:
        success += 1

print('\n' + '='*60)
print(f'Completed {len(jobs)} processes, {success} succeeded')
print('Note: Run on staging, do NOT run this against production without backups.')
