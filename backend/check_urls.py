# check_urls.py
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import importlib
from django.conf import settings

root = importlib.import_module(settings.ROOT_URLCONF)
print("=== ROOT URL PATTERNS ===")
for p in root.urlpatterns:
    urlconf = getattr(p, 'urlconf_name', '')
    print(f"  {p.pattern}  →  {urlconf}")