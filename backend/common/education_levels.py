"""
common/education_levels.py

Education level identifiers, reconciled.

Schools seed levels inconsistently. One tenant's EducationLevel rows carry
level_type 'JSS'/'SSS'; another's carry 'JUNIOR_SECONDARY'/'SENIOR_SECONDARY'.
Meanwhile parts of the codebase hand around level *names* ("Junior Secondary")
and compare them against level_type. Any of those comparisons silently fails
when the two sides use different conventions, and because the failures surface
as empty querysets they look like missing data rather than bugs.

`expand_tokens` widens a list of level tokens to every equivalent spelling, so
a comparison succeeds whichever convention a school was seeded with.

This is deliberately additive: every token handed in comes back out unchanged,
alongside its aliases. A tenant already seeded canonically keeps matching
exactly what it matched before — nothing is narrowed or reinterpreted, and an
unrecognised token passes through untouched rather than being force-fitted to
a level it does not belong to.
"""

import re

# Spellings that refer to the same education level.
LEVEL_ALIASES = {
    "NURSERY": {"NURSERY", "NUR", "PRE NURSERY", "PRENURSERY", "EARLY YEARS"},
    "PRIMARY": {"PRIMARY", "PRI", "ELEMENTARY"},
    "JUNIOR SECONDARY": {"JUNIOR SECONDARY", "JSS", "JS", "JHS", "JUNIOR"},
    "SENIOR SECONDARY": {"SENIOR SECONDARY", "SSS", "SS", "SHS", "SENIOR"},
}


def normalise(value):
    """Upper-case and collapse separators: 'senior_secondary' → 'SENIOR SECONDARY'."""
    return re.sub(r"[\s_\-]+", " ", str(value or "").strip().upper())


def alias_set(token):
    """
    Every spelling equivalent to `token`, including the original.

    An unrecognised token yields just itself, so a bespoke level a school
    invented is never silently mapped onto one of the standard four.
    """
    raw = str(token or "").strip()
    if not raw:
        return set()

    key = normalise(raw)
    matched = None
    for canonical, aliases in LEVEL_ALIASES.items():
        if key == canonical or key in aliases:
            matched = {canonical} | aliases
            break

    values = matched or {key}
    # Codes and level_types are written with underscores as often as spaces.
    values = values | {v.replace(" ", "_") for v in values}
    # Keep the caller's original spelling so nothing that matched before stops.
    return values | {raw}


def expand_tokens(tokens):
    """
    Widen a list of level tokens to every equivalent spelling.

    Accepts names, codes or level_types — mixed freely — and returns a list
    suitable for a `level_type__in` lookup or a Python membership test.
    """
    if not tokens:
        return []

    expanded = set()
    for token in tokens:
        expanded |= alias_set(token)
    return sorted(expanded)


# The identifier the codebase compares against, per canonical level.
CANONICAL_LEVEL_TYPES = {
    "NURSERY": "NURSERY",
    "PRIMARY": "PRIMARY",
    "JUNIOR SECONDARY": "JUNIOR_SECONDARY",
    "SENIOR SECONDARY": "SENIOR_SECONDARY",
}


def canonical_level_type(token):
    """
    The canonical level_type for `token`, or None if it names no known level.

    'JSS', 'Junior Secondary' and 'junior_secondary' all yield
    'JUNIOR_SECONDARY'. Returning None for anything unrecognised keeps a
    school's bespoke level from being rewritten into one of the standard four.
    """
    key = normalise(token)
    for canonical, aliases in LEVEL_ALIASES.items():
        if key == canonical or key in aliases:
            return CANONICAL_LEVEL_TYPES[canonical]
    return None
