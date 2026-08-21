-- ============================================================
-- v1 -> v2 migration AUDIT.  Run this FIRST. Read-only.
-- Tells you the size of every data gap before you export anything.
-- ============================================================

\echo '--- 1. Headline counts by role ---'
SELECT role, count(*) AS total,
       count(*) FILTER (WHERE is_active) AS active
FROM users_customuser GROUP BY role ORDER BY total DESC;

\echo '--- 2. Profile row counts ---'
SELECT 'students' AS kind, count(*) FROM students_student
UNION ALL SELECT 'parents',  count(*) FROM parent_parentprofile
UNION ALL SELECT 'teachers', count(*) FROM teacher_teacher
UNION ALL SELECT 'parent<->student links', count(*) FROM parent_parentstudentrelationship;

\echo '--- 3. THE BIG ONE: students with no usable parent phone ---'
-- These students CANNOT be uploaded to v2 until a parent exists for them.
SELECT
  count(*) FILTER (WHERE link_phone IS NOT NULL)               AS ok_via_relationship,
  count(*) FILTER (WHERE link_phone IS NULL AND own_phone IS NOT NULL) AS ok_via_parent_contact_only,
  count(*) FILTER (WHERE link_phone IS NULL AND own_phone IS NULL)     AS NO_PARENT_PHONE_AT_ALL
FROM (
  SELECT s.id,
    (SELECT '0' || right(regexp_replace(coalesce(pp.phone,''),'[^0-9]','','g'),10)
       FROM parent_parentstudentrelationship r
       JOIN parent_parentprofile pp ON pp.id = r.parent_id
      WHERE r.student_id = s.id
        AND length(regexp_replace(coalesce(pp.phone,''),'[^0-9]','','g')) >= 10
      ORDER BY r.is_primary_contact DESC, r.id LIMIT 1) AS link_phone,
    CASE WHEN length(regexp_replace(coalesce(s.parent_contact,''),'[^0-9]','','g')) >= 10
         THEN '0' || right(regexp_replace(s.parent_contact,'[^0-9]','','g'),10) END AS own_phone
  FROM students_student s
) t;

\echo '--- 4. Parents with an unusable / missing phone (blocks the parent row) ---'
SELECT count(*) AS parents_without_valid_phone
FROM parent_parentprofile pp JOIN users_customuser u ON u.id = pp.user_id
WHERE length(regexp_replace(
        coalesce(NULLIF(pp.phone,''), NULLIF(u.phone,''), NULLIF(u.phone_number,''), '')
      ,'[^0-9]','','g')) < 10;

\echo '--- 5. Duplicate phones across parents (v2 keys parents BY PHONE - these collapse into one) ---'
SELECT '0' || right(regexp_replace(coalesce(pp.phone,''),'[^0-9]','','g'),10) AS norm_phone,
       count(*) AS parent_rows,
       string_agg(u.first_name || ' ' || u.last_name, ' | ') AS names
FROM parent_parentprofile pp JOIN users_customuser u ON u.id = pp.user_id
WHERE length(regexp_replace(coalesce(pp.phone,''),'[^0-9]','','g')) >= 10
GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;

\echo '--- 6. Parent gender derivability (v2 REQUIRES gender; v1 has no such column) ---'
SELECT coalesce(r.relationship,'(no relationship row)') AS relationship,
       count(DISTINCT pp.id) AS parents,
       CASE WHEN r.relationship IN ('Father','Mother') THEN 'auto' ELSE 'MANUAL FILL NEEDED' END AS gender_source
FROM parent_parentprofile pp
LEFT JOIN parent_parentstudentrelationship r ON r.parent_id = pp.id
GROUP BY 1, 3 ORDER BY 2 DESC;

\echo '--- 7. Student required-field blanks (v2 rejects the row) ---'
SELECT
  count(*) FILTER (WHERE u.first_name IS NULL OR u.first_name = '') AS blank_first_name,
  count(*) FILTER (WHERE u.last_name  IS NULL OR u.last_name  = '') AS blank_last_name,
  count(*) FILTER (WHERE s.gender IS NULL OR s.gender = '')         AS blank_gender,
  count(*) FILTER (WHERE s.date_of_birth IS NULL)                   AS blank_dob,
  count(*) FILTER (WHERE s.address IS NULL OR s.address = '')       AS blank_address,
  count(*) FILTER (WHERE s.admission_date IS NULL)                  AS blank_admission_date
FROM students_student s JOIN users_customuser u ON u.id = s.user_id;

\echo '--- 8. Distinct v1 classes/classrooms -> build these in v2 BEFORE uploading students ---'
SELECT s.student_class, coalesce(NULLIF(s.classroom,''),'(none)') AS v1_classroom, count(*) AS students
FROM students_student s GROUP BY 1,2 ORDER BY 1,2;

\echo '--- 9. Teacher blockers (email must be unique + non-blank in v2) ---'
SELECT
  count(*) FILTER (WHERE u.email IS NULL OR u.email = '')            AS blank_email,
  count(*) FILTER (WHERE t.employee_id IS NULL OR t.employee_id='')  AS blank_employee_id,
  count(*) FILTER (WHERE t.qualification = '' OR t.qualification IS NULL)   AS blank_qualification,
  count(*) FILTER (WHERE t.specialization = '' OR t.specialization IS NULL) AS blank_specialization,
  count(*) FILTER (WHERE t.phone_number = '' OR t.phone_number IS NULL)     AS blank_phone
FROM teacher_teacher t JOIN users_customuser u ON u.id = t.user_id;

\echo '--- 9b. Duplicate teacher emails ---'
SELECT lower(u.email) AS email, count(*)
FROM teacher_teacher t JOIN users_customuser u ON u.id = t.user_id
WHERE u.email <> '' GROUP BY 1 HAVING count(*) > 1;
