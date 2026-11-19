BEGIN;
CREATE TABLE mfa_konto (
 konto_id bigint PRIMARY KEY REFERENCES konto,
 geheimnis text, letzterschritt bigint NOT NULL DEFAULT -1,
 einrichtung uuid, vorbereitet text, vorbereitet_bis timestamptz,
 revision bigint NOT NULL DEFAULT 0,
 fehler integer NOT NULL DEFAULT 0, fenster timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mfa_pruefung (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 konto_id bigint NOT NULL REFERENCES konto, revision bigint NOT NULL,
 erstellt timestamptz NOT NULL DEFAULT clock_timestamp(), ablauf timestamptz NOT NULL
);
CREATE INDEX mfa_pruefung_konto ON mfa_pruefung(konto_id);
CREATE TABLE mfa_code (
 konto_id bigint NOT NULL REFERENCES konto, hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(konto_id,hash)
);
REVOKE ALL ON mfa_konto,mfa_pruefung,mfa_code FROM PUBLIC,timereal_app;
INSERT INTO audit_art VALUES
 ('mfa_eingerichtet','Zwei-Faktor-Einrichtung begonnen'),('mfa_aktiviert','Zwei-Faktor-Anmeldung eingeschaltet'),
 ('mfa_deaktiviert','Zwei-Faktor-Anmeldung ausgeschaltet'),('mfa_codes','Wiederherstellungscodes erneuert'),
 ('mfa_wiederherstellung','Wiederherstellungscode verwendet'),('mfa_fehlgeschlagen','Zweiter Nachweis fehlgeschlagen');

-- Konto ist die gemeinsame Sperrreihenfolge mit bindSession, Rollen und Passwortwechsel.
CREATE FUNCTION mfa_sperren(k bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.konto WHERE id=k AND aktiv FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.mfa_konto(konto_id) VALUES(k) ON CONFLICT DO NOTHING;
 UPDATE public.mfa_konto SET fehler=0,fenster=clock_timestamp() WHERE konto_id=k AND fenster<=clock_timestamp()-interval '10 minutes';
 RETURN true;
END; $$;
CREATE FUNCTION mfa_ereignis(art text,k bigint) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.audit_speichern(art,k,(SELECT login_referenz FROM public.konto WHERE id=k))
$$;
CREATE FUNCTION mfa_fehlversuch(k bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.mfa_konto SET fehler=least(fehler+1,10) WHERE konto_id=k;
 PERFORM public.mfa_ereignis('mfa_fehlgeschlagen',k);
END; $$;
CREATE FUNCTION mfa_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); BEGIN
 IF NOT public.mfa_sperren(k) THEN RETURN NULL; END IF;
 RETURN (SELECT jsonb_build_object('aktiv',geheimnis IS NOT NULL,'codes',(SELECT count(*) FROM public.mfa_code WHERE konto_id=k)) FROM public.mfa_konto WHERE konto_id=k);
END; $$;
CREATE FUNCTION mfa_eigenes(p_id uuid) RETURNS TABLE(konto_id bigint,geheimnis text,jetzt double precision,gesperrt boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); BEGIN
 IF NOT public.mfa_sperren(k) THEN RETURN; END IF;
 RETURN QUERY SELECT k,CASE WHEN p_id IS NULL THEN m.geheimnis ELSE m.vorbereitet END,
  extract(epoch FROM clock_timestamp())::double precision*1000,m.fehler>=10
 FROM public.mfa_konto m WHERE m.konto_id=k AND
 (p_id IS NULL OR (m.geheimnis IS NULL AND m.einrichtung=p_id AND m.vorbereitet_bis>clock_timestamp()));
END; $$;
CREATE FUNCTION mfa_passwort_fehler() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF public.mfa_sperren(public.aktuelles_konto()) THEN PERFORM public.mfa_fehlversuch(public.aktuelles_konto()); END IF; END; $$;
CREATE FUNCTION mfa_vorbereiten(p_id uuid,p_geheimnis text,p_passwort text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); BEGIN
 IF NOT public.mfa_sperren(k) OR NOT EXISTS(SELECT FROM public.konto WHERE id=k AND passwort_hash=p_passwort) THEN RETURN false; END IF;
 UPDATE public.mfa_konto SET einrichtung=p_id,vorbereitet=p_geheimnis,vorbereitet_bis=clock_timestamp()+interval '10 minutes'
 WHERE konto_id=k AND geheimnis IS NULL AND fehler<10;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.mfa_ereignis('mfa_eingerichtet',k);
 RETURN true;
END; $$;
CREATE FUNCTION mfa_sitzung_ersetzen(k bigint,p_sitzung text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.sitzung SET widerrufen_am=clock_timestamp() WHERE konto_id=k AND widerrufen_am IS NULL;
 DELETE FROM public.mfa_pruefung WHERE konto_id=k;
 UPDATE public.mfa_konto SET revision=revision+1 WHERE konto_id=k;
 INSERT INTO public.sitzung(schluessel,konto_id,client,ablauf) VALUES(p_sitzung,k,'web',clock_timestamp()+interval '14 days');
END; $$;
CREATE FUNCTION mfa_codes_setzen(k bigint,p_codes text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF cardinality(p_codes)<>8 OR (SELECT count(DISTINCT c) FROM unnest(p_codes) c)<>8 THEN RAISE EXCEPTION 'Ungültige Codes' USING ERRCODE='23514'; END IF;
 DELETE FROM public.mfa_code WHERE konto_id=k;
 INSERT INTO public.mfa_code SELECT k,c FROM unnest(p_codes) c;
END; $$;
CREATE FUNCTION mfa_aktivieren(p_id uuid,p_schritt bigint,p_codes text[],p_sitzung text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); m public.mfa_konto; schritt bigint:=floor(extract(epoch FROM clock_timestamp())/30); BEGIN
 IF NOT public.mfa_sperren(k) THEN RETURN false; END IF;
 SELECT * INTO m FROM public.mfa_konto WHERE konto_id=k;
 IF m.geheimnis IS NOT NULL OR m.einrichtung IS DISTINCT FROM p_id OR m.vorbereitet_bis<=clock_timestamp() OR m.fehler>=10 THEN RETURN false; END IF;
 IF p_schritt IS NULL OR p_schritt NOT BETWEEN schritt-1 AND schritt THEN PERFORM public.mfa_fehlversuch(k); RETURN false; END IF;
 UPDATE public.mfa_konto SET geheimnis=vorbereitet,letzterschritt=p_schritt,einrichtung=NULL,vorbereitet=NULL,vorbereitet_bis=NULL,fehler=0 WHERE konto_id=k;
 PERFORM public.mfa_codes_setzen(k,p_codes);
 PERFORM public.mfa_sitzung_ersetzen(k,p_sitzung);
 PERFORM public.mfa_ereignis('mfa_aktiviert',k);
 RETURN true;
END; $$;
CREATE FUNCTION mfa_faktor_verbrauchen(k bigint,p_schritt bigint,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE m public.mfa_konto; schritt bigint:=floor(extract(epoch FROM clock_timestamp())/30); passt boolean:=false; BEGIN
 SELECT * INTO m FROM public.mfa_konto WHERE konto_id=k;
 IF m.geheimnis IS NULL OR m.fehler>=10 THEN RETURN false; END IF;
 IF p_schritt IS NOT NULL AND p_code IS NULL THEN
  passt:=p_schritt>m.letzterschritt AND p_schritt BETWEEN schritt-1 AND schritt;
  IF passt THEN UPDATE public.mfa_konto SET letzterschritt=p_schritt WHERE konto_id=k; END IF;
 ELSIF p_code IS NOT NULL AND p_schritt IS NULL THEN
  DELETE FROM public.mfa_code WHERE konto_id=k AND hash=p_code;
  passt:=FOUND;
  IF passt THEN PERFORM public.mfa_ereignis('mfa_wiederherstellung',k); END IF;
 END IF;
 IF NOT passt THEN PERFORM public.mfa_fehlversuch(k); RETURN false; END IF;
 UPDATE public.mfa_konto SET fehler=0,fenster=clock_timestamp() WHERE konto_id=k;
 RETURN true;
END; $$;
CREATE FUNCTION mfa_verwalten(p_aktion text,p_passwort text,p_schritt bigint,p_code text,p_codes text[],p_sitzung text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); BEGIN
 IF p_aktion NOT IN ('deaktivieren','codes') OR NOT public.mfa_sperren(k) OR NOT EXISTS(SELECT FROM public.konto WHERE id=k AND passwort_hash=p_passwort) THEN RETURN false; END IF;
 IF NOT public.mfa_faktor_verbrauchen(k,p_schritt,p_code) THEN RETURN false; END IF;
 IF p_aktion='deaktivieren' THEN
  UPDATE public.mfa_konto SET geheimnis=NULL,letzterschritt=-1,vorbereitet=NULL,einrichtung=NULL,vorbereitet_bis=NULL WHERE konto_id=k;
  DELETE FROM public.mfa_code WHERE konto_id=k;
 ELSE PERFORM public.mfa_codes_setzen(k,p_codes); END IF;
 PERFORM public.mfa_sitzung_ersetzen(k,p_sitzung);
 PERFORM public.mfa_ereignis(CASE WHEN p_aktion='codes' THEN 'mfa_codes' ELSE 'mfa_deaktiviert' END,k);
 RETURN true;
END; $$;

CREATE FUNCTION mfa_anmeldung_start(k bigint,p_passwort text,p_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE m public.mfa_konto; BEGIN
 IF NOT public.mfa_sperren(k) OR NOT EXISTS(SELECT FROM public.konto WHERE id=k AND passwort_hash=p_passwort) THEN RETURN NULL; END IF;
 SELECT * INTO m FROM public.mfa_konto WHERE konto_id=k;
 IF m.geheimnis IS NULL THEN RETURN 'passwort'; END IF;
 IF m.fehler>=10 THEN RETURN 'gesperrt'; END IF;
 DELETE FROM public.mfa_pruefung WHERE konto_id=k AND (ablauf<=clock_timestamp() OR revision<>m.revision);
 -- Höchstens fünf offene Prüfungen je Konto; neue Passwortprüfungen setzen kein Fehlversuchslimit zurück.
 DELETE FROM public.mfa_pruefung WHERE hash IN (SELECT hash FROM public.mfa_pruefung WHERE konto_id=k ORDER BY erstellt DESC,hash OFFSET 4);
 INSERT INTO public.mfa_pruefung(hash,konto_id,revision,ablauf) VALUES(p_hash,k,m.revision,clock_timestamp()+interval '5 minutes');
 RETURN 'mfa';
END; $$;
CREATE FUNCTION mfa_anmeldung_lesen(p_hash text) RETURNS TABLE(konto_id bigint,geheimnis text,jetzt double precision,gesperrt boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint; BEGIN
 SELECT p.konto_id INTO k FROM public.mfa_pruefung p WHERE hash=p_hash;
 IF NOT public.mfa_sperren(k) THEN RETURN; END IF;
 RETURN QUERY SELECT k,m.geheimnis,extract(epoch FROM clock_timestamp())::double precision*1000,m.fehler>=10
 FROM public.mfa_pruefung p JOIN public.mfa_konto m USING(konto_id)
 WHERE p.hash=p_hash AND p.ablauf>clock_timestamp() AND p.revision=m.revision AND m.geheimnis IS NOT NULL;
END; $$;
CREATE FUNCTION mfa_anmeldung_abschliessen(p_hash text,p_schritt bigint,p_code text,p_sitzung text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint; BEGIN
 SELECT konto_id INTO k FROM public.mfa_anmeldung_lesen(p_hash) WHERE NOT gesperrt;
 IF k IS NULL OR NOT public.mfa_faktor_verbrauchen(k,p_schritt,p_code) THEN RETURN false; END IF;
 DELETE FROM public.mfa_pruefung WHERE hash=p_hash;
 INSERT INTO public.sitzung(schluessel,konto_id,client,ablauf) VALUES(p_sitzung,k,'web',clock_timestamp()+interval '14 days');
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION sitzung_anlegen(k bigint,hash text,kanal text,erwartet text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.konto WHERE id=k AND aktiv AND passwort_hash IS NOT DISTINCT FROM erwartet FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM public.mfa_konto WHERE konto_id=k AND geheimnis IS NOT NULL) THEN RETURN false; END IF;
 INSERT INTO public.sitzung(schluessel,konto_id,client,ablauf) VALUES(hash,k,kanal,clock_timestamp()+interval '14 days');
 RETURN true;
END; $$;
CREATE FUNCTION mfa_konto_widerruf() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.passwort_hash IS DISTINCT FROM NEW.passwort_hash OR OLD.aktiv IS DISTINCT FROM NEW.aktiv OR OLD.rolle IS DISTINCT FROM NEW.rolle THEN
  UPDATE public.mfa_konto SET revision=revision+1,einrichtung=NULL,vorbereitet=NULL,vorbereitet_bis=NULL WHERE konto_id=NEW.id;
  DELETE FROM public.mfa_pruefung WHERE konto_id=NEW.id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mfa_konto_widerruf AFTER UPDATE OF passwort_hash,aktiv,ist_admin,ist_betrieb ON konto FOR EACH ROW EXECUTE FUNCTION mfa_konto_widerruf();
REVOKE ALL ON FUNCTION mfa_sperren(bigint),mfa_ereignis(text,bigint),mfa_fehlversuch(bigint),mfa_status(),mfa_eigenes(uuid),mfa_passwort_fehler(),mfa_vorbereiten(uuid,text,text),mfa_sitzung_ersetzen(bigint,text),mfa_codes_setzen(bigint,text[]),mfa_aktivieren(uuid,bigint,text[],text),mfa_faktor_verbrauchen(bigint,bigint,text),mfa_verwalten(text,text,bigint,text,text[],text),mfa_anmeldung_start(bigint,text,text),mfa_anmeldung_lesen(text),mfa_anmeldung_abschliessen(text,bigint,text,text),mfa_konto_widerruf() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mfa_status(),mfa_eigenes(uuid),mfa_passwort_fehler(),mfa_vorbereiten(uuid,text,text),mfa_aktivieren(uuid,bigint,text[],text),mfa_verwalten(text,text,bigint,text,text[],text),mfa_anmeldung_start(bigint,text,text),mfa_anmeldung_lesen(text),mfa_anmeldung_abschliessen(text,bigint,text,text) TO timereal_app;
CREATE FUNCTION mfa_einrichtung_abbrechen() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.mfa_sperren(public.aktuelles_konto()) THEN
  UPDATE public.mfa_konto SET einrichtung=NULL,vorbereitet=NULL,vorbereitet_bis=NULL WHERE konto_id=public.aktuelles_konto();
 END IF;
END; $$;
CREATE FUNCTION mfa_anmeldung_abbrechen(p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.konto k JOIN public.mfa_pruefung p ON p.konto_id=k.id WHERE p.hash=p_hash FOR UPDATE OF k;
 DELETE FROM public.mfa_pruefung WHERE hash=p_hash;
END; $$;
REVOKE ALL ON FUNCTION mfa_einrichtung_abbrechen(),mfa_anmeldung_abbrechen(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mfa_einrichtung_abbrechen(),mfa_anmeldung_abbrechen(text) TO timereal_app;
INSERT INTO timereal_migration VALUES(9);
COMMIT;
