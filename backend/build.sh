#!/usr/bin/env bash
# NOTE: Render uses a custom Build Command set in the dashboard, not this file.
# Keep this in sync with the Render dashboard Build Command.
set -e
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py seed_activity_categories
python manage.py seed_appraisal_criteria
python manage.py seed_tenant_defaults
