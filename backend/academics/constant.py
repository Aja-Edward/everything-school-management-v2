# Seeded for every new tenant.
#
# level_type must match the identifiers the codebase compares against —
# NURSERY / PRIMARY / JUNIOR_SECONDARY / SENIOR_SECONDARY. Seeding 'JSS'/'SSS'
# here (as this file previously did) silently breaks every filter that scopes
# by education level, because those comparisons return no rows rather than
# raising. `code` keeps the short form; it is only an identifier.
DEFAULT_EDUCATION_LEVELS = [
    {"name": "Nursery", "code": "nursery", "level_type": "NURSERY", "display_order": 1},
    {"name": "Primary", "code": "primary", "level_type": "PRIMARY", "display_order": 2},
    {"name": "Junior Secondary", "code": "jss", "level_type": "JUNIOR_SECONDARY", "display_order": 3},
    {"name": "Senior Secondary", "code": "sss", "level_type": "SENIOR_SECONDARY", "display_order": 4},
]
