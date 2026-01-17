from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from teacher.models import Teacher
from classroom.models import Classroom, GradeLevel, Section
from subject.models import Subject
from django.utils import timezone
from datetime import datetime, timedelta


class Lesson(models.Model):
    """Comprehensive Lesson model for school management system"""

    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('postponed', 'Postponed'),
    ]

    LESSON_TYPE_CHOICES = [
        ('lecture', 'Lecture'),
        ('practical', 'Practical'),
        ('discussion', 'Discussion'),
        ('assessment', 'Assessment'),
        ('revision', 'Revision'),
        ('field_trip', 'Field Trip'),
        ('project', 'Project Work'),
        ('exam', 'Examination'),
        ('quiz', 'Quiz'),
        ('group_work', 'Group Work'),
    ]

    DIFFICULTY_CHOICES = [
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'),
        ('advanced', 'Advanced'),
    ]

    # Basic Information
    title = models.CharField(max_length=200, help_text="Lesson title or topic")
    description = models.TextField(blank=True, help_text="Detailed lesson description")
    lesson_type = models.CharField(max_length=20, choices=LESSON_TYPE_CHOICES, default='lecture')
    difficulty_level = models.CharField(max_length=15, choices=DIFFICULTY_CHOICES, default='intermediate')

    # Scheduling
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name='lessons')
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='lessons')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='lessons')

    # Date and Time
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    duration_minutes = models.PositiveIntegerField(
        validators=[MinValueValidator(15), MaxValueValidator(480)],
        help_text="Duration in minutes (15-480)"
    )

    # Status and Progress
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    actual_start_time = models.TimeField(null=True, blank=True)
    actual_end_time = models.TimeField(null=True, blank=True)
    completion_percentage = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Percentage of lesson completed"
    )

    # Educational Content
    learning_objectives = models.JSONField(default=list, help_text="List of learning objectives")
    key_concepts = models.JSONField(default=list, help_text="Key concepts to be covered")
    materials_needed = models.JSONField(default=list, help_text="Required materials and resources")
    assessment_criteria = models.JSONField(default=list, help_text="Assessment criteria")

    # Notes and Feedback
    teacher_notes = models.TextField(blank=True, help_text="Teacher's preparation notes")
    lesson_notes = models.TextField(blank=True, help_text="Notes taken during the lesson")
    student_feedback = models.TextField(blank=True, help_text="Student feedback or questions")
    admin_notes = models.TextField(blank=True, help_text="Administrative notes")

    # Attendance and Participation
    attendance_count = models.PositiveIntegerField(default=0, help_text="Number of students present")
    participation_score = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Overall participation score"
    )

    # Resources and Attachments
    resources = models.JSONField(default=list, help_text="Links to lesson resources")
    attachments = models.JSONField(default=list, help_text="File attachments")

    # Metadata
    is_recurring = models.BooleanField(default=False, help_text="Is this a recurring lesson?")
    recurring_pattern = models.CharField(max_length=50, blank=True, help_text="Recurring pattern (e.g., 'weekly', 'daily')")
    parent_lesson = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='recurring_lessons')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey('users.CustomUser', on_delete=models.SET_NULL, null=True, related_name='created_lessons')
    last_modified_by = models.ForeignKey('users.CustomUser', on_delete=models.SET_NULL, null=True, related_name='modified_lessons')

    # Data retention
    data_retention_expires_at = models.DateTimeField(null=True, blank=True, help_text="When lesson data should be cleaned up")

    # Flags
    is_active = models.BooleanField(default=True)
    requires_special_equipment = models.BooleanField(default=False)
    is_online_lesson = models.BooleanField(default=False)
    requires_substitution = models.BooleanField(default=False)

    class Meta:
        ordering = ['date', 'start_time']
        unique_together = ['classroom', 'date', 'start_time', 'subject']
        indexes = [
            models.Index(fields=["date", "start_time"]),
            models.Index(fields=["teacher", "date"]),
            models.Index(fields=["classroom", "date"]),
            models.Index(fields=["status"]),
            models.Index(fields=["teacher", "date", "status"]),
        ]

    def __str__(self):
        return f"{self.title} - {self.classroom} - {self.date} {self.start_time}"

    @property
    def is_overdue(self):
        """Check if lesson is overdue"""
        now = timezone.now()
        lesson_datetime = timezone.make_aware(
            datetime.combine(self.date, self.end_time)
        )
        return now > lesson_datetime and self.status == 'scheduled'

    @property
    def is_today(self):
        """Check if lesson is scheduled for today"""
        return self.date == timezone.now().date()

    @property
    def is_upcoming(self):
        """Check if lesson is upcoming (within next 7 days)"""
        today = timezone.now().date()
        week_from_now = today + timedelta(days=7)
        return today <= self.date <= week_from_now

    @property
    def time_slot(self):
        """Get formatted time slot"""
        return f"{self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')}"

    @property
    def duration_formatted(self):
        """Get formatted duration"""
        hours = self.duration_minutes // 60
        minutes = self.duration_minutes % 60
        if hours > 0:
            return f"{hours}h {minutes}m" if minutes > 0 else f"{hours}h"
        return f"{minutes}m"

    def can_start(self):
        """Check if lesson can be started"""
        return self.status == 'scheduled' and not self.is_overdue

    def can_complete(self):
        """Check if lesson can be completed"""
        return self.status in ['scheduled', 'in_progress']

    def can_cancel(self):
        """Check if lesson can be cancelled"""
        return self.status in ['scheduled', 'in_progress']

    def calculate_progress_percentage(self):
        """Calculate progress percentage based on current time vs lesson duration"""
        if self.status != 'in_progress' or not self.actual_start_time:
            return self.completion_percentage

        now = timezone.localtime(timezone.now()).time()
        lesson_date = self.date

        # If lesson is not today, return current completion percentage
        if lesson_date != timezone.now().date():
            return self.completion_percentage

        # Calculate progress based on actual start time to scheduled end time
        # This allows for early starts while maintaining proper progress tracking
        actual_start_dt = datetime.combine(lesson_date, self.actual_start_time)
        scheduled_end_dt = datetime.combine(lesson_date, self.end_time)
        current_dt = datetime.combine(lesson_date, now)

        # If current time is before actual start time, return 0
        if current_dt < actual_start_dt:
            return 0

        # If current time is after scheduled end time, return 100
        if current_dt >= scheduled_end_dt:
            return 100

        # Calculate percentage based on actual start to scheduled end
        total_duration = (scheduled_end_dt - actual_start_dt).total_seconds()
        elapsed_duration = (current_dt - actual_start_dt).total_seconds()

        if total_duration > 0:
            percentage = min(100, int((elapsed_duration / total_duration) * 100))
            return percentage

        return self.completion_percentage

    def start_lesson(self):
        """Start the lesson and set actual start time"""
        if self.status == 'scheduled':
            self.status = 'in_progress'
            self.actual_start_time = timezone.localtime(timezone.now()).time()
            self.completion_percentage = 0
            self.save()
            return True
        return False

    def complete_lesson(self):
        """Complete the lesson and set actual end time"""
        if self.status in ['scheduled', 'in_progress']:
            self.status = 'completed'
            self.actual_end_time = timezone.localtime(timezone.now()).time()
            self.completion_percentage = 100
            self.set_data_retention_expiry()  # Set 24-hour retention
            self.save()
            return True
        return False

    def update_progress(self):
        """Update progress percentage automatically"""
        if self.status == 'in_progress':
            new_percentage = self.calculate_progress_percentage()
            if new_percentage != self.completion_percentage:
                self.completion_percentage = new_percentage
                self.save()
            return new_percentage
        return self.completion_percentage

    def set_data_retention_expiry(self):
        """Set data retention expiry to 12 hours after lesson ends (or now if unknown)"""
        from datetime import datetime, timedelta
        expiry_base = timezone.now()
        # Prefer actual end time on the lesson date when available
        try:
            if self.actual_end_time and self.date:
                naive_dt = datetime.combine(self.date, self.actual_end_time)
                expiry_base = timezone.make_aware(naive_dt)
        except Exception:
            expiry_base = timezone.now()

        self.data_retention_expires_at = expiry_base + timedelta(hours=12)
        self.save()

    def cleanup_lesson_data(self):
        """Clean up detailed lesson data while keeping basic info"""
        # Keep basic lesson info but clear detailed data
        self.lesson_notes = ""
        self.student_feedback = ""
        self.admin_notes = ""
        self.resources = []
        self.attachments = []
        self.data_retention_expires_at = None
        self.save()
        # Note: Preserve attendance records and participation metrics

    @classmethod
    def cleanup_expired_lessons(cls):
        """Clean up lessons that have expired data retention"""
        from django.utils import timezone
        expired_lessons = cls.objects.filter(
            data_retention_expires_at__lt=timezone.now(),
            data_retention_expires_at__isnull=False
        )

        for lesson in expired_lessons:
            lesson.cleanup_lesson_data()

        return expired_lessons.count()

    def get_enrolled_students(self):
        """Get list of students enrolled in the lesson's classroom"""
        from classroom.models import StudentEnrollment
        enrollments = StudentEnrollment.objects.filter(
            classroom=self.classroom,
            is_active=True,
            student__is_active=True
        ).select_related('student__user')
        return [enrollment.student for enrollment in enrollments]

    @property
    def enrolled_students_count(self):
        """Get count of enrolled students"""
        return len(self.get_enrolled_students())

    def generate_lesson_report(self):
        """Generate a comprehensive lesson report for download"""
        from .models import LessonAttendance

        # Get attendance data
        attendance_records = LessonAttendance.objects.filter(lesson=self).select_related('student__user')

        report_data = {
            'lesson_info': {
                'title': self.title,
                'subject': self.subject.name,
                'teacher': f"{self.teacher.user.first_name} {self.teacher.user.last_name}",
                'classroom': self.classroom.name,
                'date': self.date.strftime('%Y-%m-%d'),
                'start_time': self.start_time.strftime('%H:%M'),
                'end_time': self.end_time.strftime('%H:%M'),
                'duration': self.duration_formatted,
                'status': self.status,
                'completion_percentage': self.completion_percentage,
            },
            'content': {
                'description': self.description,
                'learning_objectives': self.learning_objectives,
                'key_concepts': self.key_concepts,
                'materials_needed': self.materials_needed,
                'assessment_criteria': self.assessment_criteria,
            },
            'notes': {
                'teacher_notes': self.teacher_notes,
                'lesson_notes': self.lesson_notes,
                'student_feedback': self.student_feedback,
                'admin_notes': self.admin_notes,
            },
            'attendance': {
                'total_students': attendance_records.count(),
                'present_count': attendance_records.filter(status='present').count(),
                'absent_count': attendance_records.filter(status='absent').count(),
                'late_count': attendance_records.filter(status='late').count(),
                'excused_count': attendance_records.filter(status='excused').count(),
                'sick_count': attendance_records.filter(status='sick').count(),
                'records': [
                    {
                        'student_name': f"{record.student.user.first_name} {record.student.user.last_name}",
                        'status': record.status,
                        'arrival_time': record.arrival_time.strftime('%H:%M') if record.arrival_time else 'N/A',
                        'notes': record.notes,
                    }
                    for record in attendance_records
                ]
            },
            'resources': self.resources,
            'attachments': self.attachments,
            'participation_score': self.participation_score,
            'generated_at': timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        }

        return report_data


class LessonAttendance(models.Model):
    """Track individual student attendance for lessons"""
    
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='attendances')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='lesson_attendances')
    
    ATTENDANCE_STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('excused', 'Excused'),
        ('sick', 'Sick'),
    ]
    
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='present')
    arrival_time = models.TimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        unique_together = ['lesson', 'student']
    
    def __str__(self):
        return f"{self.student} - {self.lesson} - {self.status}"


class LessonResource(models.Model):
    """Additional resources for lessons"""
    
    RESOURCE_TYPE_CHOICES = [
        ('document', 'Document'),
        ('video', 'Video'),
        ('audio', 'Audio'),
        ('link', 'External Link'),
        ('image', 'Image'),
        ('presentation', 'Presentation'),
    ]
    
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='lesson_resources')
    title = models.CharField(max_length=200)
    resource_type = models.CharField(max_length=15, choices=RESOURCE_TYPE_CHOICES)
    url = models.URLField(blank=True)
    file_path = models.CharField(max_length=500, blank=True)
    description = models.TextField(blank=True)
    is_required = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['title']
    
    def __str__(self):
        return f"{self.title} - {self.lesson}"


class LessonAssessment(models.Model):
    """Assessment tracking for lessons"""
    
    ASSESSMENT_TYPE_CHOICES = [
        ('quiz', 'Quiz'),
        ('assignment', 'Assignment'),
        ('project', 'Project'),
        ('presentation', 'Presentation'),
        ('participation', 'Participation'),
        ('homework', 'Homework'),
    ]
    
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='assessments')
    title = models.CharField(max_length=200)
    assessment_type = models.CharField(max_length=15, choices=ASSESSMENT_TYPE_CHOICES)
    description = models.TextField(blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    total_points = models.PositiveIntegerField(default=100)
    weight_percentage = models.PositiveIntegerField(
        default=10,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text="Weight of this assessment in overall grade"
    )
    
    class Meta:
        ordering = ['due_date', 'title']
    
    def __str__(self):
        return f"{self.title} - {self.lesson}"
