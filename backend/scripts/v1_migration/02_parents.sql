-- ============================================================
-- PARENTS export.  UPLOAD THIS FIRST - students depend on it.
-- Headers match the v2 parent template exactly (parent/bulk_view.py:279).
-- Phones normalised via pg_temp.norm_phone (see 00_common.sql).
-- Deduped by phone, because v2 keys ParentProfile on (tenant, phone).
--
-- Produces:
--   parents_ready.csv   -> upload as-is
--   parents_review.csv  -> missing gender/address/name/phone; fix, then upload
-- ============================================================

\set ON_ERROR_STOP on
\i 00_common.sql

DROP VIEW IF EXISTS v_parent_src CASCADE;
CREATE TEMP VIEW v_parent_src AS
WITH profile_parents AS (
  SELECT DISTINCT ON (pp.id)
    pp.id                                        AS src_id,
    u.last_name, u.first_name,
    NULLIF(u.email,'')                           AS email,
    coalesce(NULLIF(pp.phone,''), NULLIF(u.phone,''),
             NULLIF(u.phone_number,''), '')      AS raw_phone,
    pg_temp.norm_phone(coalesce(NULLIF(pp.phone,''), NULLIF(u.phone,''),
                                NULLIF(u.phone_number,''), '')) AS phone,
    NULLIF(pp.address,'')                        AS address,
    r.relationship
  FROM parent_parentprofile pp
  JOIN users_customuser u ON u.id = pp.user_id
  LEFT JOIN parent_parentstudentrelationship r ON r.parent_id = pp.id
  ORDER BY pp.id, r.is_primary_contact DESC NULLS LAST, r.id
),
-- Students whose parent_contact resolves to nobody: v2 rejects those students
-- unless a parent exists at that number, so synthesise a stub parent.
orphan_parents AS (
  SELECT DISTINCT ON (phone)
    NULL::int AS src_id, last_name, first_name, NULL::text AS email,
    raw_phone, phone, address, NULL::text AS relationship
  FROM (
    SELECT s.parent_contact                        AS raw_phone,
           pg_temp.norm_phone(s.parent_contact)    AS phone,
           u.last_name, ''::text AS first_name, NULLIF(s.address,'') AS address
    FROM students_student s
    JOIN users_customuser u ON u.id = s.user_id
    WHERE pg_temp.norm_phone(s.parent_contact) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM parent_parentstudentrelationship r
        JOIN parent_parentprofile pp2 ON pp2.id = r.parent_id
        WHERE r.student_id = s.id
          AND pg_temp.norm_phone(pp2.phone) = pg_temp.norm_phone(s.parent_contact))
  ) o
  ORDER BY phone
),
combined AS (
  SELECT * FROM profile_parents UNION ALL SELECT * FROM orphan_parents
)
-- Dedupe on the normalised phone, but never collapse the unusable-phone rows
-- into each other - they are different people who each need a real number.
SELECT DISTINCT ON (
  CASE WHEN phone <> '' THEN phone
       ELSE 'INVALID:' || coalesce(src_id::text, raw_phone) END)
  coalesce(last_name,'')  AS last_name,
  coalesce(first_name,'') AS first_name,
  email,
  phone,
  raw_phone,
  address,
  CASE WHEN relationship IN ('Father','Mother','Guardian','Sponsor')
       THEN relationship ELSE 'Guardian' END AS role,
  CASE relationship WHEN 'Father' THEN 'M' WHEN 'Mother' THEN 'F' ELSE '' END AS gender,
  (src_id IS NULL) AS is_stub,
  -- how many children hang off this parent - tells you what a broken row costs
  coalesce((SELECT count(*) FROM parent_parentstudentrelationship r
             WHERE r.parent_id = combined.src_id), 0) AS children
FROM combined
ORDER BY
  CASE WHEN phone <> '' THEN phone
       ELSE 'INVALID:' || coalesce(src_id::text, raw_phone) END,
  src_id NULLS LAST;

DROP VIEW IF EXISTS v_parent_out CASCADE;
CREATE TEMP VIEW v_parent_out AS
SELECT
  last_name              AS "Last Name*",
  first_name             AS "First Name*",
  gender                 AS "Gender*",
  phone                  AS "Phone Number*",
  coalesce(email,'')     AS "Email",
  coalesce(address,'')   AS "Address*",
  role                   AS "Parent/Guardian Role*",
  concat_ws('; ',
    CASE WHEN phone = '' THEN 'UNUSABLE PHONE "' || raw_phone || '" ('
      || length(regexp_replace(raw_phone,'[^0-9]','','g')) || ' digits, need 11)'
      || CASE WHEN children > 0 THEN ' - blocks ' || children || ' student(s)' ELSE '' END END,
    CASE WHEN gender = ''     THEN 'FILL GENDER (M/F)' END,
    CASE WHEN address IS NULL THEN 'FILL ADDRESS' END,
    CASE WHEN first_name = '' THEN 'FILL FIRST NAME' END,
    CASE WHEN last_name = ''  THEN 'FILL LAST NAME' END,
    CASE WHEN is_stub         THEN 'STUB built from student.parent_contact - verify identity' END
  ) AS problems
FROM v_parent_src;

\copy (SELECT "Last Name*","First Name*","Gender*","Phone Number*","Email","Address*","Parent/Guardian Role*" FROM v_parent_out WHERE problems = '' ORDER BY 1,2) TO 'parents_ready.csv' CSV HEADER

\copy (SELECT "Last Name*","First Name*","Gender*","Phone Number*","Email","Address*","Parent/Guardian Role*", problems AS "NEEDS FIXING (delete this column before upload)" FROM v_parent_out WHERE problems <> '' ORDER BY problems, "Last Name*") TO 'parents_review.csv' CSV HEADER

\echo 'Wrote parents_ready.csv and parents_review.csv'
