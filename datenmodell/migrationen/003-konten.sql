BEGIN;
ALTER TABLE konto ADD COLUMN email text UNIQUE CHECK(email=lower(email));
ALTER TABLE sitzung ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN erstellt_am timestamptz NOT NULL DEFAULT clock_timestamp();
-- Explizite Spaltenliste hält auch die ältere Anwendung nach der Migration lauffähig.
CREATE OR REPLACE FUNCTION sitzung_anlegen(k bigint,hash text,kanal text,erwartet text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.konto WHERE id=k AND aktiv AND passwort_hash IS NOT DISTINCT FROM erwartet FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.sitzung(schluessel,konto_id,client,ablauf) VALUES(hash,k,kanal,clock_timestamp()+interval '14 days');
 RETURN true;
END; $$;
CREATE TABLE kontolink (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), art text NOT NULL CHECK(art IN ('einladung','reset')),
 email text NOT NULL CHECK(email=lower(email)), hash text NOT NULL UNIQUE CHECK(length(hash)=64),
 konto_id bigint REFERENCES konto, erstellt_von bigint REFERENCES konto,
 erstellt_am timestamptz NOT NULL DEFAULT clock_timestamp(), ablauf timestamptz NOT NULL,
 verbraucht_am timestamptz, widerrufen_am timestamptz
);
CREATE UNIQUE INDEX offene_einladung ON kontolink(email) WHERE art='einladung' AND verbraucht_am IS NULL AND widerrufen_am IS NULL;
CREATE FUNCTION admin_pruefen() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.konto WHERE id=public.aktuelles_konto() AND aktiv AND ist_admin) THEN
 RAISE EXCEPTION 'Verwaltung nicht erlaubt' USING ERRCODE='42501'; END IF;
END; $$;
CREATE FUNCTION konten_lesen() RETURNS TABLE(id bigint,login text,email text,aktiv boolean,admin boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.admin_pruefen(); RETURN QUERY SELECT k.id,k.login_referenz,k.email,k.aktiv,k.ist_admin FROM public.konto k ORDER BY k.login_referenz; END; $$;
CREATE FUNCTION konto_sperre(k bigint,freigabe boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.admin_pruefen();
 -- Administratorkonten können nicht versehentlich aus der Webverwaltung ausgesperrt werden.
 UPDATE public.konto SET aktiv=freigabe WHERE id=k AND NOT ist_admin;
 RETURN FOUND;
END; $$;
CREATE FUNCTION einladungen_lesen() RETURNS TABLE(id uuid,email text,erstellt_am timestamptz,ablauf timestamptz,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.admin_pruefen(); RETURN QUERY
 SELECT l.id,l.email,l.erstellt_am,l.ablauf,CASE WHEN l.verbraucht_am IS NOT NULL THEN 'Angenommen'
 WHEN l.widerrufen_am IS NOT NULL THEN 'Widerrufen' WHEN l.ablauf<=clock_timestamp() THEN 'Abgelaufen' ELSE 'Offen' END
 FROM public.kontolink l WHERE l.art='einladung' ORDER BY l.erstellt_am DESC;
END; $$;
CREATE FUNCTION einladung_erstellen(adresse text,tokenhash text,vorhanden uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ziel uuid; BEGIN
 PERFORM public.admin_pruefen();
 IF vorhanden IS NOT NULL THEN
  SELECT id INTO ziel FROM public.kontolink WHERE id=vorhanden AND art='einladung' AND verbraucht_am IS NULL AND widerrufen_am IS NULL FOR UPDATE;
  IF ziel IS NULL THEN RETURN NULL; END IF;
  SELECT email INTO adresse FROM public.kontolink WHERE id=ziel;
 END IF;
 IF EXISTS(SELECT FROM public.konto WHERE email=adresse OR lower(login_referenz)=adresse) THEN RAISE EXCEPTION 'Konto vorhanden' USING ERRCODE='23505'; END IF;
 IF ziel IS NULL THEN
 INSERT INTO public.kontolink(art,email,hash,erstellt_von,ablauf) VALUES('einladung',adresse,tokenhash,public.aktuelles_konto(),clock_timestamp()+interval '48 hours') RETURNING id INTO ziel;
 ELSE UPDATE public.kontolink SET hash=tokenhash,erstellt_am=clock_timestamp(),ablauf=clock_timestamp()+interval '48 hours' WHERE id=ziel;
 END IF;
 RETURN ziel;
END; $$;
CREATE FUNCTION einladung_widerrufen(ziel uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.admin_pruefen(); UPDATE public.kontolink SET widerrufen_am=clock_timestamp() WHERE id=ziel AND art='einladung' AND verbraucht_am IS NULL AND widerrufen_am IS NULL; RETURN FOUND; END; $$;
CREATE FUNCTION reset_erstellen(adresse text,tokenhash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k bigint; ziel uuid; BEGIN
 SELECT id INTO k FROM public.konto WHERE email=adresse AND aktiv FOR UPDATE;
 IF k IS NULL THEN RETURN NULL; END IF;
 UPDATE public.kontolink SET widerrufen_am=clock_timestamp() WHERE konto_id=k AND art='reset' AND verbraucht_am IS NULL AND widerrufen_am IS NULL;
 INSERT INTO public.kontolink(art,email,hash,konto_id,ablauf) VALUES('reset',adresse,tokenhash,k,clock_timestamp()+interval '30 minutes') RETURNING id INTO ziel;
 RETURN ziel;
END; $$;
CREATE FUNCTION kontolink_verbrauchen(tokenhash text,typ text,passwort text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE l public.kontolink; BEGIN
 IF typ='reset' THEN
  PERFORM k.id FROM public.konto k JOIN public.kontolink t ON t.konto_id=k.id WHERE t.hash=tokenhash AND t.art=typ FOR UPDATE OF k;
 END IF;
 SELECT * INTO l FROM public.kontolink WHERE hash=tokenhash AND art=typ AND ablauf>clock_timestamp() AND verbraucht_am IS NULL AND widerrufen_am IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF typ='einladung' THEN
  INSERT INTO public.konto(login_referenz,email,passwort_hash) VALUES(l.email,l.email,passwort);
 ELSIF typ='reset' THEN
  UPDATE public.konto SET passwort_hash=passwort WHERE id=l.konto_id AND aktiv;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.sitzung SET widerrufen_am=clock_timestamp() WHERE konto_id=l.konto_id AND widerrufen_am IS NULL;
 ELSE RETURN false; END IF;
 UPDATE public.kontolink SET verbraucht_am=clock_timestamp() WHERE id=l.id;
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION login_suchen(login text) RETURNS TABLE(id bigint,hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT k.id,k.passwort_hash FROM public.konto k WHERE k.aktiv AND (k.login_referenz=login OR k.email=lower(login))
$$;
CREATE FUNCTION konto_email(adresse text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(adresse,34));
 IF EXISTS(SELECT FROM public.konto WHERE id<>public.aktuelles_konto() AND (email=adresse OR lower(login_referenz)=adresse)) THEN RETURN false; END IF;
 UPDATE public.konto SET email=adresse WHERE id=public.aktuelles_konto() AND aktiv; RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION konto_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION konto_email(text) TO timereal_app;
CREATE FUNCTION eigenes_passwort() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT passwort_hash FROM public.konto WHERE id=public.aktuelles_konto() AND aktiv $$;
CREATE FUNCTION passwort_aendern(neu text,erwartet text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.konto SET passwort_hash=neu WHERE id=public.aktuelles_konto() AND aktiv AND passwort_hash=erwartet;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.sitzung SET widerrufen_am=clock_timestamp() WHERE konto_id=public.aktuelles_konto() AND widerrufen_am IS NULL;
 UPDATE public.kontolink SET widerrufen_am=clock_timestamp() WHERE konto_id=public.aktuelles_konto() AND art='reset' AND verbraucht_am IS NULL AND widerrufen_am IS NULL;
 RETURN true;
END; $$;
ALTER TABLE sitzung ENABLE ROW LEVEL SECURITY;
CREATE POLICY eigene_sitzung ON sitzung USING(konto_id=aktuelles_konto());
GRANT SELECT(id,client,ablauf,widerrufen_am,erstellt_am,schluessel),UPDATE(widerrufen_am) ON sitzung TO timereal_app;
GRANT SELECT(email,ist_admin) ON konto TO timereal_app;
REVOKE ALL ON FUNCTION admin_pruefen(),konten_lesen(),konto_sperre(bigint,boolean),einladungen_lesen(),einladung_erstellen(text,text,uuid),einladung_widerrufen(uuid),reset_erstellen(text,text),kontolink_verbrauchen(text,text,text),eigenes_passwort(),passwort_aendern(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_pruefen(),konten_lesen(),konto_sperre(bigint,boolean),einladungen_lesen(),einladung_erstellen(text,text,uuid),einladung_widerrufen(uuid),reset_erstellen(text,text),kontolink_verbrauchen(text,text,text),eigenes_passwort(),passwort_aendern(text,text) TO timereal_app;
INSERT INTO timereal_migration VALUES(3);
COMMIT;
