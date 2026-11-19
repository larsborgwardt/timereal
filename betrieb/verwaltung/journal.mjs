import { Betriebsfehler } from "./auftraege.mjs";
import { prozess } from "./system.mjs";

const dienste = new Map([
  ["timereal.service", "anwendung"],
  ["timereal-betrieb.service", "betrieb"],
  ["timereal-https.service", "https"],
]);
const levels = new Set([
  "info",
  "warn",
  "error",
  "debug",
  "success",
  "fatal",
  "complete",
]);
const prioritaeten = [
  "fatal",
  "fatal",
  "fatal",
  "error",
  "warn",
  "info",
  "info",
  "debug",
];
const maxZeilen = 500;
const fensterStunden = 24;

function filterPruefen(filter) {
  if (
    !filter ||
    typeof filter !== "object" ||
    Array.isArray(filter) ||
    Object.keys(filter).some(
      (k) => !["quelle", "level", "suche"].includes(k),
    ) ||
    (filter.quelle !== undefined &&
      !["all", ...dienste.values()].includes(filter.quelle)) ||
    (filter.level !== undefined &&
      filter.level !== "all" &&
      !levels.has(filter.level)) ||
    (filter.suche !== undefined &&
      (typeof filter.suche !== "string" || filter.suche.length > 200))
  )
    throw new Betriebsfehler("EINGABE", "Ungültiger Systemlog-Filter.");
  return {
    quelle: filter.quelle ?? "all",
    level: filter.level ?? "all",
    suche: (filter.suche ?? "").toLocaleLowerCase("de-DE"),
  };
}

function bereinigen(text) {
  // Kein HTML, keine Terminal-Steuerung und keine mehrzeiligen Header/Schlüssel.
  let sicher = text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      "[Schlüssel ausgeblendet]",
    )
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(
      /\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=][^\r\n]*/gi,
      "[Zugangsdaten ausgeblendet]",
    )
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[Zugangsdaten ausgeblendet]")
    .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s<>"']+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.origin + "/[Pfad ausgeblendet]";
      } catch {
        return "[Adresse ausgeblendet]";
      }
    })
    .replace(
      /\b(?:passwort|password|passwd|secret|token|access_token|refresh_token|api[_-]?key|session|smtp_pass)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      "[Zugangsdaten ausgeblendet]",
    )
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
    .trim();
  if (Buffer.byteLength(sicher) > 2048) {
    // Nicht mitten in einer UTF-8-Sequenz abschneiden.
    sicher =
      Buffer.from(sicher)
        .subarray(0, 2040)
        .toString("utf8")
        .replace(/\ufffd$/, "") + " …";
  }
  return sicher;
}

function zeileLesen(raw) {
  const quelle = dienste.get(raw?._SYSTEMD_UNIT);
  if (
    !quelle ||
    typeof raw.MESSAGE !== "string" ||
    !/^\d{1,17}$/.test(raw.__REALTIME_TIMESTAMP ?? "")
  )
    return null;
  const datum = new Date(Number(raw.__REALTIME_TIMESTAMP) / 1000);
  if (!Number.isFinite(datum.getTime())) return null;
  let level =
      typeof raw.PRIORITY === "string" && /^[0-7]$/.test(raw.PRIORITY)
        ? prioritaeten[Number(raw.PRIORITY)]
        : "info",
    text = raw.MESSAGE;
  if (text.trimStart().startsWith("{")) {
    try {
      const json = JSON.parse(text);
      // Caddy und Timereal: nur die Meldung, niemals request/headers/body/stack.
      text =
        typeof json.msg === "string"
          ? json.msg
          : "Strukturierte Meldung ohne Anzeigetext.";
      if (
        levels.has(json.level) &&
        (!["success", "complete"].includes(json.level) ||
          (quelle !== "https" && json.timereal_log === 1))
      )
        level = json.level;
    } catch {
      text = "Unlesbare strukturierte Meldung; Inhalt ausgeblendet.";
    }
  }
  return { zeit: datum.toISOString(), quelle, level, text: bereinigen(text) };
}

/** Ein begrenzter Snapshot; Filter gelangen nie in die Prozessargumente. */
export function journalLeser({ ausfuehren = prozess, jetzt = Date.now } = {}) {
  let snapshot = null,
    fehler = null,
    bis = 0,
    lauf = null;
  async function laden() {
    try {
      const { stdout } = await ausfuehren(
        "/usr/bin/journalctl",
        [
          "--no-pager",
          "--quiet",
          "--output=json",
          "--all",
          "--output-fields=__REALTIME_TIMESTAMP,_SYSTEMD_UNIT,PRIORITY,MESSAGE",
          `--since=-${fensterStunden}h`,
          `--lines=${maxZeilen}`,
          ...[...dienste.keys()].map((unit) => "_SYSTEMD_UNIT=" + unit),
        ],
        { timeout: 2500, maxBytes: 4 * 1024 * 1024 },
      );
      const eingaben = stdout.split("\n").filter((z) => z.trim());
      let ausgelassen = Math.max(0, eingaben.length - maxZeilen);
      const zeilen = [];
      for (const eingabe of eingaben.slice(-maxZeilen)) {
        const zeile = zeileLesen(JSON.parse(eingabe));
        if (zeile) zeilen.push(zeile);
        else ausgelassen++;
      }
      // Auch bei ungewöhnlich langen Meldungen bleibt die IPC-Antwort begrenzt.
      let bytes = 0;
      const behalten = [];
      for (const zeile of zeilen.reverse()) {
        bytes += Buffer.byteLength(JSON.stringify(zeile)) + 1;
        if (bytes > 900000) {
          ausgelassen++;
          continue;
        }
        behalten.push(zeile);
      }
      snapshot = {
        zeilen: behalten.reverse(),
        ausgelassen,
        geprueftAm: new Date(jetzt()).toISOString(),
        maxZeilen,
        fensterStunden,
      };
      fehler = null;
    } catch {
      snapshot = null;
      fehler = new Betriebsfehler(
        "JOURNAL",
        "Systemprotokoll derzeit nicht lesbar. Bitte erneut aktualisieren.",
      );
    } finally {
      bis = jetzt() + 2000;
    }
  }
  return async (eingabe = {}) => {
    const filter = filterPruefen(eingabe);
    if (jetzt() >= bis) {
      lauf ??= laden().finally(() => {
        lauf = null;
      });
      await lauf;
    }
    if (fehler) throw fehler;
    return {
      ...snapshot,
      zeilen: snapshot.zeilen.filter(
        (z) =>
          (filter.quelle === "all" || z.quelle === filter.quelle) &&
          (filter.level === "all" || z.level === filter.level) &&
          (!filter.suche ||
            z.text.toLocaleLowerCase("de-DE").includes(filter.suche)),
      ),
    };
  };
}
