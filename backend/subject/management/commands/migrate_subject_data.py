# Create file: management/commands/migrate_subject_data.py
from django.core.management.base import BaseCommand
from django.db import transaction
from subject.models import Subject, SubjectCategory, SubjectType
from classroom.models import GradeLevel

class Command(BaseCommand):
    help = 'Migrates existing subject data to new structure'

    @transaction.atomic
    def handle(self, *args, **kwargs):
        subjects = Subject.objects.all()
        
        for subject in subjects:
            # Migrate category CharField → ForeignKey
            if hasattr(subject, 'category') and isinstance(subject.category, str):
                category_code = subject.category
                try:
                    category_obj = SubjectCategory.objects.get(
                        tenant=subject.tenant,
                        code=category_code
                    )
                    # This will be set in the new field after migration
                    subject._category_temp = category_obj.pk
                except SubjectCategory.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(
                            f'Category "{category_code}" not found for subject {subject.code}'
                        )
                    )
            
            # Migrate education_levels JSONField → M2M GradeLevel
            if hasattr(subject, 'education_levels') and subject.education_levels:
                grade_level_pks = []
                for edu_level in subject.education_levels:
                    grade_levels = GradeLevel.objects.filter(
                        tenant=subject.tenant,
                        education_level=edu_level
                    )
                    grade_level_pks.extend(grade_levels.values_list('pk', flat=True))
                
                subject._grade_levels_temp = list(grade_level_pks)
            
            # Migrate ss_subject_type CharField → ForeignKey
            if hasattr(subject, 'ss_subject_type') and subject.ss_subject_type:
                try:
                    subject_type = SubjectType.objects.get(
                        tenant=subject.tenant,
                        code=subject.ss_subject_type
                    )
                    subject._subject_type_temp = subject_type.pk
                except SubjectType.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(
                            f'Subject type "{subject.ss_subject_type}" not found'
                        )
                    )
        
        self.stdout.write(self.style.SUCCESS('Data migration preparation completed'))