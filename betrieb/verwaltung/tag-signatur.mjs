// Prüft SSH-Signaturen von Release-Tags (git tag -s mit gpg.format=ssh).
// Bewusst ohne ssh-keygen oder gpg: Debian-Container bringen beides nicht
// sicher mit. Format nach OpenSSH PROTOCOL.sshsig; nur Ed25519, Namensraum git.
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Betriebsfehler } from "./auftraege.mjs";

const fehler = (text) => new Betriebsfehler("SIGNATUR", text);
const MAGIC = Buffer.from("SSHSIG");
const ANFANG = "-----BEGIN SSH SIGNATURE-----\n";
const ENDE = "-----END SSH SIGNATURE-----\n";

function leser(buf) {
  let pos = 0;
  return {
    bytes(n) {
      if (pos + n > buf.length) throw fehler("Signatur ist beschädigt.");
      const teil = buf.subarray(pos, pos + n);
      pos += n;
      return teil;
    },
    zahl() {
      return this.bytes(4).readUInt32BE(0);
    },
    text() {
      return this.bytes(this.zahl());
    },
    ende() {
      if (pos !== buf.length) throw fehler("Signatur ist beschädigt.");
    },
  };
}
const feld = (inhalt) => {
  const b = Buffer.from(inhalt);
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(b.length);
  return Buffer.concat([laenge, b]);
};
function ed25519(blob) {
  const r = leser(blob);
  if (r.text().toString() !== "ssh-ed25519")
    throw fehler("Nur Ed25519-Schlüssel werden unterstützt.");
  const roh = r.text();
  r.ende();
  if (roh.length !== 32) throw fehler("Ed25519-Schlüssel ist beschädigt.");
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: roh.toString("base64url") },
    format: "jwk",
  });
}

/** Datei im allowed_signers-Format von OpenSSH; jede Zeile ein Schlüssel. */
export function signiererLesen(text) {
  const schluessel = [];
  for (const zeile of text.split("\n").map((z) => z.trim())) {
    if (!zeile || zeile.startsWith("#")) continue;
    const m =
      /^\S+ namespaces="git" ssh-ed25519 ([A-Za-z0-9+/]+={0,2})(?: \S.*)?$/.exec(
        zeile,
      );
    if (!m) throw fehler("Signiererdatei enthält einen ungültigen Eintrag.");
    const blob = Buffer.from(m[1], "base64");
    schluessel.push({ blob, key: ed25519(blob) });
  }
  if (!schluessel.length) throw fehler("Kein Signierschlüssel hinterlegt.");
  return schluessel;
}

/** Prüft ein Tag-Objekt und liefert den signierten Commit. */
export function signaturPruefen(objekt, schluessel, tag) {
  const start = objekt.indexOf("\n" + ANFANG);
  if (start < 0 || objekt.indexOf("\n" + ANFANG, start + 1) >= 0)
    throw fehler("Der Release-Tag ist nicht signiert.");
  const nutzlast = objekt.slice(0, start + 1),
    huelle = objekt.slice(start + 1);
  if (
    !huelle.endsWith(ENDE) ||
    huelle.indexOf(ENDE) !== huelle.length - ENDE.length
  )
    throw fehler("Signatur ist beschädigt.");
  const base64 = huelle.slice(ANFANG.length, -ENDE.length).replace(/\n/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw fehler("Signatur ist beschädigt.");
  const r = leser(Buffer.from(base64, "base64"));
  if (!r.bytes(6).equals(MAGIC) || r.zahl() !== 1)
    throw fehler("Signatur ist beschädigt.");
  const oeffentlich = r.text(),
    namensraum = r.text().toString(),
    reserviert = r.text(),
    verfahren = r.text().toString(),
    unterschrift = r.text();
  r.ende();
  if (namensraum !== "git")
    throw fehler("Signatur gehört nicht zu einem Git-Tag.");
  if (!["sha512", "sha256"].includes(verfahren))
    throw fehler("Unbekanntes Hashverfahren der Signatur.");
  const passend = schluessel.find((s) => s.blob.equals(oeffentlich));
  if (!passend)
    throw fehler("Der Release-Tag ist mit einem fremden Schlüssel signiert.");
  const u = leser(unterschrift);
  if (u.text().toString() !== "ssh-ed25519")
    throw fehler("Nur Ed25519-Signaturen werden unterstützt.");
  const roh = u.text();
  u.ende();
  const daten = Buffer.concat([
    MAGIC,
    feld(namensraum),
    feld(reserviert),
    feld(verfahren),
    feld(createHash(verfahren).update(nutzlast).digest()),
  ]);
  if (roh.length !== 64 || !verify(null, daten, passend.key, roh))
    throw fehler("Die Signatur des Release-Tags ist ungültig.");
  const kopf = /^object ([0-9a-f]{40})\ntype commit\ntag (\S+)\n/.exec(
    nutzlast,
  );
  if (!kopf || kopf[2] !== tag)
    throw fehler("Der signierte Tag passt nicht zur angeforderten Version.");
  return kopf[1];
}

/** git: (argumente) => Promise<{ stdout }> */
export async function tagPruefen(git, repo, tag, signiererDatei) {
  const ref = `refs/tags/${tag}`;
  const art = (await git(["-C", repo, "cat-file", "-t", ref])).stdout.trim();
  if (art !== "tag") throw fehler("Der Release-Tag ist nicht signiert.");
  const objekt = (await git(["-C", repo, "cat-file", "tag", ref])).stdout;
  const schluessel = signiererLesen(await readFile(signiererDatei, "utf8"));
  return signaturPruefen(objekt, schluessel, tag);
}
