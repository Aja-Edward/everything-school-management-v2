-- ============================================================
-- STUDENTS export.  UPLOAD ONLY AFTER parents AND classrooms exist in v2.
-- Headers match the v2 student template (students/bulk_views.py:294).
--
-- "Parent Contact*" is the join key v2 uses (_resolve_parent,
-- students/tasks.py:142) - it must match an existing ParentProfile.phone.
-- A student is also held back when their PARENT is still in parents_review,
-- because v2 would reject the row anyway.
--
-- Produces:
--   students_ready.csv   -> every enforced field present, parent will exist
--   students_review.csv  -> blocked; the last column says why
-- ============================================================

\set ON_ERROR_STOP on
\i 00_common.sql

DROP VIEW IF EXISTS v_student_src CASCADE;
CREATE TEMP VIEW v_student_src AS
SELECT
  coalesce(s.registration_number,'')                        AS reg_no,
  u.last_name, u.first_name, coalesce(u.middle_name,'')     AS middle_name,
  s.gender,
  to_char(s.date_of_birth,'YYYY-MM-DD')                     AS dob,
  coalesce(s.place_of_birth,'')                             AS place_of_birth,
  coalesce(s.blood_group,'')                                AS blood_group,
  -- v1 class enum -> readable name.
  trim(CASE s.student_class
    WHEN 'PRE_NURSERY' THEN 'Pre-Nursery' WHEN 'NURSERY_1' THEN 'Nursery 1'
    WHEN 'NURSERY_2'   THEN 'Nursery 2'
    WHEN 'PRIMARY_1' THEN 'Primary 1' WHEN 'PRIMARY_2' THEN 'Primary 2'
    WHEN 'PRIMARY_3' THEN 'Primary 3' WHEN 'PRIMARY_4' THEN 'Primary 4'
    WHEN 'PRIMARY_5' THEN 'Primary 5' WHEN 'PRIMARY_6' THEN 'Primary 6'
    WHEN 'JSS_1' THEN 'JSS 1' WHEN 'JSS_2' THEN 'JSS 2' WHEN 'JSS_3' THEN 'JSS 3'
    WHEN 'SS_1'  THEN 'SS 1'  WHEN 'SS_2'  THEN 'SS 2'  WHEN 'SS_3'  THEN 'SS 3'
    ELSE s.student_class END)                               AS class_name,
  coalesce(NULLIF(s.classroom,''),'')                       AS v1_classroom,
  coalesce(st.name,'')                                      AS stream_name,
  to_char(s.admission_date,'YYYY')                          AS year_admitted,
  to_char(s.admission_date,'YYYY-MM-DD')                    AS admission_date,
  CASE WHEN s.is_active THEN 'TRUE' ELSE 'FALSE' END        AS is_active,
  -- v2 requires an address but 272 of 355 v1 students have none. The parent's
  -- address rescues 270 of them; only 2 are left genuinely blank.
  coalesce(NULLIF(s.address,''), NULLIF(p.p_address,''), '') AS address,
  coalesce(s.phone_number,'')                               AS phone_number,
  -- Parent phone: prefer the linked ParentProfile, fall back to parent_contact.
  coalesce(NULLIF(p.p_phone,''),
           pg_temp.norm_phone(s.parent_contact), '')        AS parent_phone,
  pg_temp.norm_phone(s.emergency_contact)                   AS emergency_contact,
  coalesce(p.p_name,'')                                     AS parent_name,
  coalesce(p.p_role,'')                                     AS parent_role,
  -- Will this parent actually make it into parents_ready.csv?
  coalesce(p.p_upload_ready, false)                         AS parent_upload_ready,
  coalesce(s.medical_conditions,'')                         AS medical_conditions,
  coalesce(s.special_requirements,'')                       AS special_requirements,
  coalesce(s.profile_picture, u.profile_picture, '')        AS picture,
  coalesce(NULLIF(u.email,''),'')                           AS email,
  (s.education_level = 'SENIOR_SECONDARY')                  AS is_senior
FROM students_student s
JOIN users_customuser u ON u.id = s.user_id
LEFT JOIN classroom_stream st ON st.id = s.stream_id
LEFT JOIN LATERAL (
  -- the primary parent for this student, plus whether that parent is clean
  SELECT
    pg_temp.norm_phone(coalesce(NULLIF(pp.phone,''), NULLIF(pu.phone,''),
                                NULLIF(pu.phone_number,''), ''))  AS p_phone,
    trim(pu.first_name || ' ' || pu.last_name)                    AS p_name,
    r.relationship                                                AS p_role,
    pp.address                                                    AS p_address,
    (   pg_temp.norm_phone(coalesce(NULLIF(pp.phone,''), NULLIF(pu.phone,''),
                                    NULLIF(pu.phone_number,''), '')) <> ''
    AND NULLIF(pp.address,'') IS NOT NULL
    AND pu.first_name <> '' AND pu.last_name <> ''
    -- gender is only auto-derivable from the parent's PRIMARY relationship
    AND (SELECT r2.relationship FROM parent_parentstudentrelationship r2
          WHERE r2.parent_id = pp.id
          ORDER BY r2.is_primary_contact DESC, r2.id LIMIT 1) IN ('Father','Mother')
    ) AS p_upload_ready
  FROM parent_parentstudentrelationship r
  JOIN parent_parentprofile pp ON pp.id = r.parent_id
  JOIN users_customuser pu     ON pu.id = pp.user_id
  WHERE r.student_id = s.id
  ORDER BY r.is_primary_contact DESC, r.id
  LIMIT 1
) p ON TRUE;

DROP VIEW IF EXISTS v_student_out CASCADE;
CREATE TEMP VIEW v_student_out AS
SELECT
  reg_no                                  AS "Registration Number",
  last_name                               AS "Surname*",
  first_name                              AS "First Name*",
  middle_name                             AS "Middle Name",
  gender                                  AS "Gender*",
  dob                                     AS "Date of Birth*",
  place_of_birth                          AS "Place of Birth*",
  blood_group                             AS "Blood Group",
  -- EDIT THIS COLUMN to match the classroom names you create in v2.
  -- v2 wants "Class Name - Section", e.g. "Primary 1 - Gold".
  class_name                              AS "Classroom*",
  stream_name                             AS "Stream",
  year_admitted                           AS "Year Admitted*",
  admission_date                          AS "Admission Date*",
  is_active                               AS "Is Active",
  address                                 AS "Address*",
  phone_number                            AS "Phone Number",
  parent_phone                            AS "Parent Contact*",
  emergency_contact                       AS "Emergency Contact*",
  parent_name                             AS "Parent/Guardian Name*",
  CASE WHEN parent_role IN ('Father','Mother','Guardian','Sponsor')
       THEN parent_role ELSE '' END       AS "Parent/Guardian Role*",
  medical_conditions                      AS "Medical Conditions",
  special_requirements                    AS "Special Requirements",
  picture                                 AS "Profile Picture URL",
  email                                   AS "Email",
  v1_classroom                            AS "V1 classroom (reference only - v2 ignores this)",
  concat_ws('; ',
    CASE WHEN last_name = '' OR first_name = '' THEN 'MISSING NAME' END,
    CASE WHEN gender NOT IN ('M','F')           THEN 'MISSING GENDER' END,
    CASE WHEN dob IS NULL                       THEN 'MISSING DOB' END,
    CASE WHEN address = ''                      THEN 'MISSING ADDRESS' END,
    CASE WHEN parent_phone = ''                 THEN 'NO USABLE PARENT PHONE' END,
    CASE WHEN parent_phone <> '' AND NOT parent_upload_ready
                                                THEN 'PARENT IS IN parents_review - fix that row first' END,
    CASE WHEN parent_name = ''                  THEN 'MISSING PARENT NAME' END,
    CASE WHEN parent_role NOT IN ('Father','Mother','Guardian','Sponsor')
                                                THEN 'MISSING PARENT ROLE' END,
    CASE WHEN admission_date IS NULL            THEN 'MISSING ADMISSION DATE' END,
    CASE WHEN is_senior AND stream_name = ''    THEN 'SENIOR STUDENT NEEDS A STREAM' END
  )                                       AS problems
FROM v_student_src;

\copy (SELECT "Registration Number","Surname*","First Name*","Middle Name","Gender*","Date of Birth*","Place of Birth*","Blood Group","Classroom*","Stream","Year Admitted*","Admission Date*","Is Active","Address*","Phone Number","Parent Contact*","Emergency Contact*","Parent/Guardian Name*","Parent/Guardian Role*","Medical Conditions","Special Requirements","Profile Picture URL","Email","V1 classroom (reference only - v2 ignores this)" FROM v_student_out WHERE problems = '' ORDER BY "Classroom*","Surname*") TO 'students_ready.csv' CSV HEADER

\copy (SELECT "Registration Number","Surname*","First Name*","Middle Name","Gender*","Date of Birth*","Place of Birth*","Blood Group","Classroom*","Stream","Year Admitted*","Admission Date*","Is Active","Address*","Phone Number","Parent Contact*","Emergency Contact*","Parent/Guardian Name*","Parent/Guardian Role*","Medical Conditions","Special Requirements","Profile Picture URL","Email", problems AS "NEEDS FIXING (delete this column before upload)" FROM v_student_out WHERE problems <> '' ORDER BY problems, "Surname*") TO 'students_review.csv' CSV HEADER

\echo 'Wrote students_ready.csv and students_review.csv'
