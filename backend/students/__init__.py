default_app_config = "students.apps.StudentsConfig"

# students/__init__.py
from .constants import GENDER_CHOICES, EDUCATION_LEVEL_CHOICES, CLASS_CHOICES

__all__ = ["GENDER_CHOICES", "EDUCATION_LEVEL_CHOICES", "CLASS_CHOICES"]
