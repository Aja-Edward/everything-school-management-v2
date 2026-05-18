#!/usr/bin/env bash
set -e
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
# Seed default activity categories for any tenant that doesn't have them yet.
# Safe to re-run — uses get_or_create, never duplicates.
python manage.py seed_activity_categories || true

