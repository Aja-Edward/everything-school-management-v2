-- ============================================================
-- Shared phone normaliser. Sourced by 02/03/04 via \i 00_common.sql
--
-- Returns a canonical 0XXXXXXXXXX, or '' when the number cannot be
-- trusted. Returning '' is deliberate: a truncated 10-digit number like
-- '0806980045' must NOT be silently turned into '00806980045', which looks
-- valid but reaches nobody. Those rows belong in the review file so a human
-- can supply the missing digit.
--
-- Verified against the live v1 data: 188 parent phones are a clean 11 digits,
-- 12 are not, and NONE use a 234/+234 country prefix.
-- NOTE: Neon's -pooler endpoint reuses backend connections, so TEMP objects
-- can survive between psql runs. The scripts DROP their views first, but the
-- direct (non-pooler) endpoint is cleaner for this kind of one-off export.
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.norm_phone(raw text) RETURNS text AS $fn$
  SELECT CASE
    -- already canonical: 0 + 10 digits
    WHEN length(d) = 11 AND left(d,1) = '0'    THEN d
    -- leading zero was stripped somewhere: 8034988839 -> 08034988839
    WHEN length(d) = 10 AND left(d,1) <> '0'   THEN '0' || d
    -- country code form: 2348034988839 / +2348034988839
    WHEN length(d) >= 13 AND left(d,3) = '234' THEN '0' || right(d,10)
    -- anything else (blank, 9, 10-with-leading-0, 12) is untrustworthy
    ELSE ''
  END
  FROM (SELECT regexp_replace(coalesce(raw,''), '[^0-9]', '', 'g')) AS t(d);
$fn$ LANGUAGE sql IMMUTABLE;
