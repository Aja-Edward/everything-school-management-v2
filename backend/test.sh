#!/usr/bin/env bash
# Run the Django test suite.
#
#   ./test.sh                  every app
#   ./test.sh attendance       one app
#   ./test.sh attendance.tests.AnomalyOnlyPolicyTest    one class
#
# --noinput matters more than it looks. A run that dies partway through
# leaves its test database behind, and the next run stops to ask whether to
# delete it. That prompt reads from stdin, so anything non-interactive -- CI,
# a git hook, an agent -- hangs and then dies with EOFError rather than
# telling you a stale database is in the way.
#
# Expect this to take a while: the suite creates a schema and runs every
# migration per tenant before the first test executes.
set -euo pipefail
cd "$(dirname "$0")"
exec python manage.py test "$@" --noinput
