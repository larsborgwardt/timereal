BEGIN;
ALTER TABLE konto ADD COLUMN ist_betrieb boolean NOT NULL DEFAULT false;
ALTER TABLE konto ADD COLUMN rolle text GENERATED ALWAYS AS (
 CASE WHEN ist_admin THEN 'administrator' WHEN ist_betrieb THEN 'betrieb' ELSE 'berater' END
) STORED;
GRANT SELECT(rolle) ON konto TO timereal_app;

CREATE FUNCTION betrieb_pruefen() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.konto WHERE id=public.aktuelles_konto() AND aktiv AND (ist_admin OR ist_betrieb)) THEN
  RAISE EXCEPTION 'Betrieb nicht erlaubt' USING ERRCODE='42501';
 END IF;
END; $$;

CREATE FUNCTION konten_mit_rollen() RETURNS TABLE(id bigint,login text,email text,aktiv boolean,admin boolean,rolle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.admin_pruefen();
 RETURN QUERY SELECT k.id,k.login_referenz,k.email,k.aktiv,k.ist_admin,k.rolle FROM public.konto k ORDER BY k.login_referenz;
END; $$;

CREATE FUNCTION rollenwechsel_anwenden() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF ROW(OLD.ist_admin,OLD.ist_betrieb) IS DISTINCT FROM ROW(NEW.ist_admin,NEW.ist_betrieb) THEN
  UPDATE public.sitzung SET widerrufen_am=clock_timestamp() WHERE konto_id=NEW.id AND widerrufen_am IS NULL;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER rollenwechsel AFTER UPDATE OF ist_admin,ist_betrieb ON konto
 FOR EACH ROW EXECUTE FUNCTION rollenwechsel_anwenden();

CREATE FUNCTION konto_rolle_aendern(ziel bigint,neu text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k public.konto;
BEGIN
 PERFORM pg_advisory_xact_lock(734995512);
 PERFORM public.admin_pruefen();
 IF neu NOT IN ('berater','betrieb','administrator') OR neu IS NULL THEN
  RAISE EXCEPTION 'Ungültige Rolle' USING ERRCODE='23514';
 END IF;
 SELECT * INTO k FROM public.konto WHERE id=ziel FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF k.rolle=neu THEN RETURN true; END IF;
 IF ziel=public.aktuelles_konto() THEN RETURN false; END IF;
 IF k.aktiv AND k.ist_admin AND neu<>'administrator'
    AND NOT EXISTS(SELECT FROM public.konto WHERE aktiv AND ist_admin AND id<>ziel) THEN RETURN false; END IF;
 UPDATE public.konto SET ist_admin=(neu='administrator'),ist_betrieb=(neu='betrieb') WHERE id=ziel;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION konto_sperre(k bigint,freigabe boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ziel public.konto;
BEGIN
 PERFORM pg_advisory_xact_lock(734995512);
 PERFORM public.admin_pruefen();
 SELECT * INTO ziel FROM public.konto WHERE id=k FOR UPDATE;
 IF NOT FOUND OR k=public.aktuelles_konto() THEN RETURN false; END IF;
 IF NOT freigabe AND ziel.aktiv AND ziel.ist_admin
    AND NOT EXISTS(SELECT FROM public.konto WHERE aktiv AND ist_admin AND id<>k) THEN RETURN false; END IF;
 UPDATE public.konto SET aktiv=freigabe WHERE id=k;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION betrieb_pruefen(),konten_mit_rollen(),rollenwechsel_anwenden(),konto_rolle_aendern(bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION betrieb_pruefen(),konten_mit_rollen(),konto_rolle_aendern(bigint,text) TO timereal_app;
INSERT INTO timereal_migration VALUES(7);
COMMIT;
