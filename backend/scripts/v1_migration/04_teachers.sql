-- ============================================================
-- TEACHERS export.  Independent of parents/students - upload any time.
-- Headers match the v2 teacher template (teacher/bulk_views.py:292).
-- Enforced fields (teacher/tasks.py:53): employee_id, staff_type, first_name,
-- last_name, email, phone_number, hire_date, qualification, specialization.
--
-- NOTE: v2 requires a unique, non-blank email. v1 CustomUser.email is NOT
-- unique, so duplicates land in the review file.
-- ============================================================

\set ON_ERROR_STOP on
\i 00_common.sql

DROP VIEW IF EXISTS v_teacher_out CASCADE;
CREATE TEMP VIEW v_teacher_out AS
WITH t AS (
  SELECT
    coalesce(t.employee_id,'')                                 AS employee_id,
    u.first_name, u.last_name,
    lower(coalesce(NULLIF(u.email,''),''))                     AS email,
    pg_temp.norm_phone(coalesce(NULLIF(t.phone_number,''),
                       NULLIF(u.phone,''), NULLIF(u.phone_number,''),''))  AS phone,
    CASE lower(coalesce(t.staff_type,'teaching'))
      WHEN 'non-teaching' THEN 'Non-Teaching' ELSE 'Teaching' END AS staff_type,
    coalesce(t.level,'')                                       AS level,
    coalesce(NULLIF(t.qualification,''),'')                    AS qualification,
    coalesce(NULLIF(t.specialization,''),'')                   AS specialization,
    to_char(t.date_of_birth,'YYYY-MM-DD')                      AS dob,
    to_char(t.hire_date,'YYYY-MM-DD')                          AS hire_date,
    coalesce(NULLIF(t.address,''),'')                          AS address,
    CASE WHEN t.is_active THEN 'TRUE' ELSE 'FALSE' END          AS is_active,
    coalesce(t.photo, u.profile_picture,'')                    AS photo,
    count(*) OVER (PARTITION BY lower(NULLIF(u.email,'')))      AS email_dupes
  FROM teacher_teacher t
  JOIN users_customuser u ON u.id = t.user_id
)
SELECT
  employee_id     AS "Employee ID*",
  first_name      AS "First Name*",
  last_name       AS "Last Name*",
  email           AS "Email*",
  phone           AS "Phone Number*",
  staff_type      AS "Staff Type*",
  level           AS "Level",
  qualification   AS "Qualification*",
  specialization  AS "Specialization*",
  coalesce(dob,'')      AS "Date of Birth",
  coalesce(hire_date,'') AS "Hire Date*",
  address         AS "Address",
  is_active       AS "Is Active",
  photo           AS "Profile Picture URL",
  concat_ws('; ',
    CASE WHEN employee_id = ''    THEN 'MISSING EMPLOYEE ID' END,
    CASE WHEN first_name = '' OR last_name = '' THEN 'MISSING NAME' END,
    CASE WHEN email = ''          THEN 'MISSING EMAIL' END,
    CASE WHEN email_dupes > 1     THEN 'DUPLICATE EMAIL - v2 needs unique' END,
    CASE WHEN phone = ''          THEN 'MISSING PHONE' END,
    CASE WHEN qualification = ''  THEN 'MISSING QUALIFICATION' END,
    CASE WHEN specialization = '' THEN 'MISSING SPECIALIZATION' END,
    CASE WHEN hire_date IS NULL   THEN 'MISSING HIRE DATE' END
  ) AS problems
FROM t;

\copy (SELECT "Employee ID*","First Name*","Last Name*","Email*","Phone Number*","Staff Type*","Level","Qualification*","Specialization*","Date of Birth","Hire Date*","Address","Is Active","Profile Picture URL" FROM v_teacher_out WHERE problems = '' ORDER BY "Last Name*") TO 'teachers_ready.csv' CSV HEADER

\copy (SELECT *, problems AS "NEEDS FIXING (delete this column before upload)" FROM v_teacher_out WHERE problems <> '' ORDER BY problems) TO 'teachers_review.csv' CSV HEADER

\echo 'Wrote teachers_ready.csv and teachers_review.csv'
