\set ON_ERROR_STOP on
-- Inhaltssignaturen, keine Zugangswerte oder Klartext-Buchungen im Prüfprotokoll.
SELECT 'konto',count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM timereal_last_konto_v05 t;
SELECT 'kunde',count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY konto_id,id)) FROM timereal_last_kunde_v05 t;
SELECT 'ziel',count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY konto_id,id)) FROM timereal_last_ziel_v05 t;
SELECT konto_id,count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM timereal_last_zeit_v05 t GROUP BY konto_id ORDER BY konto_id;
