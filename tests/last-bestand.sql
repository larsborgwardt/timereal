\set ON_ERROR_STOP on
-- Inhaltssignaturen, keine Zugangswerte oder Klartext-Buchungen im Prüfprotokoll.
SELECT 'konto',count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM konto t;
SELECT 'kunde',count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY konto_id,id)) FROM kunde t;
SELECT 'ziel',count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY konto_id,id)) FROM buchungsziel t;
SELECT konto_id,count(*),md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM zeitabschnitt t GROUP BY konto_id ORDER BY konto_id;
