import {
  readFile,
  realpath,
  mkdir,
  copyFile,
  chmod,
  open,
  rename,
  symlink,
  unlink,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isIPv4 } from "node:net";
import { lookup } from "node:dns/promises";
import { setTimeout as warten } from "node:timers/promises";
import { Betriebsfehler, domainMuster } from "./auftraege.mjs";
import { prozess } from "./system.mjs";
import { tagPruefen } from "./tag-signatur.mjs";
import { caddyVorlage, caddyVorlagenstand } from "./caddy-vorlage.mjs";

const source = "https://github.com/larsborgwardt/timereal.git";
const api =
  "https://api.github.com/repos/larsborgwardt/timereal/releases/tags/";
const scripts = fileURLToPath(new URL("../", import.meta.url));
const repo = "/opt/timereal";
const daten = "/var/lib/timereal-betrieb";
const configDir = "/etc/timereal";
const ca = "/var/lib/timereal-https/caddy/pki/authorities/local/root.crt";
const fingerprint = (caddy, env) =>
  createHash("sha256").update(caddy).update("\0").update(env).digest("hex");
export const konfigurationsHash = fingerprint;
export const domainZielkonfiguration = caddyVorlage;
export function domainWechselFingerprints(caddy, env, ip, domain) {
  const ziel = caddyVorlage(ip, domain);
  const neu = env.replace(
    /^PUBLIC_ORIGIN=.*$/m,
    `PUBLIC_ORIGIN=https://${domain}`,
  );
  // Beide Dateien werden atomar ersetzt, aber nicht in einer Dateisystemtransaktion.
  // Nach Stromausfall ist daher auch jeder Zwischenstand genau dieses Auftrags zulässig.
  return [
    fingerprint(caddy, env),
    fingerprint(caddy, neu),
    fingerprint(ziel, env),
    fingerprint(ziel, neu),
  ];
}
export function proxyKonfiguration(caddy, env) {
  const ip = /\bdefault_sni\s+(\S+)/.exec(caddy)?.[1];
  const hosts = [...caddy.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map(
    (m) => m[1],
  );
  const domain = hosts.length === 2 ? hosts[1] : "";
  const origins = env
    .split(/\r?\n/)
    .filter((s) => /^\s*PUBLIC_ORIGIN\s*=/.test(s));
  const vorlage =
    ip && isIPv4(ip) && hosts[0] === ip
      ? caddyVorlagenstand(caddy, ip, domain)
      : 0;
  if (
    !vorlage ||
    (domain && !domainMuster.test(domain)) ||
    origins.length !== 1 ||
    ![
      `PUBLIC_ORIGIN=https://${ip}`,
      `PUBLIC_ORIGIN=https://${domain}`,
    ].includes(origins[0])
  )
    throw new Betriebsfehler(
      "EINGABE",
      "Die HTTPS-Konfiguration entspricht keiner unterstützten Timereal-Vorlage. Eigene Konfiguration bleibt unverändert.",
    );
  return {
    ip,
    origin: origins[0].slice("PUBLIC_ORIGIN=".length),
    proxyZiel: `https://${ip}:443`,
    fingerprint: fingerprint(caddy, env),
    vorlage,
  };
}

export function stabileVersion(release, aktuelleVersion) {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  const version =
    typeof release.tag_name === "string" && release.tag_name.startsWith("v")
      ? release.tag_name.slice(1)
      : "";
  if (
    version.length > 60 ||
    !pattern.test(version) ||
    !pattern.test(aktuelleVersion) ||
    release.draft !== false ||
    release.prerelease !== false
  )
    throw new Betriebsfehler(
      "EINGABE",
      "Keine unterstützte stabile Veröffentlichung.",
    );
  const a = version.split(".").map(BigInt),
    b = aktuelleVersion.split(".").map(BigInt);
  const i = a.findIndex((v, n) => v !== b[n]);
  if (i < 0 || a[i] < b[i])
    throw new Betriebsfehler(
      "ZUSTAND",
      "Das Ziel muss neuer als die installierte Version sein.",
    );
  return release.tag_name;
}

export function betriebsReleasePruefen(manifest, tag) {
  if (
    !manifest ||
    manifest.version !== tag.slice(1) ||
    manifest.apiVersion !== 1 ||
    manifest.betriebProtokoll !== 1
  )
    throw new Betriebsfehler(
      "ZUSTAND",
      "Diese Veröffentlichung unterstützt den installierten Betriebsvertrag nicht. Hinweise zum Konsolenupdate im Release lesen.",
    );
}

async function konfiguration() {
  const caddy = await readFile(join(configDir, "Caddyfile"), "utf8");
  const env = await readFile(join(configDir, "dienst.conf"), "utf8");
  return { ...proxyKonfiguration(caddy, env), caddy, env };
}
async function installiert() {
  return JSON.parse(
    await readFile("/opt/timereal-current/release.json", "utf8"),
  );
}
async function gesund(version) {
  try {
    const h = await fetch("http://127.0.0.1:3040/health", {
      signal: AbortSignal.timeout(2500),
    });
    if (!h.ok || (await h.json()).status !== "ok") return false;
    if (version) {
      const v = await fetch("http://127.0.0.1:3040/api/v1/version", {
        signal: AbortSignal.timeout(2500),
      });
      if (!v.ok || (await v.json()).version !== version) return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function httpsGesund(host) {
  const args = [
    "--noproxy",
    "*",
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "5",
    "--cacert",
    ca,
    "--resolve",
    `${host}:443:127.0.0.1`,
  ];
  const health = await prozess("/usr/bin/curl", [
    ...args,
    `https://${host}/health`,
  ]);
  if (JSON.parse(health.stdout).status !== "ok")
    throw new Error("HTTPS-Health ist ungültig.");
  const html = await prozess("/usr/bin/curl", [...args, `https://${host}/`]);
  if (!/<html[\s>]/i.test(html.stdout))
    throw new Error("HTTPS-Startseite ist leer oder ungültig.");
}
async function syncDatei(path) {
  const f = await open(path, "r");
  try {
    await f.sync();
  } finally {
    await f.close();
  }
}
async function kopie(source, target, mode) {
  const tmp = target + ".betrieb-next";
  await copyFile(source, tmp);
  await chmod(tmp, mode);
  await syncDatei(tmp);
  await rename(tmp, target);
  await syncDatei(join(target, ".."));
}
async function sicherung(job, dateien) {
  const dir = join(daten, "sicherungen", job.id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const modi = {};
  for (const [name, path] of Object.entries(dateien)) {
    modi[name] = (await stat(path)).mode & 0o777;
    await kopie(path, join(dir, name), 0o600);
  }
  await syncDatei(dir);
  await syncDatei(join(dir, ".."));
  return { sicherung: dir, modi };
}
async function neustart() {
  await prozess("/usr/bin/systemctl", [
    "reset-failed",
    "timereal.service",
    "timereal-https.service",
  ]);
  await prozess("/usr/bin/systemctl", [
    "restart",
    "timereal.service",
    "timereal-https.service",
  ]);
}
async function betriebsdienstVorbereiten(pfad, job) {
  await prozess(
    "/usr/bin/bash",
    [join(pfad, "betrieb/verwaltung-einrichten.sh"), pfad],
    {
      env: { TIMEREAL_BETRIEB_AUFTRAG: job.id },
    },
  );
}
async function betriebsdienstNeustarten(job, buch) {
  try {
    await prozess("/usr/bin/systemd-run", [
      `--unit=timereal-betrieb-neustart-${job.id}`,
      "--collect",
      "--on-active=5s",
      "/usr/bin/systemctl",
      "restart",
      "timereal-betrieb.service",
    ]);
  } catch {
    await buch.fortschreiben(job.id, {
      meldung:
        "Anwendung geprüft. Der Betriebsdienst muss im Container neu gestartet werden.",
    });
  }
}
export function domainFehlerhinweis(phase, error) {
  // Keine Prozessausgaben oder unbekannten Fehlermeldungen in Oberfläche/Journal
  // spiegeln: sie können Pfade und Zugangsdaten enthalten. Nur feste Diagnosen.
  const exit =
    Number.isInteger(error.exitCode) &&
    error.exitCode >= 0 &&
    error.exitCode <= 255
      ? ` (Exit ${error.exitCode})`
      : "";
  if (phase === "https") {
    const ursachen = {
      7: "Der lokale HTTPS-Dienst ist nicht erreichbar.",
      22: "Der lokale HTTPS-Dienst antwortet mit einem HTTP-Fehler.",
      28: "Die lokale HTTPS-Prüfung hat ihr Zeitlimit überschritten.",
      60: "Dem Zertifikat des lokalen HTTPS-Dienstes wird nicht vertraut oder es passt nicht zum Hostnamen.",
      77: "Die lokale CA-Datei kann nicht gelesen werden.",
    };
    if (ursachen[error.exitCode]) return ursachen[error.exitCode];
    if (error.message === "HTTPS-Startseite ist leer oder ungültig.")
      return "Die lokale HTTPS-Startseite ist leer oder ungültig.";
    return `Die lokale HTTPS-Prüfung ist fehlgeschlagen${exit}.`;
  }
  const stderr = typeof error.stderr === "string" ? error.stderr : "";
  if (stderr.includes("Bisheriger HTTPS-Zugang ist nicht gesund."))
    return "Der bisherige HTTPS-Zugang hat die Vorprüfung nicht bestanden.";
  if (
    stderr.includes("Gemeinsame Betriebssperre fehlt.") ||
    stderr.includes("Eine Einrichtung oder Aktualisierung läuft.")
  )
    return "Die gemeinsame Betriebssperre konnte nicht übernommen werden.";
  const stdout = typeof error.stdout === "string" ? error.stdout : "";
  const schritt = [...stdout.matchAll(/^\[([1-4])\/4\] /gm)].at(-1)?.[1];
  const namen = {
    1: "Die Prüfung der HTTPS-Konfiguration",
    2: "Die Sicherung der HTTPS-Konfiguration",
    3: "Der Neustart von Anwendung und HTTPS-Dienst",
    4: "Die lokale HTTPS-Prüfung mit Domain und Container-IP",
  };
  return `${namen[schritt] ?? "Die Übernahme der Domainkonfiguration"} ist fehlgeschlagen${exit}.`;
}
async function domainZurueck(job, buch, ursache) {
  if (job.sicherung !== join(daten, "sicherungen", job.id))
    throw new Error("Sicherungsreferenz fehlt.");
  const caddy = await readFile(join(configDir, "Caddyfile"), "utf8"),
    env = await readFile(join(configDir, "dienst.conf"), "utf8");
  const current = fingerprint(caddy, env);
  // Bei eigenmächtigen Konfigurationsänderungen nicht über fremde Arbeit schreiben.
  if (
    !(
      job.ruecknahmeFingerprints ?? [job.fingerprint, job.zielFingerprint]
    ).includes(current)
  )
    throw new Error("Konfiguration außerhalb des Auftrags geändert.");
  for (const name of ["Caddyfile", "dienst.conf"])
    await kopie(
      join(job.sicherung, name),
      join(configDir, name),
      job.modi[name],
    );
  await neustart();
  let ok = false;
  for (let i = 0; i < 20; i++) {
    try {
      await httpsGesund(new URL(job.vorherigeOrigin).hostname);
      ok = true;
      break;
    } catch {
      await warten(1000);
    }
  }
  if (!ok) throw new Error("Alter HTTPS-Zugang ist nicht gesund.");
  await buch.fortschreiben(job.id, {
    zustand: "zurueckgesetzt",
    phase: "zurueckgesetzt",
    meldung: ursache
      ? `Domainwechsel zurückgenommen. ${ursache} Vorherige Konfiguration wiederhergestellt.`
      : "Vorherige Konfiguration wiederhergestellt.",
  });
}
async function updateZurueck(job, buch) {
  if (
    job.sicherung !== join(daten, "sicherungen", job.id) ||
    !job.vorherigerPfad?.startsWith("/opt/timereal")
  )
    throw new Error("Vorheriger Anwendungsstand fehlt.");
  await prozess("/usr/bin/systemctl", ["stop", "timereal.service"]);
  const tmp = "/opt/timereal-current.betrieb-next";
  await unlink(tmp).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  await symlink(job.vorherigerPfad, tmp);
  await rename(tmp, "/opt/timereal-current");
  await syncDatei("/opt");
  for (const name of ["timereal.service", "timereal-backup.service"])
    await kopie(
      join(job.sicherung, name),
      join("/etc/systemd/system", name),
      job.modi[name],
    );
  await prozess("/usr/bin/systemctl", ["daemon-reload"]);
  await prozess("/usr/bin/systemctl", ["reset-failed", "timereal.service"]);
  await prozess("/usr/bin/systemctl", ["start", "timereal.service"]);
  for (let i = 0; i < 30; i++) {
    if (await gesund(job.vorherigeVersion)) {
      await betriebsdienstVorbereiten(job.vorherigerPfad, job);
      await buch.fortschreiben(job.id, {
        zustand: "vorherige_version_aktiv",
        phase: "vorherige_version_aktiv",
        meldung:
          "Vorherige Anwendung wieder erreichbar. Datenbank wurde nicht zurückgespielt.",
      });
      await betriebsdienstNeustarten(job, buch);
      return;
    }
    await warten(1000);
  }
  throw new Error("Vorherige Anwendung nicht erreichbar.");
}
async function releasePruefen(tag, aktuell) {
  const response = await fetch(api + tag, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Timereal-Betriebsdienst",
    },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || !response.body)
    throw new Betriebsfehler(
      "ZUSTAND",
      "Veröffentlichung ist derzeit nicht erreichbar.",
    );
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 65536) throw new Error("Releaseantwort zu groß.");
    chunks.push(chunk);
  }
  const release = JSON.parse(Buffer.concat(chunks).toString());
  if (stabileVersion(release, aktuell) !== tag)
    throw new Error("Veröffentlichung passt nicht zum Auftrag.");
  await prozess(
    "/usr/bin/git",
    [
      "-C",
      repo,
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      source,
      `refs/tags/${tag}:refs/tags/${tag}`,
    ],
    { timeout: 120000 },
  );
  // Vertrauensanker ist der Schlüssel der bereits installierten Version,
  // nicht eine Angabe aus dem neuen Release.
  const commit = await tagPruefen(
    (args) => prozess("/usr/bin/git", args),
    repo,
    tag,
    join(scripts, "release-signierer"),
  );
  const geschaelt = (
    await prozess("/usr/bin/git", [
      "-C",
      repo,
      "rev-parse",
      "--verify",
      `refs/tags/${tag}^{commit}`,
    ])
  ).stdout.trim();
  if (geschaelt !== commit)
    throw new Error("Signierter Tag und Commit passen nicht zusammen.");
  const manifest = await prozess("/usr/bin/git", [
    "-C",
    repo,
    "show",
    `${commit}:release.json`,
  ]);
  betriebsReleasePruefen(JSON.parse(manifest.stdout), tag);
  return commit;
}

export async function betriebsStatus() {
  const aktuell = await installiert();
  try {
    const cfg = await konfiguration();
    return {
      version: aktuell.version,
      origin: cfg.origin,
      proxyZiel: cfg.proxyZiel,
      domainUnterstuetzt: true,
    };
  } catch (error) {
    return {
      version: aktuell.version,
      domainUnterstuetzt: false,
      hinweis:
        error instanceof Betriebsfehler
          ? error.message
          : "HTTPS-Konfiguration ist nicht lesbar.",
    };
  }
}

export async function betriebsAktion(aktion, job, buch, lock) {
  if (aktion === "update-starten" || aktion === "domain-speichern") {
    const update = aktion === "update-starten";
    await betriebsAktion(
      update ? "update-vorbereiten" : "domain-pruefen",
      job,
      buch,
      lock,
    );
    const zustand = update ? "sicherung" : "uebernahme";
    job = await buch.fortschreiben(job.id, { zustand, phase: zustand });
    return betriebsAktion(
      update ? "update-installieren" : "domain-uebernehmen",
      job,
      buch,
      lock,
    );
  }
  const ausgabe = async ({ phase }) => {
    if (
      ![
        "pruefung",
        "vorbereitung",
        "bereit",
        "sicherung",
        "migration",
        "neustart",
        "erfolgreich",
        "fehlgeschlagen",
        "vorherige_version_aktiv",
        "wiederherstellung_noetig",
      ].includes(phase)
    )
      throw new Error("Ungültige Betriebsphase.");
    // Terminaler Erfolg kommt erst nach der unabhängigen Health-/Versionsprüfung.
    await buch.fortschreiben(job.id, {
      phase: phase === "erfolgreich" ? "abschlusspruefung" : phase,
      ...(!["pruefung", "vorbereitung", "bereit", "erfolgreich"].includes(phase)
        ? { zustand: phase }
        : {}),
    });
  };
  const shell = (name, args, extra = {}) =>
    prozess("/usr/bin/bash", [join(scripts, name), ...args], {
      lockFd: lock.fd,
      env: { TIMEREAL_BETRIEB_LOCK: "1", TIMEREAL_BETRIEB_AUFTRAG: job.id },
      timeout: 1800000,
      ...extra,
    });
  if (aktion === "update-vorbereiten") {
    const aktuell = await installiert();
    const commit = await releasePruefen(job.tag, aktuell.version);
    await buch.fortschreiben(job.id, {
      commit,
      vorherigeVersion: aktuell.version,
    });
    await shell("update.sh", ["--prepare", job.tag], {
      env: {
        TIMEREAL_BETRIEB_LOCK: "1",
        TIMEREAL_BETRIEB_EVENTS: "1",
        TIMEREAL_BETRIEB_AUFTRAG: job.id,
      },
      ereignis: ausgabe,
    });
    await buch.fortschreiben(job.id, {
      zustand: job.automatisch ? "vorbereitung" : "bereit",
      phase: "bereit",
    });
  } else if (aktion === "update-installieren") {
    const aktuell = await installiert();
    const commit = await releasePruefen(job.tag, aktuell.version);
    if (commit !== job.commit || aktuell.version !== job.vorherigeVersion)
      throw new Betriebsfehler(
        "KONFLIKT",
        "Release oder Ausgangsversion hat sich geändert. Neu vorbereiten.",
      );
    const backup = await sicherung(job, {
      "timereal.service": "/etc/systemd/system/timereal.service",
      "timereal-backup.service": "/etc/systemd/system/timereal-backup.service",
    });
    job = await buch.fortschreiben(job.id, {
      ...backup,
      vorherigerPfad: await realpath("/opt/timereal-current"),
    });
    try {
      await shell("update.sh", ["--install-prepared", job.tag, job.commit], {
        env: {
          TIMEREAL_BETRIEB_LOCK: "1",
          TIMEREAL_BETRIEB_EVENTS: "1",
          TIMEREAL_BETRIEB_AUFTRAG: job.id,
        },
        ereignis: ausgabe,
      });
      if (!(await gesund(job.tag.slice(1))))
        throw new Error("Zielversion nicht erreichbar.");
      await buch.fortschreiben(job.id, {
        zustand: "erfolgreich",
        phase: "erfolgreich",
        meldung: "Update abgeschlossen.",
      });
      // Auftrag ist dauerhaft abgeschlossen, bevor der eigenständige Dienst gewechselt wird.
      await betriebsdienstNeustarten(job, buch);
    } catch (error) {
      const zustand = buch.lesen(job.id).zustand;
      if (
        ![
          "vorherige_version_aktiv",
          "wiederherstellung_noetig",
          "erfolgreich",
        ].includes(zustand)
      )
        await updateZurueck(job, buch);
      throw error;
    }
  } else if (aktion === "domain-pruefen") {
    const cfg = await konfiguration();
    // DNS ist eine Vorprüfung, kein Nachweis des externen Proxys.
    await Promise.race([
      lookup(job.domain),
      warten(10000).then(() => {
        throw new Error("DNS-Zeitüberschreitung");
      }),
    ]);
    await shell("proxy-einrichten.sh", ["--check", job.domain, cfg.ip]);
    await buch.fortschreiben(job.id, {
      zustand: job.automatisch ? "pruefung" : "geprueft",
      phase: "geprueft",
      fingerprint: cfg.fingerprint,
      vorherigeOrigin: cfg.origin,
      proxyZiel: cfg.proxyZiel,
      ip: cfg.ip,
    });
  } else if (aktion === "domain-uebernehmen") {
    const cfg = await konfiguration();
    if (cfg.fingerprint !== job.fingerprint)
      throw new Betriebsfehler(
        "KONFLIKT",
        "Konfiguration hat sich geändert. Domain erneut prüfen.",
      );
    const backup = await sicherung(job, {
      Caddyfile: join(configDir, "Caddyfile"),
      "dienst.conf": join(configDir, "dienst.conf"),
    });
    const zielFingerprint = fingerprint(
      caddyVorlage(job.ip, job.domain),
      cfg.env.replace(
        /^PUBLIC_ORIGIN=.*$/m,
        `PUBLIC_ORIGIN=https://${job.domain}`,
      ),
    );
    job = await buch.fortschreiben(job.id, {
      ...backup,
      zielFingerprint,
      ruecknahmeFingerprints: domainWechselFingerprints(
        cfg.caddy,
        cfg.env,
        job.ip,
        job.domain,
      ),
    });
    let phase = "konfiguration";
    try {
      await shell("proxy-einrichten.sh", [job.domain, job.ip]);
      phase = "https";
      await httpsGesund(job.domain);
      // Die bisherige Adresse bleibt zulässig (src/herkunft.ts). Ein Wechsel
      // sperrt deshalb niemanden aus und braucht weder Frist noch Rücknahme.
      await buch.fortschreiben(job.id, {
        zustand: "erfolgreich",
        phase: "erfolgreich",
        meldung: `Die Anmeldung über https://${job.ip} bleibt möglich.`,
      });
    } catch (error) {
      await domainZurueck(job, buch, domainFehlerhinweis(phase, error));
      throw error;
    }
  } else if (aktion === "domain-zuruecknehmen") await domainZurueck(job, buch);
  else if (aktion !== "domain-bestaetigen")
    throw new Error("Unbekannte Betriebsaktion.");
}

export async function betriebWiederherstellen(job, buch) {
  try {
    if (job.typ === "domain" && job.sicherung) {
      if (job.zustand === "bestaetigung_ausstehend" && job.frist > Date.now()) {
        const cfg = await konfiguration();
        if (cfg.fingerprint === job.zielFingerprint) {
          await httpsGesund(job.domain);
          return;
        }
      }
      await domainZurueck(job, buch);
    } else if (job.typ === "update" && job.sicherung) {
      if (
        (await installiert()).version === job.tag.slice(1) &&
        (await gesund(job.tag.slice(1)))
      ) {
        await betriebsdienstVorbereiten(
          await realpath("/opt/timereal-current"),
          job,
        );
        await buch.fortschreiben(job.id, {
          zustand: "erfolgreich",
          phase: "erfolgreich",
          meldung: "Aktive Zielversion nach Dienstneustart geprüft.",
        });
        await betriebsdienstNeustarten(job, buch);
      } else await updateZurueck(job, buch);
    } else
      await buch.fortschreiben(job.id, {
        zustand: "fehlgeschlagen",
        phase: "fehlgeschlagen",
        meldung:
          "Vorbereitung wurde unterbrochen. Erneut prüfen und vorbereiten.",
      });
  } catch {
    await buch.fortschreiben(job.id, {
      zustand: "wiederherstellung_noetig",
      phase: "wiederherstellung_noetig",
      meldung:
        "Wiederherstellung konnte nicht bestätigt werden. Im Container prüfen.",
    });
  }
}
