#!/usr/bin/env bash
# NOTE: Render uses a custom Build Command set in the dashboard, not this file.
# Keep this in sync with the Render dashboard Build Command.
set -e
pip install -r requirements.txt
python manage.py migrate
python manage.py fix_component_score_table
python manage.py seed_activity_categories || true
python manage.py seed_appraisal_criteria || true
python manage.py collectstatic --noinput

