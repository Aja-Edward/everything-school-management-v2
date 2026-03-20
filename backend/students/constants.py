# students/constants.py
"""
Legacy constants kept for backward compatibility with fee and result apps.
These will be deprecated once those apps are migrated to use ForeignKey relationships.
"""

GENDER_CHOICES = (
    ("M", "Male"),
    ("F", "Female"),
)

EDUCATION_LEVEL_CHOICES = (
    ("NURSERY", "Nursery"),
    ("PRIMARY", "Primary"),
    ("JUNIOR_SECONDARY", "Junior Secondary"),
    ("SENIOR_SECONDARY", "Senior Secondary"),
)

CLASS_CHOICES = (
    # Nursery Classes
    ("PRE_NURSERY", "Pre-nursery"),
    ("NURSERY_1", "Nursery 1"),
    ("NURSERY_2", "Nursery 2"),
    # Primary Classes
    ("PRIMARY_1", "Primary 1"),
    ("PRIMARY_2", "Primary 2"),
    ("PRIMARY_3", "Primary 3"),
    ("PRIMARY_4", "Primary 4"),
    ("PRIMARY_5", "Primary 5"),
    ("PRIMARY_6", "Primary 6"),
    # Junior Secondary Classes
    ("JSS_1", "Junior Secondary 1 (JSS1)"),
    ("JSS_2", "Junior Secondary 2 (JSS2)"),
    ("JSS_3", "Junior Secondary 3 (JSS3)"),
    # Senior Secondary Classes
    ("SS_1", "Senior Secondary 1 (SS1)"),
    ("SS_2", "Senior Secondary 2 (SS2)"),
    ("SS_3", "Senior Secondary 3 (SS3)"),
)