import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proxyKonfiguration,
  stabileVersion,
} from "../betrieb/verwaltung/aktionen.mjs";
import * as aktionen from "../betrieb/verwaltung/aktionen.mjs";
import {
  caddyVorlage,
  caddyVorlageAlt,
  caddyVorlagenstand,
} from "../betrieb/verwaltung/caddy-vorlage.mjs";

test("Domainrücknahme nennt Prüfschritt und sichere Ursache statt fremder Prozessausgaben", () => {
  assert.equal(typeof aktionen.domainFehlerhinweis, "function");
  const hinweis = aktionen.domainFehlerhinweis;
  assert.match(
    hinweis("https", { exitCode: 60 }),
    /Zertifikat.*nicht.*vertraut/,
  );
  assert.match(hinweis("https", { exitCode: 7 }), /nicht erreichbar/);
  assert.match(hinweis("https", { exitCode: 28 }), /Zeitlimit/);
  assert.match(
    hinweis("konfiguration", {
      stdout: "[3/4] Domain übernehmen und Dienste kurz neu starten",
      exitCode: 1,
    }),
    /Neustart.*Exit 1/,
  );
  assert.match(
    hinweis("konfiguration", {
      stdout:
        "[4/4] HTTPS mit öffentlichem Hostnamen und lokalem IP-Zugang prüfen",
      exitCode: 1,
    }),
    /lokale HTTPS-Prüfung.*Exit 1/,
  );
  assert.match(
    hinweis("konfiguration", {
      stderr: "Bisheriger HTTPS-Zugang ist nicht gesund. Keine Änderung.",
    }),
    /bisherige HTTPS-Zugang/,
  );
  assert.match(
    hinweis("https", new Error("HTTPS-Startseite ist leer oder ungültig.")),
    /Startseite.*leer/,
  );
  const fremd = "smtp://nutzer:geheim@host.internal/private";
  assert.ok(
    !hinweis("https", {
      exitCode: fremd,
      message: fremd,
      stderr: fremd,
      stdout: fremd,
    }).includes(fremd),
  );
});

const caddy = (host = "") => `{
 admin off
 auto_https disable_redirects
 default_sni 192.0.2.42
 skip_install_trust
}
https://192.0.2.42${host ? ", https://" + host : ""} {
 tls internal
 reverse_proxy 127.0.0.1:3040
}
`;
test("Domain wird aus unterstütztem Bestand abgeleitet; eigene Proxyregeln bleiben geschützt", () => {
  const lokal = proxyKonfiguration(
    caddy(),
    "PUBLIC_ORIGIN=https://192.0.2.42\n",
  );
  assert.equal(lokal.ip, "192.0.2.42");
  assert.equal(lokal.origin, "https://192.0.2.42");
  const domain = proxyKonfiguration(
    caddy("stunden.example.org"),
    "PORT=3040\nPUBLIC_ORIGIN=https://stunden.example.org\n",
  );
  assert.equal(domain.origin, "https://stunden.example.org");
  assert.equal(domain.proxyZiel, "https://192.0.2.42:443");
  assert.notEqual(domain.fingerprint, lokal.fingerprint);
  for (const [config, env] of [
    [
      caddy().replace("127.0.0.1:3040", "127.0.0.1:9000"),
      "PUBLIC_ORIGIN=https://192.0.2.42\n",
    ],
    [
      caddy(),
      "PUBLIC_ORIGIN=https://192.0.2.42\nPUBLIC_ORIGIN=https://anders.test\n",
    ],
    [caddy(), "PUBLIC_ORIGIN=https://anders.test\n"],
    [
      caddy().replaceAll("192.0.2.42", "999.0.2.42"),
      "PUBLIC_ORIGIN=https://999.0.2.42\n",
    ],
  ])
    assert.throws(() => proxyKonfiguration(config, env));
});
test("Nur stabile Releases mit strikt höherer Version können vorbereitet werden", () => {
  assert.equal(
    stabileVersion(
      { tag_name: "v0.7.0", draft: false, prerelease: false },
      "0.6.2",
    ),
    "v0.7.0",
  );
  for (const tag_name of ["v0.6.2", "v0.5.0", "main", "v0.7.0-rc1", "v00.7.0"])
    assert.throws(() =>
      stabileVersion({ tag_name, draft: false, prerelease: false }, "0.6.2"),
    );
  assert.throws(() =>
    stabileVersion(
      { tag_name: "v0.7.0", draft: true, prerelease: false },
      "0.6.2",
    ),
  );
});

test("Ein Webupdate braucht einen passenden versionsgebundenen Betriebsvertrag", () => {
  const pruefen = aktionen.betriebsReleasePruefen;
  assert.equal(typeof pruefen, "function");
  const gueltig = { version: "0.7.1", apiVersion: 1, betriebProtokoll: 1 };
  assert.doesNotThrow(() => pruefen(gueltig, "v0.7.1"));
  for (const m of [
    null,
    {},
    { ...gueltig, version: "0.7.2" },
    { ...gueltig, betriebProtokoll: 2 },
    { ...gueltig, betriebProtokoll: undefined },
    { ...gueltig, apiVersion: 2 },
  ])
    assert.throws(() => pruefen(m, "v0.7.1"), { code: "ZUSTAND" });
});

test("Abbruch zwischen Konfigurationsdateien erlaubt Rückbau, fremde Änderungen nicht", () => {
  assert.equal(typeof aktionen.domainWechselFingerprints, "function");
  const env = "PORT=3040\nPUBLIC_ORIGIN=https://192.0.2.42\n";
  const neu = env.replace("https://192.0.2.42", "https://zeit.example.org");
  const erlaubt = aktionen.domainWechselFingerprints(
    caddy(),
    env,
    "192.0.2.42",
    "zeit.example.org",
  );
  const hash = (a, b) => aktionen.konfigurationsHash(a, b);
  assert.ok(erlaubt.includes(hash(caddy(), env)));
  assert.ok(erlaubt.includes(hash(caddy(), neu)));
  // Die Zielvorlage hat ihre eigene Formatierung, übernommen aus dem echten Generator.
  const ziel = aktionen.domainZielkonfiguration(
    "192.0.2.42",
    "zeit.example.org",
  );
  assert.ok(erlaubt.includes(hash(ziel, env)));
  assert.ok(erlaubt.includes(hash(ziel, neu)));
  assert.ok(!erlaubt.includes(hash(ziel + "# manuell\n", neu)));
  assert.ok(!erlaubt.includes(hash(ziel, neu.replace("3040", "3041"))));
});

test("Aktuelle HTTPS-Vorlage: Fehlerantwort für unbekannte Hostnamen, kein HTTP/3", () => {
  const lokal = caddyVorlage("192.0.2.42"),
    mitDomain = caddyVorlage("192.0.2.42", "zeit.example.org");
  for (const text of [lokal, mitDomain]) {
    // Ohne Auffangblock beantwortet Caddy fremde Hostnamen mit 200 und leerem Inhalt.
    assert.match(
      text,
      /\n:443 \{\n  tls internal\n  header Cache-Control no-store\n  respond "[^"\n]+" 421\n\}\n$/,
    );
    assert.match(text, /\n  servers \{\n    protocols h1 h2\n  \}\n\}\n/);
    assert.match(text, /\n  reverse_proxy 127\.0\.0\.1:3040\n/);
  }
  assert.match(lokal, /\nhttps:\/\/192\.0\.2\.42 \{\n/);
  assert.match(
    mitDomain,
    /\nhttps:\/\/192\.0\.2\.42, https:\/\/zeit\.example\.org \{\n/,
  );
  // Die Vorlage bis 0.9.4 ist zeichengleich mit dem Bestand der Installationen.
  assert.equal(caddyVorlageAlt("192.0.2.42").replace(/\n  /g, "\n "), caddy());
  assert.equal(
    caddyVorlageAlt("192.0.2.42", "zeit.example.org").replace(/\n  /g, "\n "),
    caddy("zeit.example.org"),
  );
});

test("Vorlagenstand: aktuell, bis 0.9.4 oder eigene Konfiguration", () => {
  const ip = "192.0.2.42",
    domain = "zeit.example.org";
  assert.equal(caddyVorlagenstand(caddyVorlage(ip), ip), 2);
  assert.equal(caddyVorlagenstand(caddyVorlage(ip, domain), ip, domain), 2);
  assert.equal(caddyVorlagenstand(caddy(), ip), 1);
  assert.equal(caddyVorlagenstand(caddy(domain), ip, domain), 1);
  // Falsche Zuordnung von Adresse oder Domain und jede eigene Zeile gelten als fremd.
  assert.equal(caddyVorlagenstand(caddyVorlage(ip, domain), ip), 0);
  assert.equal(caddyVorlagenstand(caddyVorlage(ip), ip, domain), 0);
  assert.equal(caddyVorlagenstand(caddyVorlage(ip), "192.0.2.43"), 0);
  assert.equal(caddyVorlagenstand(caddyVorlage(ip) + "# eigen\n", ip), 0);
  assert.equal(
    caddyVorlagenstand(caddyVorlage(ip).replace(" 421", " 200"), ip),
    0,
  );
  assert.equal(
    caddyVorlagenstand(caddyVorlage(ip).replace("protocols h1 h2", ""), ip),
    0,
  );
});

test("Bestand in alter und aktueller Vorlage wird erkannt; die Zielvorlage ist die aktuelle", () => {
  const env = "PUBLIC_ORIGIN=https://zeit.example.org\n";
  const alt = proxyKonfiguration(caddy("zeit.example.org"), env),
    neu = proxyKonfiguration(
      caddyVorlage("192.0.2.42", "zeit.example.org"),
      env,
    );
  assert.equal(alt.vorlage, 1);
  assert.equal(neu.vorlage, 2);
  for (const cfg of [alt, neu]) {
    assert.equal(cfg.ip, "192.0.2.42");
    assert.equal(cfg.origin, "https://zeit.example.org");
    assert.equal(cfg.proxyZiel, "https://192.0.2.42:443");
  }
  assert.equal(
    aktionen.domainZielkonfiguration("192.0.2.42", "zeit.example.org"),
    caddyVorlage("192.0.2.42", "zeit.example.org"),
  );
  // Auch aus der aktuellen Vorlage bleiben eigene Proxyregeln geschützt.
  assert.throws(() =>
    proxyKonfiguration(
      caddyVorlage("192.0.2.42").replace("127.0.0.1:3040", "127.0.0.1:9000"),
      "PUBLIC_ORIGIN=https://192.0.2.42\n",
    ),
  );
});
