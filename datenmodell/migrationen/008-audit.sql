BEGIN;
CREATE TABLE audit_art(art text PRIMARY KEY, titel text NOT NULL);
INSERT INTO audit_art VALUES
 ('konto_angelegt','Konto angelegt'),('rolle_geaendert','Rolle geändert'),
 ('konto_gesperrt','Konto gesperrt'),('konto_entsperrt','Konto entsperrt'),
 ('passwort_geaendert','Passwort geändert'),('email_geaendert','E-Mail geändert'),
 ('anmeldung','Angemeldet'),('sitzung_widerrufen','Sitzung beendet'),
 ('anmeldung_fehlgeschlagen','Anmeldung fehlgeschlagen'),
 ('einladung_erstellt','Einladung erstellt'),('einladung_erneuert','Einladung erneuert'),
 ('einladung_widerrufen','Einladung widerrufen'),('einladung_angenommen','Einladung angenommen'),
 ('reset_angefordert','Passwortzurücksetzung angefordert'),('reset_verbraucht','Passwort zurückgesetzt'),
 ('reset_widerrufen','Passwortlink widerrufen');
CREATE TABLE audit_ereignis(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 zeit timestamptz NOT NULL DEFAULT clock_timestamp(),
 art text NOT NULL REFERENCES audit_art,
 akteur text NOT NULL DEFAULT 'System / Kontoeinrichtung',
 ziel text NOT NULL DEFAULT '–',
 vorher text CHECK(vorher IN ('berater','betrieb','administrator')),
 nachher text CHECK(nachher IN ('berater','betrieb','administrator')),
 kanal text CHECK(kanal IN ('web','erweiterung'))
);
CREATE INDEX audit_zeit ON audit_ereignis(zeit DESC,id DESC);
REVOKE ALL ON audit_art,audit_ereignis FROM PUBLIC,timereal_app;
CREATE FUNCTION audit_unveraendert() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Audit-Einträge werden nicht verändert' USING ERRCODE='42501'; END; $$;
CREATE TRIGGER audit_unveraendert BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_ereignis
 FOR EACH STATEMENT EXECUTE FUNCTION audit_unveraendert();

CREATE FUNCTION audit_speichern(p_art text,p_akteur bigint,p_ziel text,p_vorher text DEFAULT NULL,p_nachher text DEFAULT NULL,p_kanal text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.audit_ereignis(art,akteur,ziel,vorher,nachher,kanal)
 VALUES(p_art,coalesce((SELECT login_referenz FROM public.konto WHERE id=p_akteur),'System / Kontoeinrichtung'),coalesce(p_ziel,'Unbekanntes Konto'),p_vorher,p_nachher,p_kanal);
END; $$;
CREATE FUNCTION audit_konto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a bigint:=public.aktuelles_konto();
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM public.audit_speichern('konto_angelegt',a,NEW.login_referenz);
  RETURN NEW;
 END IF;
 IF OLD.rolle IS DISTINCT FROM NEW.rolle THEN
  PERFORM public.audit_speichern('rolle_geaendert',a,NEW.login_referenz,OLD.rolle,NEW.rolle);
 END IF;
 IF OLD.aktiv IS DISTINCT FROM NEW.aktiv THEN
  PERFORM public.audit_speichern(CASE WHEN NEW.aktiv THEN 'konto_entsperrt' ELSE 'konto_gesperrt' END,a,NEW.login_referenz);
 END IF;
 IF OLD.passwort_hash IS DISTINCT FROM NEW.passwort_hash THEN
  PERFORM public.audit_speichern('passwort_geaendert',a,NEW.login_referenz);
 END IF;
 IF OLD.email IS DISTINCT FROM NEW.email THEN
  PERFORM public.audit_speichern('email_geaendert',a,NEW.login_referenz);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER audit_konto AFTER INSERT OR UPDATE OF ist_admin,ist_betrieb,aktiv,passwort_hash,email ON konto FOR EACH ROW EXECUTE FUNCTION audit_konto();

CREATE FUNCTION audit_sitzung() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE zielname text;
BEGIN
 SELECT login_referenz INTO zielname FROM public.konto WHERE id=NEW.konto_id;
 IF TG_OP='INSERT' THEN
  PERFORM public.audit_speichern('anmeldung',NEW.konto_id,zielname,NULL,NULL,NEW.client);
 ELSIF OLD.widerrufen_am IS NULL AND NEW.widerrufen_am IS NOT NULL THEN
  PERFORM public.audit_speichern('sitzung_widerrufen',public.aktuelles_konto(),zielname,NULL,NULL,NEW.client);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER audit_sitzung AFTER INSERT OR UPDATE OF widerrufen_am ON sitzung FOR EACH ROW EXECUTE FUNCTION audit_sitzung();

CREATE FUNCTION audit_kontolink() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a bigint:=public.aktuelles_konto(); ereignis text;
BEGIN
 IF TG_OP='INSERT' THEN
  ereignis:=CASE WHEN NEW.art='einladung' THEN 'einladung_erstellt' ELSE 'reset_angefordert' END;
 ELSIF OLD.verbraucht_am IS NULL AND NEW.verbraucht_am IS NOT NULL THEN
  ereignis:=CASE WHEN NEW.art='einladung' THEN 'einladung_angenommen' ELSE 'reset_verbraucht' END;
 ELSIF OLD.widerrufen_am IS NULL AND NEW.widerrufen_am IS NOT NULL THEN
  ereignis:=CASE WHEN NEW.art='einladung' THEN 'einladung_widerrufen' ELSE 'reset_widerrufen' END;
 ELSIF NEW.art='einladung' AND OLD.hash IS DISTINCT FROM NEW.hash THEN
  ereignis:='einladung_erneuert';
 END IF;
 IF ereignis IS NOT NULL THEN PERFORM public.audit_speichern(ereignis,a,NEW.email); END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER audit_kontolink AFTER INSERT OR UPDATE ON kontolink FOR EACH ROW EXECUTE FUNCTION audit_kontolink();

CREATE FUNCTION audit_anmeldefehler(k bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.audit_speichern('anmeldung_fehlgeschlagen',NULL,(SELECT login_referenz FROM public.konto WHERE id=k))
$$;

CREATE FUNCTION audit_lesen(p_von date,p_bis date,p_suche text,p_vor bigint,p_limit integer)
RETURNS TABLE(id bigint,zeit timestamptz,art text,ereignis text,akteur text,ziel text,vorher text,nachher text,kanal text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE zone text; jetzt timestamptz:=statement_timestamp();
BEGIN
 PERFORM public.admin_pruefen();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5001 OR length(p_suche)>200 OR p_von>p_bis OR p_vor<=0 THEN
  RAISE EXCEPTION 'Ungültiger Auditfilter' USING ERRCODE='23514';
 END IF;
 SELECT zeitzone INTO zone FROM public.konto WHERE konto.id=public.aktuelles_konto();
 RETURN QUERY SELECT e.id,e.zeit,e.art,a.titel,e.akteur,e.ziel,e.vorher,e.nachher,e.kanal
 FROM public.audit_ereignis e JOIN public.audit_art a ON a.art=e.art
 WHERE e.zeit>=jetzt-interval '180 days' AND e.zeit<=jetzt
 AND (p_von IS NULL OR e.zeit>=(p_von::timestamp AT TIME ZONE zone))
 AND (p_bis IS NULL OR e.zeit<((p_bis+1)::timestamp AT TIME ZONE zone))
 AND (p_vor IS NULL OR e.id<p_vor)
 AND (coalesce(p_suche,'')='' OR position(lower(p_suche) IN lower(concat_ws(' ',a.titel,e.akteur,e.ziel,e.vorher,e.nachher,e.kanal)))>0)
 ORDER BY e.id DESC LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION audit_unveraendert(),audit_speichern(text,bigint,text,text,text,text),audit_konto(),audit_sitzung(),audit_kontolink(),audit_anmeldefehler(bigint),audit_lesen(date,date,text,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_anmeldefehler(bigint),audit_lesen(date,date,text,bigint,integer) TO timereal_app;
INSERT INTO timereal_migration VALUES(8);
COMMIT;
