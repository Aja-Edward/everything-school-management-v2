

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
import logging

logger = logging.getLogger(__name__)


# ===== AUTO-GENERATION SIGNALS FOR ALL LEVELS =====

@receiver(post_save, sender='result.NurseryResult')
def auto_generate_nursery_term_report(sender, instance, created, **kwargs):
    """Auto-generate NurseryTermReport when NurseryResult is approved/published"""
    
    if instance.status not in ['APPROVED', 'PUBLISHED']:
        return
    
    from .models import NurseryTermReport
    
    _auto_generate_term_report(
        instance, 
        NurseryTermReport, 
        'Nursery'
    )


@receiver(post_save, sender='result.PrimaryResult')
def auto_generate_primary_term_report(sender, instance, created, **kwargs):
    """Auto-generate PrimaryTermReport when PrimaryResult is approved/published"""
    
    if instance.status not in ['APPROVED', 'PUBLISHED']:
        return
    
    from .models import PrimaryTermReport
    
    _auto_generate_term_report(
        instance, 
        PrimaryTermReport, 
        'Primary'
    )


@receiver(post_save, sender='result.JuniorSecondaryResult')
def auto_generate_junior_secondary_term_report(sender, instance, created, **kwargs):
    """Auto-generate JuniorSecondaryTermReport when JuniorSecondaryResult is approved/published"""
    
    if instance.status not in ['APPROVED', 'PUBLISHED']:
        return
    
    from .models import JuniorSecondaryTermReport
    
    _auto_generate_term_report(
        instance, 
        JuniorSecondaryTermReport, 
        'Junior Secondary'
    )


@receiver(post_save, sender='result.SeniorSecondaryResult')
def auto_generate_senior_secondary_term_report(sender, instance, created, **kwargs):
    """Auto-generate SeniorSecondaryTermReport when SeniorSecondaryResult is approved/published"""
    
    if instance.status not in ['APPROVED', 'PUBLISHED']:
        return
    
    from .models import SeniorSecondaryTermReport
    
    _auto_generate_term_report(
        instance, 
        SeniorSecondaryTermReport, 
        'Senior Secondary'
    )


# ===== SHARED GENERATION LOGIC =====

def _auto_generate_term_report(result_instance, ReportModel, level_name):
    """
    Internal function to handle term report generation for any education level.
    
    Args:
        result_instance: The result object (NurseryResult, PrimaryResult, etc.)
        ReportModel: The term report model class
        level_name: Human-readable name for logging
    """
    student = result_instance.student
    exam_session = result_instance.exam_session
    
    try:
        with transaction.atomic():
            # Get or create the term report
            defaults = {
                'status': 'DRAFT',
                'is_published': False,
            }
            
            # For Senior Secondary, include stream if available
            if level_name == 'Senior Secondary' and hasattr(result_instance, 'stream'):
                defaults['stream'] = result_instance.stream
            
            term_report, created = ReportModel.objects.get_or_create(
                student=student,
                exam_session=exam_session,
                defaults=defaults
            )
            
            if created:
                logger.info(
                    f"✅ Auto-created {level_name} TermReport for {student.full_name} "
                    f"- {exam_session.get_term_display()} {exam_session.academic_session.name}"
                )
            
            # Recalculate metrics
            term_report.calculate_metrics()
            term_report.calculate_class_position()
            
            logger.info(
                f"✅ Updated metrics for {level_name} TermReport {term_report.id}"
            )
            
    except Exception as e:
        logger.error(
            f"❌ Failed to auto-generate {level_name} term report for {student.full_name}: {e}",
            exc_info=True
        )


# ===== BULK GENERATION FOR ALL LEVELS =====

def bulk_generate_all_missing_reports(exam_session=None):
    """
    Generate missing term reports for ALL education levels at once.
    
    Usage:
        from result.models import ExamSession
        from result.signals import bulk_generate_all_missing_reports
        
        # For specific session
        session = ExamSession.objects.get(id=123)
        bulk_generate_all_missing_reports(session)
        
        # For all sessions
        bulk_generate_all_missing_reports()
    """
    
    from .models import ExamSession
    
    if exam_session:
        sessions = [exam_session]
    else:
        sessions = ExamSession.objects.all()
    
    print(f"\n{'='*70}")
    print(f"🚀 BULK TERM REPORT GENERATION - ALL EDUCATION LEVELS")
    print(f"{'='*70}")
    print(f"Processing {len(sessions)} exam session(s)...")
    print(f"{'='*70}\n")
    
    total_created = 0
    
    for session in sessions:
        print(f"\n📚 Processing: {session}")
        print(f"{'-'*70}")
        
        # Generate for each education level
        for level in ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY']:
            count = bulk_generate_missing_term_reports(session, level)
            total_created += count
    
    print(f"\n{'='*70}")
    print(f"✅ ALL LEVELS COMPLETE")
    print(f"{'='*70}")
    print(f"Total term reports created: {total_created}")
    print(f"{'='*70}\n")
    
    return total_created


def bulk_generate_missing_term_reports(exam_session, education_level='NURSERY'):
    """
    Generate missing term reports for a specific education level.
    
    Usage:
        from result.models import ExamSession
        from result.signals import bulk_generate_missing_term_reports
        
        session = ExamSession.objects.get(id=123)
        
        # Generate for specific level
        bulk_generate_missing_term_reports(session, 'NURSERY')
        bulk_generate_missing_term_reports(session, 'PRIMARY')
        bulk_generate_missing_term_reports(session, 'JUNIOR_SECONDARY')
        bulk_generate_missing_term_reports(session, 'SENIOR_SECONDARY')
    """
    
    # Map education level to models
    model_mapping = {
        'NURSERY': ('NurseryResult', 'NurseryTermReport'),
        'PRIMARY': ('PrimaryResult', 'PrimaryTermReport'),
        'JUNIOR_SECONDARY': ('JuniorSecondaryResult', 'JuniorSecondaryTermReport'),
        'SENIOR_SECONDARY': ('SeniorSecondaryResult', 'SeniorSecondaryTermReport'),
    }
    
    if education_level not in model_mapping:
        raise ValueError(f"Invalid education level: {education_level}")
    
    result_model_name, report_model_name = model_mapping[education_level]
    
    # Import models dynamically
    from . import models as result_models
    ResultModel = getattr(result_models, result_model_name)
    ReportModel = getattr(result_models, report_model_name)
    
    # Get all students with result in this session
    students_with_results = ResultModel.objects.filter(
        exam_session=exam_session,
        status__in=['APPROVED', 'PUBLISHED']
    ).values_list('student_id', flat=True).distinct()
    
    # Get students who already have term reports
    students_with_reports = ReportModel.objects.filter(
        exam_session=exam_session
    ).values_list('student_id', flat=True)
    
    # Find students missing term reports
    missing_students = set(students_with_results) - set(students_with_reports)
    
    print(f"\n  📊 {education_level}:")
    print(f"     Students with result: {len(students_with_results)}")
    print(f"     Students with reports: {len(students_with_reports)}")
    print(f"     Missing reports: {len(missing_students)}")
    
    if not missing_students:
        print(f"     ✅ All students already have term reports!")
        return 0
    
    created_count = 0
    errors = []
    
    for student_id in missing_students:
        try:
            with transaction.atomic():
                from students.models import Student
                student = Student.objects.get(id=student_id)
                
                # Create term report
                defaults = {
                    'status': 'DRAFT',
                    'is_published': False,
                }
                
                # For Senior Secondary, try to get stream from result
                if education_level == 'SENIOR_SECONDARY':
                    result_with_stream = ResultModel.objects.filter(
                        student=student,
                        exam_session=exam_session,
                        status__in=['APPROVED', 'PUBLISHED']
                    ).first()
                    
                    if result_with_stream and hasattr(result_with_stream, 'stream') and result_with_stream.stream:
                        defaults['stream'] = result_with_stream.stream
                
                term_report = ReportModel.objects.create(
                    student=student,
                    exam_session=exam_session,
                    **defaults
                )
                
                # Calculate metrics
                term_report.calculate_metrics()
                term_report.calculate_class_position()
                
                created_count += 1
                print(f"     ✅ Created for {student.full_name}")
                
        except Exception as e:
            error_msg = f"❌ Failed for student {student_id}: {str(e)}"
            print(f"     {error_msg}")
            errors.append(error_msg)
            logger.error(error_msg, exc_info=True)
    
    if created_count > 0:
        print(f"     ✅ Created {created_count} term report(s)")
    
    if errors:
        print(f"     ⚠️ {len(errors)} error(s) occurred")
    
    return created_count


def fix_specific_student_report(student_id, exam_session_id, education_level='NURSERY'):
    """
    Generate term report for a specific student.
    
    Usage:
        from result.signals import fix_specific_student_report
        
        fix_specific_student_report(
            student_id=123,
            exam_session_id=456,
            education_level='NURSERY'  # or PRIMARY, JUNIOR_SECONDARY, SENIOR_SECONDARY
        )
    """
    
    from students.models import Student
    from .models import ExamSession
    
    # Map education level to models
    model_mapping = {
        'NURSERY': ('NurseryResult', 'NurseryTermReport'),
        'PRIMARY': ('PrimaryResult', 'PrimaryTermReport'),
        'JUNIOR_SECONDARY': ('JuniorSecondaryResult', 'JuniorSecondaryTermReport'),
        'SENIOR_SECONDARY': ('SeniorSecondaryResult', 'SeniorSecondaryTermReport'),
    }
    
    if education_level not in model_mapping:
        raise ValueError(f"Invalid education level: {education_level}")
    
    result_model_name, report_model_name = model_mapping[education_level]
    
    # Import models dynamically
    from . import models as result_models
    ResultModel = getattr(result_models, result_model_name)
    ReportModel = getattr(result_models, report_model_name)
    
    try:
        student = Student.objects.get(id=student_id)
        exam_session = ExamSession.objects.get(id=exam_session_id)
        
        print(f"\n{'='*60}")
        print(f"🔧 FIXING TERM REPORT")
        print(f"{'='*60}")
        print(f"Student: {student.full_name} (ID: {student_id})")
        print(f"Session: {exam_session}")
        print(f"Level: {education_level}")
        print(f"{'='*60}\n")
        
        # Check if student has result
        result = ResultModel.objects.filter(
            student=student,
            exam_session=exam_session,
            status__in=['APPROVED', 'PUBLISHED']
        )
        
        print(f"Found {result.count()} result(s) for this student")
        
        if not result.exists():
            print("❌ No approved/published result found for this student!")
            return None
        
        # Check if report already exists
        existing_report = ReportModel.objects.filter(
            student=student,
            exam_session=exam_session
        ).first()
        
        if existing_report:
            print(f"⚠️ Term report already exists (ID: {existing_report.id})")
            print("Recalculating metrics...")
            existing_report.calculate_metrics()
            existing_report.calculate_class_position()
            print("✅ Metrics updated!")
            return existing_report
        
        # Create new report
        with transaction.atomic():
            defaults = {
                'status': 'DRAFT',
                'is_published': False,
            }
            
            # For Senior Secondary, get stream from result
            if education_level == 'SENIOR_SECONDARY':
                result_with_stream = result.first()
                if hasattr(result_with_stream, 'stream') and result_with_stream.stream:
                    defaults['stream'] = result_with_stream.stream
            
            term_report = ReportModel.objects.create(
                student=student,
                exam_session=exam_session,
                **defaults
            )
            
            # Calculate metrics
            term_report.calculate_metrics()
            term_report.calculate_class_position()
            
            print(f"✅ Created new term report (ID: {term_report.id})")
            print(f"   Total Score: {getattr(term_report, 'total_score', 'N/A')}")
            print(f"   Average: {getattr(term_report, 'average_score', 'N/A')}")
            
            # Get position info
            if hasattr(term_report, 'class_position'):
                total = getattr(term_report, 'total_students', 0) or getattr(term_report, 'total_students_in_class', 0)
                print(f"   Position: {term_report.class_position}/{total}")
            
            print(f"{'='*60}\n")
            
            return term_report
            
    except Student.DoesNotExist:
        print(f"❌ Student with ID {student_id} not found!")
        return None
    except ExamSession.DoesNotExist:
        print(f"❌ ExamSession with ID {exam_session_id} not found!")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        logger.error(f"Error fixing student report: {e}", exc_info=True)
        return None


# ===== CONVENIENCE FUNCTION =====

def generate_reports_for_current_term():
    """
    Generate missing reports for the current active term across all levels.
    
    Usage:
        from result.signals import generate_reports_for_current_term
        generate_reports_for_current_term()
    """
    
    from .models import ExamSession
    
    try:
        # Find current exam session
        current_session = ExamSession.objects.filter(is_current=True).first()
        
        if not current_session:
            print("❌ No current exam session found!")
            print("   Set is_current=True on an ExamSession first.")
            return 0
        
        print(f"\n{'='*70}")
        print(f"📅 CURRENT TERM: {current_session}")
        print(f"{'='*70}\n")
        
        return bulk_generate_all_missing_reports(current_session)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        logger.error(f"Error generating reports for current term: {e}", exc_info=True)
        return 0