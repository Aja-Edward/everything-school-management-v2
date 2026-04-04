from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Student
from classroom.models import Classroom, StudentEnrollment, Section
from academics.models import AcademicSession, Term


@receiver(post_save, sender=Student)
def auto_enroll_or_update_student(sender, instance, created, **kwargs):
    """
    Automatically enroll or update student's classroom enrollment
    when a Student is created or their classroom changes.
    """
    try:
        # Skip inactive students
        if not instance.is_active:
            return

        # Step 1: Get the Class object directly from student_class
        student_class = instance.student_class  # This is a Class object e.g. SSS 2
        if not student_class:
            print(f"⚠️ {instance} has no class assigned. Skipping enrollment.")
            return

        # Step 2: Get section name from classroom string e.g. "SSS 2 Diamond" → "Diamond"
        classroom_name = instance.classroom  # string like "SSS 2 Diamond"
        section_name = None
        if classroom_name:
            parts = str(classroom_name).strip().split()
            # Section name is the last word e.g. "Diamond"
            if parts:
                section_name = parts[-1]  # preserve original casing e.g. "Diamond"

        if not section_name:
            print(
                f"⚠️ Could not extract section name from '{classroom_name}'. Skipping."
            )
            return

        # Step 3: Get Section — links via class_grade (which is the Class object)
        section = Section.objects.filter(
            class_grade=student_class,
            name__iexact=section_name,
            tenant=instance.tenant,
        ).first()

        if not section:
            print(
                f"⚠️ No section '{section_name}' found for class '{student_class.name}' "
                f"in tenant '{instance.tenant}'. Skipping."
            )
            return

        # Step 4: Get current academic session and term
        academic_session = AcademicSession.objects.filter(
            is_current=True, tenant=instance.tenant
        ).first()
        term = Term.objects.filter(is_current=True, tenant=instance.tenant).first()

        if not academic_session or not term:
            print(
                f"⚠️ No current academic session or term found for tenant '{instance.tenant}'."
            )
            return

        # Step 5: Find existing classroom by section — prefer current session/term
        # but fall back to any active classroom for that section.
        # This prevents duplicate classrooms being created alongside admin-created ones.
        classroom = (
            Classroom.objects.filter(
                section=section,
                tenant=instance.tenant,
                is_active=True,
            )
            .order_by(
                # Prefer classrooms matching current session and term
                "-academic_session__is_current",
                "-term__is_current",
            )
            .first()
        )

        if not classroom:
            # Only create if absolutely no classroom exists for this section
            classroom = Classroom.objects.create(
                section=section,
                academic_session=academic_session,
                term=term,
                tenant=instance.tenant,
                name=f"{student_class.name} {section_name}",
                room_number="TBD",
                max_capacity=student_class.default_capacity or 30,
                is_active=True,
            )
            print(f"🏫 Created new classroom: {classroom.name}")
        else:
            print(f"🏫 Using existing classroom: {classroom.name} (id={classroom.id})")

        # Step 6: Enroll or update
        active_enrollment = StudentEnrollment.objects.filter(
            student=instance, is_active=True
        ).first()

        if created:
            if not active_enrollment:
                StudentEnrollment.objects.create(
                    student=instance, classroom=classroom, tenant=instance.tenant
                )
                print(f"✅ {instance} auto-enrolled in {classroom.name}")
        else:
            if active_enrollment and active_enrollment.classroom != classroom:
                active_enrollment.is_active = False
                active_enrollment.save()
                StudentEnrollment.objects.create(
                    student=instance, classroom=classroom, tenant=instance.tenant
                )
                print(f"🔄 Updated {instance}'s classroom to {classroom.name}")
            elif not active_enrollment:
                StudentEnrollment.objects.create(
                    student=instance, classroom=classroom, tenant=instance.tenant
                )
                print(f"✅ {instance} enrolled in {classroom.name}")

    except Exception as e:
        print(f"❌ Error enrolling/updating {instance}: {str(e)}")
        import traceback

        traceback.print_exc()
