BEGIN;
ALTER TABLE konto ADD COLUMN anzeigename text CHECK (length(anzeigename) BETWEEN 1 AND 120);
GRANT SELECT(anzeigename) ON konto TO timereal_app;
CREATE TABLE profil_email (
 konto_id bigint PRIMARY KEY REFERENCES konto,
 email text NOT NULL, hash text NOT NULL UNIQUE CHECK(hash ~ '^[a-f0-9]{64}$'),
 ablauf timestamptz NOT NULL
);
REVOKE ALL ON profil_email FROM PUBLIC,timereal_app;
CREATE FUNCTION profil_email_ausstehend() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT email FROM public.profil_email WHERE konto_id=public.aktuelles_konto() AND ablauf>clock_timestamp()
$$;
CREATE FUNCTION profil_vormerken(p_name text,p_email text,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); alt text; BEGIN
 SELECT email INTO alt FROM public.konto WHERE id=k AND aktiv FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_email IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_email,34)); END IF;
 IF EXISTS(SELECT FROM public.konto WHERE id<>k AND (email=p_email OR lower(login_referenz)=p_email)) THEN RETURN false; END IF;
 IF p_name IS NOT NULL THEN UPDATE public.konto SET anzeigename=nullif(trim(p_name),'') WHERE id=k; END IF;
 IF p_email IS NOT NULL THEN
 DELETE FROM public.profil_email WHERE konto_id=k;
 IF p_email IS DISTINCT FROM alt THEN
  INSERT INTO public.profil_email VALUES(k,p_email,p_hash,clock_timestamp()+interval '30 minutes');
 END IF;
 END IF;
 RETURN true;
END; $$;
CREATE FUNCTION profil_email_bestaetigen(p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint:=public.aktuelles_konto(); l public.profil_email; BEGIN
 PERFORM 1 FROM public.konto WHERE id=k AND aktiv FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO l FROM public.profil_email WHERE konto_id=k AND hash=p_hash AND ablauf>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(l.email,34));
 IF EXISTS(SELECT FROM public.konto WHERE id<>k AND (email=l.email OR lower(login_referenz)=l.email)) THEN RETURN false; END IF;
 UPDATE public.konto SET email=l.email WHERE id=k;
 UPDATE public.kontolink SET widerrufen_am=clock_timestamp() WHERE konto_id=k AND art='reset' AND verbraucht_am IS NULL AND widerrufen_am IS NULL;
 DELETE FROM public.profil_email WHERE konto_id=k;
 RETURN true;
END; $$;
-- Ein älterer Anwendungsstand darf die Bestätigung nicht umgehen.
CREATE OR REPLACE FUNCTION konto_email(adresse text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT FROM public.konto WHERE id=public.aktuelles_konto() AND aktiv AND email=adresse)
$$;
CREATE FUNCTION profil_link_widerruf() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.passwort_hash IS DISTINCT FROM NEW.passwort_hash OR OLD.aktiv IS DISTINCT FROM NEW.aktiv OR OLD.rolle IS DISTINCT FROM NEW.rolle THEN
  DELETE FROM public.profil_email WHERE konto_id=NEW.id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER profil_link_widerruf AFTER UPDATE OF passwort_hash,aktiv,ist_admin,ist_betrieb ON konto FOR EACH ROW EXECUTE FUNCTION profil_link_widerruf();
REVOKE ALL ON FUNCTION profil_email_ausstehend(),profil_vormerken(text,text,text),profil_email_bestaetigen(text),profil_link_widerruf() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION profil_email_ausstehend(),profil_vormerken(text,text,text),profil_email_bestaetigen(text) TO timereal_app;
INSERT INTO timereal_migration VALUES(10);
COMMIT;
