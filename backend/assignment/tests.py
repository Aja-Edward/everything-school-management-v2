"""
Assignments: who can see and change what.

A teacher sets work only for the classes (and subjects) they teach and only
edits their own; parents see the work for their own children's current
classes; students their own class's; admins every class within their levels.
Nothing crosses from one school to another.
"""

from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import (
    Class,
    Classroom,
    ClassroomCoTeacher,
    ClassroomTeacherAssignment,
    Section,
    StudentEnrollment,
)
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from subject.models import Subject
from teacher.models import Teacher
from tenants.models import Tenant
from utils.notifications import SendResult

from .digest import send_new_assignment_digests
from .models import Assignment, AssignmentSubmission

User = get_user_model()
URL = "/api/assignments/"


class School:
    """One school with two JSS classrooms, their teachers, pupils and parents."""

    def __init__(self, slug):
        self.slug = slug
        self.tenant = Tenant.objects.create(
            name=slug.replace("-", " ").title(), slug=slug, status="active",
            is_active=True, owner_email=f"{slug}@example.com")
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code="jss",
            defaults={"name": "Junior Secondary", "level_type": "JUNIOR_SECONDARY"})
        session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        term_type, _ = TermType.objects.get_or_create(
            tenant=self.tenant, code="FIRST_TERM", defaults={"name": "First Term", "display_order": 1})
        term = Term.objects.create(
            tenant=self.tenant, term_type=term_type, academic_session=session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16))

        def classroom(name, number):
            grade = Class.objects.create(
                tenant=self.tenant, name=name, code=f"{slug}-{number}",
                education_level=level, grade_number=number, order=number)
            section = Section.objects.create(tenant=self.tenant, class_grade=grade, name="A")
            return Classroom.objects.create(
                tenant=self.tenant, name=name, section=section,
                academic_session=session, term=term)

        self.jss1 = classroom("JSS 1", 1)
        self.jss2 = classroom("JSS 2", 2)
        self.maths = Subject.objects.create(tenant=self.tenant, name="Mathematics", code="MTH-JSS")
        self.english = Subject.objects.create(tenant=self.tenant, name="English", code="ENG-JSS")

        # JSS 1: a form teacher, a maths teacher and an English teacher.
        self.form_teacher = self.teacher("form")
        self.jss1.class_teacher = self.form_teacher
        self.jss1.save()
        self.maths_teacher = self.teacher("maths")
        self.english_teacher = self.teacher("english")
        self.teaches(self.maths_teacher, self.jss1, self.maths)
        self.teaches(self.english_teacher, self.jss1, self.english)
        # JSS 2: someone who never teaches JSS 1.
        self.jss2_teacher = self.teacher("jss2")
        self.teaches(self.jss2_teacher, self.jss2, self.maths)

        self.jss1_child = self.student("ada")
        self.jss2_child = self.student("bayo")
        self.enrol(self.jss1_child, self.jss1)
        self.enrol(self.jss2_child, self.jss2)
        self.jss1_parent = self.parent("ada_mum", self.jss1_child)
        self.jss2_parent = self.parent("bayo_dad", self.jss2_child)

        self.admin = self.user("admin", "admin")

    def user(self, name, role, **extra):
        return User.objects.create_user(
            username=f"{self.slug}_{name}", email=f"{name}@{self.slug}.example.com",
            first_name=name.title(), last_name="Test", role=role,
            password=None, is_active=True, tenant=self.tenant, **extra)

    def teacher(self, name):
        return Teacher.objects.create(
            tenant=self.tenant, user=self.user(name, "teacher"), employee_id=f"T-{name}")

    def teaches(self, teacher, classroom, subject):
        ClassroomTeacherAssignment.objects.create(
            tenant=self.tenant, teacher=teacher, classroom=classroom, subject=subject)

    def student(self, name):
        return Student.objects.create(
            tenant=self.tenant, user=self.user(name, "student"), gender="F",
            date_of_birth=date(2014, 5, 1))

    def enrol(self, student, classroom):
        StudentEnrollment.objects.create(tenant=self.tenant, student=student, classroom=classroom)

    def parent(self, name, child):
        profile = ParentProfile.objects.create(tenant=self.tenant, user=self.user(name, "parent"))
        ParentStudentRelationship.objects.create(
            tenant=self.tenant, parent=profile, student=child, relationship="Mother")
        return profile

    def assignment(self, classroom, teacher, subject=None, due_in_days=7, title="Homework"):
        return Assignment.objects.create(
            tenant=self.tenant, classroom=classroom, teacher=teacher, subject=subject,
            title=title, instructions="Do exercises 1-10.",
            due_date=timezone.localdate() + timedelta(days=due_in_days))


class AssignmentAccessTest(APITestCase):
    def setUp(self):
        self.school = School("assign-school")
        self.other = School("assign-other")
        s = self.school
        self.jss1_maths = s.assignment(s.jss1, s.maths_teacher, s.maths, title="Fractions")
        self.jss1_overdue = s.assignment(s.jss1, s.english_teacher, s.english, due_in_days=-2, title="Essay")
        self.jss2_maths = s.assignment(s.jss2, s.jss2_teacher, s.maths, title="Algebra")
        self.elsewhere = self.other.assignment(
            self.other.jss1, self.other.maths_teacher, self.other.maths, title="Other school")

    # ── helpers ──

    def as_user(self, user, school=None):
        self.client.force_authenticate(user=user)
        self.slug = (school or self.school).slug

    def get(self, path=""):
        return self.client.get(URL + path, HTTP_X_TENANT_SLUG=self.slug)

    def post(self, data, format="json"):
        return self.client.post(URL, data, format=format, HTTP_X_TENANT_SLUG=self.slug)

    def patch(self, assignment, data):
        return self.client.patch(f"{URL}{assignment.id}/", data, format="json", HTTP_X_TENANT_SLUG=self.slug)

    def delete(self, assignment):
        return self.client.delete(f"{URL}{assignment.id}/", HTTP_X_TENANT_SLUG=self.slug)

    def titles(self, response):
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(row["title"] for row in response.data)

    def new(self, classroom, subject=None, **extra):
        data = {"classroom": classroom.id, "title": "Reading", "instructions": "Read chapter 2.",
                "due_date": str(timezone.localdate() + timedelta(days=3)), **extra}
        if subject is not None:
            data["subject"] = subject.id
        return data

    # ── teachers ──

    def test_teacher_sets_an_assignment_for_their_class_and_subject(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        response = self.post(self.new(s.jss1, s.maths))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        created = Assignment.objects.get(id=response.data["id"])
        self.assertEqual((created.tenant, created.teacher, created.created_by),
                         (s.tenant, s.maths_teacher, s.maths_teacher.user))
        self.assertTrue(response.data["can_edit"])

    def test_teacher_cannot_set_work_for_a_class_they_do_not_teach(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        response = self.post(self.new(s.jss2, s.maths))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("classroom", response.data)

    def test_teacher_cannot_set_work_in_another_schools_class(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        response = self.post(self.new(self.other.jss1, s.maths))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(Assignment.objects.filter(tenant=self.other.tenant, title="Reading").exists())

    def test_subject_teacher_is_held_to_their_own_subject(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        wrong_subject = self.post(self.new(s.jss1, s.english))
        no_subject = self.post(self.new(s.jss1))

        self.assertEqual(wrong_subject.status_code, status.HTTP_400_BAD_REQUEST, wrong_subject.data)
        self.assertIn("subject", wrong_subject.data)
        self.assertEqual(no_subject.status_code, status.HTTP_400_BAD_REQUEST, no_subject.data)
        self.assertIn("subject", no_subject.data)

    def test_form_teacher_may_set_work_for_any_class_subject_or_none(self):
        s = self.school
        self.as_user(s.form_teacher.user)

        general = self.post(self.new(s.jss1))
        english = self.post(self.new(s.jss1, s.english))

        self.assertEqual(general.status_code, status.HTTP_201_CREATED, general.data)
        self.assertEqual(english.status_code, status.HTTP_201_CREATED, english.data)

    def test_co_teacher_teaches_the_class(self):
        s = self.school
        ClassroomCoTeacher.objects.create(tenant=s.tenant, classroom=s.jss2, teacher=s.english_teacher)
        self.as_user(s.english_teacher.user)

        response = self.post(self.new(s.jss2))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_teacher_lists_only_their_classes_assignments(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        self.assertEqual(self.titles(self.get()), ["Essay", "Fractions"])

    def test_teacher_sees_but_cannot_change_a_colleagues_assignment(self):
        s = self.school
        self.as_user(s.english_teacher.user)

        seen = self.get(f"{self.jss1_maths.id}/")
        edited = self.patch(self.jss1_maths, {"title": "Mine now"})
        deleted = self.delete(self.jss1_maths)

        self.assertEqual(seen.status_code, status.HTTP_200_OK, seen.data)
        self.assertFalse(seen.data["can_edit"])
        self.assertEqual(edited.status_code, status.HTTP_403_FORBIDDEN, edited.data)
        self.assertEqual(deleted.status_code, status.HTTP_403_FORBIDDEN)
        self.jss1_maths.refresh_from_db()
        self.assertEqual(self.jss1_maths.title, "Fractions")

    def test_teacher_of_another_class_cannot_reach_it(self):
        s = self.school
        self.as_user(s.jss2_teacher.user)

        self.assertEqual(self.get(f"{self.jss1_maths.id}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.patch(self.jss1_maths, {"title": "x"}).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.delete(self.jss1_maths).status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Assignment.objects.filter(id=self.jss1_maths.id).exists())

    def test_author_edits_and_deletes_their_assignment(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        edited = self.patch(self.jss1_maths, {"title": "Fractions II", "due_date": "2026-11-02"})
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.data)
        self.jss1_maths.refresh_from_db()
        self.assertEqual((self.jss1_maths.title, self.jss1_maths.due_date), ("Fractions II", date(2026, 11, 2)))

        deleted = self.delete(self.jss1_maths)
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Assignment.objects.filter(id=self.jss1_maths.id).exists())

    def test_author_cannot_move_work_to_a_class_they_do_not_teach(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        response = self.patch(self.jss1_maths, {"classroom": s.jss2.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.jss1_maths.refresh_from_db()
        self.assertEqual(self.jss1_maths.classroom, s.jss1)

    def test_teaching_options_list_each_class_with_its_subjects(self):
        s = self.school
        self.as_user(s.form_teacher.user)

        response = self.get("teaching-options/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([(c["name"], c["leads_class"]) for c in response.data], [("JSS 1", True)])
        self.assertEqual(sorted(x["name"] for x in response.data[0]["subjects"]), ["English", "Mathematics"])

    # ── parents ──

    def test_parent_sees_their_childs_class_grouped_by_child(self):
        s = self.school
        self.as_user(s.jss1_parent.user)

        response = self.get("children/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data), 1)
        group = response.data[0]
        self.assertEqual(group["student_id"], s.jss1_child.id)
        self.assertEqual([c["name"] for c in group["classrooms"]], ["JSS 1"])
        overdue = {a["title"]: a["is_overdue"] for a in group["assignments"]}
        self.assertEqual(overdue, {"Fractions": False, "Essay": True})
        self.assertEqual(self.titles(self.get()), ["Essay", "Fractions"])

    def test_parent_of_a_child_in_another_class_does_not_see_it(self):
        s = self.school
        self.as_user(s.jss2_parent.user)

        self.assertEqual(self.titles(self.get()), ["Algebra"])
        self.assertEqual(self.get(f"{self.jss1_maths.id}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_parent_with_children_in_two_classes_gets_both_groups(self):
        s = self.school
        ParentStudentRelationship.objects.create(
            tenant=s.tenant, parent=s.jss1_parent, student=s.jss2_child, relationship="Guardian")
        self.as_user(s.jss1_parent.user)

        response = self.get("children/")

        groups = {g["student_id"]: sorted(a["title"] for a in g["assignments"]) for g in response.data}
        self.assertEqual(groups, {s.jss1_child.id: ["Essay", "Fractions"], s.jss2_child.id: ["Algebra"]})

    def test_a_child_who_left_the_class_no_longer_shows_its_work(self):
        s = self.school
        StudentEnrollment.objects.filter(student=s.jss1_child).update(is_active=False)
        self.as_user(s.jss1_parent.user)

        response = self.get("children/")

        self.assertEqual(response.data[0]["assignments"], [])
        self.assertEqual(self.titles(self.get()), [])

    def test_parent_cannot_set_change_or_delete_assignments(self):
        s = self.school
        self.as_user(s.jss1_parent.user)

        self.assertEqual(self.post(self.new(s.jss1, s.maths)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.patch(self.jss1_maths, {"title": "x"}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.delete(self.jss1_maths).status_code, status.HTTP_403_FORBIDDEN)

    def test_children_view_is_for_parents_only(self):
        self.as_user(self.school.maths_teacher.user)

        self.assertEqual(self.get("children/").status_code, status.HTTP_403_FORBIDDEN)

    # ── students ──

    def test_student_sees_only_their_own_class(self):
        s = self.school
        self.as_user(s.jss1_child.user)

        self.assertEqual(self.titles(self.get()), ["Essay", "Fractions"])
        self.assertEqual(self.post(self.new(s.jss1, s.maths)).status_code, status.HTTP_403_FORBIDDEN)

    # ── admins ──

    def test_admin_sees_every_class_and_may_delete_but_not_set(self):
        s = self.school
        self.as_user(s.admin)

        self.assertEqual(self.titles(self.get()), ["Algebra", "Essay", "Fractions"])
        self.assertEqual(self.post(self.new(s.jss1, s.maths)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.patch(self.jss1_maths, {"title": "x"}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.delete(self.jss1_maths).status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_filters_by_one_students_class(self):
        """The admin's student page and parent view show one pupil's class."""
        s = self.school
        self.as_user(s.admin)

        jss1 = self.client.get(URL, {"student": s.jss1_child.id}, HTTP_X_TENANT_SLUG=self.slug)
        jss2 = self.client.get(URL, {"student": s.jss2_child.id}, HTTP_X_TENANT_SLUG=self.slug)

        self.assertEqual(self.titles(jss1), ["Essay", "Fractions"])
        self.assertEqual(self.titles(jss2), ["Algebra"])
        self.assertTrue(all(row["can_delete"] and not row["can_edit"] for row in jss1.data))

    def test_student_filter_never_reaches_another_school(self):
        s = self.school
        self.as_user(s.admin)

        foreign = self.client.get(URL, {"student": self.other.jss1_child.id}, HTTP_X_TENANT_SLUG=self.slug)
        junk = self.client.get(URL, {"student": "abc"}, HTTP_X_TENANT_SLUG=self.slug)

        self.assertEqual(self.titles(foreign), [])
        self.assertEqual(self.titles(junk), [])

    def test_student_filter_does_not_widen_what_a_parent_sees(self):
        s = self.school
        self.as_user(s.jss1_parent.user)

        response = self.client.get(URL, {"student": s.jss2_child.id}, HTTP_X_TENANT_SLUG=self.slug)

        self.assertEqual(self.titles(response), [])

    def test_only_admins_and_authors_may_delete(self):
        s = self.school
        self.as_user(s.english_teacher.user)

        rows = {row["title"]: row["can_delete"] for row in self.get().data}

        self.assertEqual(rows, {"Essay": True, "Fractions": False})

    def test_section_admin_sees_only_their_levels(self):
        s = self.school
        primary_admin = s.user("primary_admin", "primary_admin", is_staff=True)
        jss_admin = s.user("jss_admin", "junior_secondary_admin", is_staff=True)

        self.as_user(primary_admin)
        self.assertEqual(self.titles(self.get()), [])
        self.as_user(jss_admin)
        self.assertEqual(self.titles(self.get()), ["Algebra", "Essay", "Fractions"])

    # ── other schools ──

    def test_nobody_sees_another_schools_assignments(self):
        s = self.school
        for user in (s.admin, s.maths_teacher.user, s.jss1_parent.user, s.jss1_child.user):
            self.as_user(user)
            self.assertNotIn("Other school", self.titles(self.get()))
            self.assertEqual(self.get(f"{self.elsewhere.id}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_another_schools_teacher_gets_nothing_here(self):
        """Under this school's header, the other school's teacher has no teacher profile here."""
        s = self.school
        self.as_user(self.other.maths_teacher.user)

        self.assertEqual(self.titles(self.get()), [])
        self.assertEqual(self.post(self.new(s.jss1, s.maths)).status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_linked_to_another_schools_child_sees_none_of_its_work(self):
        s = self.school
        ParentStudentRelationship.objects.create(
            tenant=s.tenant, parent=s.jss2_parent, student=self.other.jss1_child, relationship="Guardian")
        self.as_user(s.jss2_parent.user)

        self.assertEqual(self.titles(self.get()), ["Algebra"])
        self.assertEqual([g["student_id"] for g in self.get("children/").data], [s.jss2_child.id])


class AssignmentAttachmentTest(APITestCase):
    def setUp(self):
        self.school = School("attach-school")
        self.client.force_authenticate(user=self.school.maths_teacher.user)

    def post(self, upload):
        s = self.school
        return self.client.post(URL, {
            "classroom": s.jss1.id, "subject": s.maths.id, "title": "Worksheet",
            "due_date": "2026-11-01", "attachment": upload,
        }, format="multipart", HTTP_X_TENANT_SLUG=s.slug)

    @patch("assignment.storage.delete_attachment")
    @patch("assignment.storage.upload_attachment")
    def test_attachment_is_uploaded_and_replaced(self, upload, delete):
        upload.return_value = ("https://res.cloudinary.com/x/raw/upload/a.pdf", "assignments/1/a.pdf")

        response = self.post(SimpleUploadedFile("worksheet.pdf", b"%PDF-1.4", content_type="application/pdf"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["attachment_name"], "worksheet.pdf")
        self.assertEqual(response.data["attachment_url"], "https://res.cloudinary.com/x/raw/upload/a.pdf")

        upload.return_value = ("https://res.cloudinary.com/x/raw/upload/b.pdf", "assignments/1/b.pdf")
        replaced = self.client.patch(
            f"{URL}{response.data['id']}/",
            {"attachment": SimpleUploadedFile("v2.pdf", b"%PDF-1.4", content_type="application/pdf")},
            format="multipart", HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(replaced.status_code, status.HTTP_200_OK, replaced.data)
        self.assertEqual(replaced.data["attachment_name"], "v2.pdf")
        delete.assert_called_once_with("assignments/1/a.pdf")

    @patch("assignment.storage.upload_attachment")
    def test_unsupported_file_type_is_refused(self, upload):
        response = self.post(SimpleUploadedFile("virus.exe", b"MZ", content_type="application/octet-stream"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("attachment", response.data)
        upload.assert_not_called()


class SubmissionTest(APITestCase):
    """
    Students hand in work for their own class's assignments and may replace
    it until it is marked. The assignment's teacher or the class teacher
    marks it; parents and admins read it. Nobody reaches another pupil's or
    another school's.
    """

    def setUp(self):
        self.school = School("submit-school")
        self.other = School("submit-other")
        s = self.school
        self.fractions = s.assignment(s.jss1, s.maths_teacher, s.maths, title="Fractions")
        self.jss2_work = s.assignment(s.jss2, s.jss2_teacher, s.maths, title="Algebra")
        self.classmate = s.student("chidi")
        s.enrol(self.classmate, s.jss1)

    def as_user(self, user, school=None):
        self.client.force_authenticate(user=user)
        self.slug = (school or self.school).slug

    def submit(self, assignment, data, format="json"):
        return self.client.post(f"{URL}{assignment.id}/submit/", data, format=format,
                                HTTP_X_TENANT_SLUG=self.slug)

    def roster(self, assignment):
        return self.client.get(f"{URL}{assignment.id}/submissions/", HTTP_X_TENANT_SLUG=self.slug)

    def grade(self, assignment, submission_id, grade="8/10", feedback="Good work"):
        return self.client.post(f"{URL}{assignment.id}/grade/",
                                {"submission": submission_id, "grade": grade, "feedback": feedback},
                                format="json", HTTP_X_TENANT_SLUG=self.slug)

    def get(self, path=""):
        return self.client.get(URL + path, HTTP_X_TENANT_SLUG=self.slug)

    def handed_in(self, student, text="My answers", assignment=None):
        return AssignmentSubmission.objects.create(
            tenant=self.school.tenant, assignment=assignment or self.fractions,
            student=student, text=text)

    # ── students ──

    def test_student_hands_in_and_sees_it_on_the_assignment(self):
        s = self.school
        self.as_user(s.jss1_child.user)

        response = self.submit(self.fractions, {"text": "1/2 + 1/4 = 3/4"})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertFalse(response.data["is_late"])
        row = next(r for r in self.get().data if r["id"] == self.fractions.id)
        self.assertEqual(row["submission"]["text"], "1/2 + 1/4 = 3/4")
        self.assertIsNone(row["submission_count"])  # class totals are for staff

    def test_student_may_replace_work_until_it_is_marked(self):
        s = self.school
        self.as_user(s.jss1_child.user)
        first = self.submit(self.fractions, {"text": "draft"})

        second = self.submit(self.fractions, {"text": "final"})

        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(second.data["id"], first.data["id"])
        self.assertEqual(AssignmentSubmission.objects.get().text, "final")

        AssignmentSubmission.objects.update(grade="7/10", graded_at=timezone.now())
        locked = self.submit(self.fractions, {"text": "after marking"})
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST, locked.data)
        self.assertEqual(AssignmentSubmission.objects.get().text, "final")

    def test_empty_hand_in_is_refused(self):
        self.as_user(self.school.jss1_child.user)

        response = self.submit(self.fractions, {"text": "   "})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(AssignmentSubmission.objects.exists())

    def test_late_work_is_accepted_and_flagged(self):
        s = self.school
        overdue = s.assignment(s.jss1, s.maths_teacher, s.maths, due_in_days=-1, title="Late")
        self.as_user(s.jss1_child.user)

        response = self.submit(overdue, {"text": "Sorry it's late"})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["is_late"])

    def test_student_cannot_hand_in_for_another_class_or_school(self):
        s = self.school
        self.as_user(s.jss1_child.user)

        self.assertEqual(self.submit(self.jss2_work, {"text": "x"}).status_code, status.HTTP_404_NOT_FOUND)
        other = self.other.assignment(self.other.jss1, self.other.maths_teacher, self.other.maths)
        self.assertEqual(self.submit(other, {"text": "x"}).status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(AssignmentSubmission.objects.exists())

    def test_teachers_and_admins_do_not_hand_in(self):
        s = self.school
        for user in (s.maths_teacher.user, s.admin):
            self.as_user(user)
            response = self.submit(self.fractions, {"text": "x", "student": s.jss1_child.id})
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, user.username)
        self.assertFalse(AssignmentSubmission.objects.exists())

    def test_student_hand_in_is_recorded_as_theirs(self):
        s = self.school
        self.as_user(s.jss1_child.user)

        response = self.submit(self.fractions, {"text": "mine"})

        self.assertFalse(response.data["handed_in_by_parent"])
        self.assertEqual(AssignmentSubmission.objects.get().submitted_by, s.jss1_child.user)

    # ── parents handing in for a child ──

    def test_parent_hands_in_for_their_child(self):
        s = self.school
        self.as_user(s.jss1_parent.user)

        response = self.submit(self.fractions, {"text": "Ada's answers", "student": s.jss1_child.id})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        work = AssignmentSubmission.objects.get()
        self.assertEqual((work.student, work.submitted_by), (s.jss1_child, s.jss1_parent.user))
        self.assertTrue(response.data["handed_in_by_parent"])
        self.assertEqual(response.data["submitted_by_name"], "Ada_Mum Test")

        groups = self.get("children/").data
        row = next(a for a in groups[0]["assignments"] if a["id"] == self.fractions.id)
        self.assertEqual(row["submission"]["text"], "Ada's answers")

    def test_parent_and_child_share_one_hand_in(self):
        s = self.school
        self.as_user(s.jss1_child.user)
        self.submit(self.fractions, {"text": "started by Ada"})

        self.as_user(s.jss1_parent.user)
        response = self.submit(self.fractions, {"text": "finished with Mum", "student": s.jss1_child.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(AssignmentSubmission.objects.get().text, "finished with Mum")

    def test_parent_must_name_the_child(self):
        self.as_user(self.school.jss1_parent.user)

        response = self.submit(self.fractions, {"text": "x"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("student", response.data)
        self.assertFalse(AssignmentSubmission.objects.exists())

    def test_parent_cannot_hand_in_for_someone_elses_child(self):
        s = self.school
        self.as_user(s.jss1_parent.user)

        # A classmate in the same class, and another school's pupil.
        for student_id in (self.classmate.id, self.other.jss1_child.id):
            response = self.submit(self.fractions, {"text": "x", "student": student_id})
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(AssignmentSubmission.objects.exists())

    def test_parent_cannot_hand_in_a_child_for_another_class(self):
        s = self.school
        # One parent, two children in different classes.
        ParentStudentRelationship.objects.create(
            tenant=s.tenant, parent=s.jss1_parent, student=s.jss2_child, relationship="Mother")
        self.as_user(s.jss1_parent.user)

        wrong = self.submit(self.fractions, {"text": "x", "student": s.jss2_child.id})
        right = self.submit(self.jss2_work, {"text": "Bayo's algebra", "student": s.jss2_child.id})

        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST, wrong.data)
        self.assertEqual(right.status_code, status.HTTP_201_CREATED, right.data)
        self.assertEqual(AssignmentSubmission.objects.get().student, s.jss2_child)

    def test_parent_cannot_change_marked_work(self):
        s = self.school
        self.handed_in(s.jss1_child)
        AssignmentSubmission.objects.update(grade="9/10", graded_at=timezone.now())
        self.as_user(s.jss1_parent.user)

        response = self.submit(self.fractions, {"text": "changed", "student": s.jss1_child.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(AssignmentSubmission.objects.get().text, "My answers")

    def test_teacher_sees_a_parent_handed_it_in(self):
        s = self.school
        self.as_user(s.jss1_parent.user)
        self.submit(self.fractions, {"text": "x", "student": s.jss1_child.id})

        self.as_user(s.maths_teacher.user)
        rows = self.roster(self.fractions).data["students"]

        work = next(r["submission"] for r in rows if r["student_id"] == s.jss1_child.id)
        self.assertTrue(work["handed_in_by_parent"])

    @patch("assignment.storage.upload_attachment")
    def test_student_attaches_a_file(self, upload):
        upload.return_value = ("https://res.cloudinary.com/x/raw/upload/s.pdf", "assignments/1/submissions/s.pdf")
        self.as_user(self.school.jss1_child.user)

        response = self.submit(self.fractions, {
            "attachment": SimpleUploadedFile("my work.pdf", b"%PDF-1.4", content_type="application/pdf"),
        }, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["attachment_name"], "my work.pdf")
        self.assertEqual(upload.call_args.kwargs["folder"], "submissions")

    # ── teachers ──

    def test_teacher_sees_the_whole_class_with_who_has_handed_in(self):
        s = self.school
        self.handed_in(s.jss1_child)
        self.as_user(s.maths_teacher.user)

        response = self.roster(self.fractions)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["can_grade"])
        by_id = {row["student_id"]: row["submission"] for row in response.data["students"]}
        self.assertEqual(set(by_id), {s.jss1_child.id, self.classmate.id})
        self.assertEqual(by_id[s.jss1_child.id]["text"], "My answers")
        self.assertIsNone(by_id[self.classmate.id])

        row = next(r for r in self.get().data if r["id"] == self.fractions.id)
        self.assertEqual((row["submission_count"], row["student_count"]), (1, 2))

    def test_author_and_class_teacher_mark_but_other_subject_teachers_only_read(self):
        s = self.school
        work = self.handed_in(s.jss1_child)

        self.as_user(s.english_teacher.user)
        self.assertFalse(self.roster(self.fractions).data["can_grade"])
        self.assertEqual(self.grade(self.fractions, work.id).status_code, status.HTTP_403_FORBIDDEN)

        self.as_user(s.form_teacher.user)
        self.assertEqual(self.grade(self.fractions, work.id, "B").status_code, status.HTTP_200_OK)

        self.as_user(s.maths_teacher.user)
        response = self.grade(self.fractions, work.id, "8/10", "Check question 3")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        work.refresh_from_db()
        self.assertEqual((work.grade, work.feedback, work.graded_by), ("8/10", "Check question 3", s.maths_teacher))

    def test_clearing_the_mark_hands_work_back(self):
        s = self.school
        work = self.handed_in(s.jss1_child)
        self.as_user(s.maths_teacher.user)
        self.grade(self.fractions, work.id)

        response = self.grade(self.fractions, work.id, "", "")

        self.assertFalse(response.data["is_graded"])
        self.as_user(s.jss1_child.user)
        self.assertEqual(self.submit(self.fractions, {"text": "redone"}).status_code, status.HTTP_200_OK)

    def test_teacher_cannot_mark_a_hand_in_from_another_assignment(self):
        s = self.school
        other_work = self.handed_in(s.jss2_child, assignment=self.jss2_work)
        self.as_user(s.maths_teacher.user)

        response = self.grade(self.fractions, other_work.id)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        other_work.refresh_from_db()
        self.assertFalse(other_work.is_graded)

    def test_teacher_of_another_class_cannot_read_hand_ins(self):
        self.as_user(self.school.jss2_teacher.user)
        self.assertEqual(self.roster(self.fractions).status_code, status.HTTP_404_NOT_FOUND)

    # ── parents, admins ──

    def test_parent_sees_each_childs_own_hand_in(self):
        s = self.school
        self.handed_in(s.jss1_child, text="Ada's work")
        self.handed_in(self.classmate, text="Chidi's work")
        self.as_user(s.jss1_parent.user)

        groups = self.get("children/").data
        row = next(a for a in groups[0]["assignments"] if a["id"] == self.fractions.id)
        self.assertEqual(row["submission"]["text"], "Ada's work")

        mine = self.get(f"?student={s.jss1_child.id}").data
        self.assertEqual(mine[0]["submission"]["text"], "Ada's work")

    def test_parent_cannot_read_a_classmates_hand_in(self):
        s = self.school
        self.handed_in(self.classmate, text="Chidi's work")
        self.as_user(s.jss1_parent.user)

        rows = self.get(f"?student={self.classmate.id}").data
        self.assertTrue(rows)  # the same class's assignments...
        self.assertTrue(all(r["submission"] is None for r in rows))  # ...but not Chidi's work
        self.assertEqual(self.roster(self.fractions).status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_read_a_classmates_hand_in(self):
        s = self.school
        self.handed_in(self.classmate, text="Chidi's work")
        self.as_user(s.jss1_child.user)

        rows = self.get(f"?student={self.classmate.id}").data
        self.assertTrue(all(r["submission"] is None for r in rows))
        self.assertEqual(self.roster(self.fractions).status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_reads_hand_ins_but_does_not_mark(self):
        s = self.school
        work = self.handed_in(s.jss1_child)
        self.as_user(s.admin)

        self.assertEqual(self.roster(self.fractions).status_code, status.HTTP_200_OK)
        self.assertFalse(self.roster(self.fractions).data["can_grade"])
        self.assertEqual(self.get(f"?student={s.jss1_child.id}").data[0]["submission"]["id"], work.id)
        self.assertEqual(self.grade(self.fractions, work.id).status_code, status.HTTP_403_FORBIDDEN)

    def test_another_schools_admin_reaches_none_of_it(self):
        s = self.school
        self.handed_in(s.jss1_child)
        self.as_user(self.other.admin, self.other)

        self.assertEqual(self.roster(self.fractions).status_code, status.HTTP_404_NOT_FOUND)
        rows = self.get(f"?student={s.jss1_child.id}").data
        self.assertEqual(rows, [])

    @patch("assignment.storage.delete_attachment")
    def test_deleting_an_assignment_removes_hand_in_files(self, delete):
        s = self.school
        work = self.handed_in(s.jss1_child)
        work.attachment_public_id = "assignments/1/submissions/s.pdf"
        work.save()
        self.as_user(s.maths_teacher.user)

        self.client.delete(f"{URL}{self.fractions.id}/", HTTP_X_TENANT_SLUG=self.slug)

        delete.assert_any_call("assignments/1/submissions/s.pdf")
        self.assertFalse(AssignmentSubmission.objects.exists())


def run_inline(task, **kwargs):
    """dispatch_task, minus the background thread, so tests see what it sent."""
    return task(**kwargs)


@patch("assignment.views.dispatch_task", side_effect=run_inline)
@patch("assignment.tasks.channels.send", return_value=SendResult.success("brevo"))
class MarkedNotificationTest(APITestCase):
    """Parents get one email when their child's work is marked, not on every edit."""

    def setUp(self):
        self.school = School("notify-school")
        self.other = School("notify-other")
        s = self.school
        self.fractions = s.assignment(s.jss1, s.maths_teacher, s.maths, title="Fractions")
        self.work = AssignmentSubmission.objects.create(
            tenant=s.tenant, assignment=self.fractions, student=s.jss1_child, text="1/2")
        self.client.force_authenticate(user=s.maths_teacher.user)

    def grade(self, grade="8/10", feedback="Good work"):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"{URL}{self.fractions.id}/grade/",
                {"submission": self.work.id, "grade": grade, "feedback": feedback},
                format="json", HTTP_X_TENANT_SLUG=self.school.slug)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response

    def test_each_parent_is_emailed_the_mark(self, send, _dispatch):
        s = self.school
        dad = s.parent("ada_dad", s.jss1_child)

        self.grade("8/10", "Check question 3")

        self.assertEqual(sorted(c.kwargs["destination"] for c in send.call_args_list),
                         sorted([s.jss1_parent.user.email, dad.user.email]))
        email = send.call_args.kwargs
        self.assertEqual(email["channel"], "email")
        self.assertEqual(email["tenant"], s.tenant)
        self.assertEqual(email["subject"], "Ada's Fractions has been marked")
        self.assertIn('"Fractions" (Mathematics) has been marked by Maths Test.', email["body"])
        self.assertIn("Grade: 8/10", email["body"])
        self.assertIn("Feedback: Check question 3", email["body"])

    def test_changing_a_mark_sends_nothing_more(self, send, _dispatch):
        self.grade("7/10")
        send.reset_mock()

        self.grade("8/10")

        send.assert_not_called()

    def test_handing_back_sends_nothing_but_marking_again_does(self, send, _dispatch):
        self.grade()
        send.reset_mock()

        self.grade("", "")
        send.assert_not_called()

        self.grade("9/10")
        send.assert_called_once()

    def test_only_this_childs_parents_with_an_email_are_sent_to(self, send, _dispatch):
        # Bayo's dad (s.jss2_parent) is a parent here too, of another child.
        s = self.school
        no_email = s.parent("ada_aunt", s.jss1_child)
        no_email.user.email = ""
        no_email.user.save()

        self.grade()

        self.assertEqual([c.kwargs["destination"] for c in send.call_args_list],
                         [s.jss1_parent.user.email])

    def test_another_schools_parent_link_is_ignored(self, send, _dispatch):
        s = self.school
        # A stray link from another school's parent to this child.
        ParentStudentRelationship.objects.create(
            tenant=self.other.tenant, parent=self.other.jss1_parent, student=s.jss1_child,
            relationship="Father")

        self.grade()

        self.assertEqual([c.kwargs["destination"] for c in send.call_args_list],
                         [s.jss1_parent.user.email])

    def test_a_failed_send_does_not_fail_the_mark(self, send, _dispatch):
        send.return_value = SendResult.failure("brevo", "Brevo returned 500")

        response = self.grade()

        self.assertTrue(response.data["is_graded"])

    def test_work_handed_back_before_the_email_goes_sends_nothing(self, send, _dispatch):
        from .tasks import notify_parents_of_mark

        self.assertEqual(notify_parents_of_mark(self.work.id), 0)  # never marked
        send.assert_not_called()


@patch("assignment.digest.channels.send", return_value=SendResult.success("brevo"))
class NewAssignmentDigestTest(APITestCase):
    """One email per parent per run, listing the new work for all their children."""

    def setUp(self):
        self.school = School("digest-school")
        s = self.school
        self.fractions = s.assignment(s.jss1, s.maths_teacher, s.maths, due_in_days=3, title="Fractions")
        self.essay = s.assignment(s.jss1, s.english_teacher, s.english, due_in_days=5, title="Essay")

    def sent_to(self, send):
        return sorted(c.kwargs["destination"] for c in send.call_args_list)

    def test_each_parent_gets_one_email_listing_the_new_work(self, send):
        s = self.school

        summary = send_new_assignment_digests()

        self.assertEqual(self.sent_to(send), [s.jss1_parent.user.email])  # not JSS 2's parent
        email = send.call_args.kwargs
        self.assertEqual(email["tenant"], s.tenant)
        self.assertEqual(email["subject"], "New assignments for Ada")
        self.assertIn("Ada Test (JSS 1)", email["body"])
        self.assertIn("- Mathematics: Fractions, due", email["body"])
        self.assertIn("- English: Essay, due", email["body"])
        self.assertEqual((summary["assignments"], summary["sent"]), (2, 1))

    def test_work_is_announced_once(self, send):
        send_new_assignment_digests()
        send.reset_mock()

        summary = send_new_assignment_digests()

        send.assert_not_called()
        self.assertEqual(summary["assignments"], 0)
        self.assertFalse(Assignment.objects.filter(parents_notified_at__isnull=True).exists())

    def test_a_parent_of_two_children_gets_one_email_for_both(self, send):
        s = self.school
        ParentStudentRelationship.objects.create(
            tenant=s.tenant, parent=s.jss1_parent, student=s.jss2_child, relationship="Mother")
        s.assignment(s.jss2, s.jss2_teacher, s.maths, title="Algebra")

        send_new_assignment_digests()

        mum = [c.kwargs for c in send.call_args_list if c.kwargs["destination"] == s.jss1_parent.user.email]
        self.assertEqual(len(mum), 1)
        self.assertEqual(mum[0]["subject"], "New assignments for Ada and Bayo")
        self.assertIn("Bayo Test (JSS 2)", mum[0]["body"])
        self.assertIn("Algebra", mum[0]["body"])

    def test_work_already_past_due_is_not_announced(self, send):
        Assignment.objects.all().delete()
        s = self.school
        late = s.assignment(s.jss1, s.maths_teacher, s.maths, due_in_days=-1, title="Old")

        send_new_assignment_digests()

        send.assert_not_called()
        late.refresh_from_db()
        self.assertIsNotNone(late.parents_notified_at)  # and not tried again tomorrow

    def test_each_school_emails_its_own_parents(self, send):
        other = School("digest-other")
        other.assignment(other.jss1, other.maths_teacher, other.maths, title="Theirs")

        send_new_assignment_digests()

        by_parent = {c.kwargs["destination"]: c.kwargs for c in send.call_args_list}
        theirs = by_parent[other.jss1_parent.user.email]
        self.assertEqual(theirs["tenant"], other.tenant)
        self.assertIn("Theirs", theirs["body"])
        self.assertNotIn("Fractions", theirs["body"])
        self.assertNotIn("Theirs", by_parent[self.school.jss1_parent.user.email]["body"])

    def test_dry_run_sends_and_marks_nothing(self, send):
        summary = send_new_assignment_digests(dry_run=True)

        send.assert_not_called()
        self.assertEqual((summary["assignments"], summary["parents"]), (2, 1))
        self.assertEqual(Assignment.objects.filter(parents_notified_at__isnull=True).count(), 2)

    def test_one_failed_email_does_not_stop_the_rest(self, send):
        s = self.school
        s.parent("ada_dad", s.jss1_child)
        send.side_effect = [SendResult.failure("brevo", "Brevo returned 500"), SendResult.success("brevo")]

        summary = send_new_assignment_digests()

        self.assertEqual(len(self.sent_to(send)), 2)
        self.assertEqual((summary["sent"], summary["failed"]), (1, 1))

    def test_a_single_assignment_reads_in_the_singular(self, send):
        self.essay.delete()

        send_new_assignment_digests()

        email = send.call_args.kwargs
        self.assertEqual(email["subject"], "New assignment for Ada")
        self.assertIn("A new assignment has been set:", email["body"])

    def test_new_work_from_the_api_waits_for_the_digest(self, send):
        s = self.school
        self.client.force_authenticate(user=s.maths_teacher.user)

        response = self.client.post(URL, {
            "classroom": s.jss1.id, "subject": s.maths.id, "title": "Decimals",
            "due_date": str(timezone.localdate() + timedelta(days=2)),
        }, format="json", HTTP_X_TENANT_SLUG=s.slug)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        send.assert_not_called()  # nothing goes out when the work is set
        self.assertIsNone(Assignment.objects.get(title="Decimals").parents_notified_at)
