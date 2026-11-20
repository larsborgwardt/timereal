import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  signiererLesen,
  signaturPruefen,
  tagPruefen,
} from "../betrieb/verwaltung/tag-signatur.mjs";

// Echte Git-Tags mit SSH-Signaturen von ssh-keygen; git verify-tag dient als
// Referenz für dieselben Fälle.
const dir = mkdtempSync(join(tmpdir(), "timereal-tag-signatur-"));
const git = (...args) =>
  execFileSync("git", ["-C", join(dir, "repo"), ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();
const schluessel = (name) => {
  execFileSync("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    name,
    "-f",
    join(dir, name),
  ]);
  return readFileSync(join(dir, name + ".pub"), "utf8").trim();
};
const signierer = (pub) => `timereal-release namespaces="git" ${pub}\n`;
const echt = schluessel("echt"),
  fremd = schluessel("fremd");
writeFileSync(join(dir, "erlaubt"), signierer(echt));
execFileSync("git", ["init", "-q", join(dir, "repo")]);
git(
  "-c",
  "user.name=Probe",
  "-c",
  "user.email=probe@example.org",
  "commit",
  "-q",
  "--allow-empty",
  "-m",
  "Stand",
);
const commit = git("rev-parse", "HEAD");
const signieren = (tag, key, ...extra) =>
  git(
    "-c",
    "user.name=Probe",
    "-c",
    "user.email=probe@example.org",
    "-c",
    "gpg.format=ssh",
    "-c",
    "user.signingkey=" + join(dir, key),
    "tag",
    ...extra,
    "-m",
    "Release " + tag,
    tag,
    commit,
  );
signieren("v1.0.0", "echt", "-s");
signieren("v1.0.1", "fremd", "-s");
git(
  "-c",
  "user.name=Probe",
  "-c",
  "user.email=probe@example.org",
  "tag",
  "-a",
  "-m",
  "ohne Signatur",
  "v1.0.2",
  commit,
);
git("tag", "v1.0.3", commit);
// Ein gültig signiertes Tag-Objekt unter einem anderen Namen.
git("update-ref", "refs/tags/v1.0.4", git("rev-parse", "refs/tags/v1.0.0"));
const referenz = (tag) =>
  spawnSync(
    "git",
    [
      "-C",
      join(dir, "repo"),
      "-c",
      "gpg.ssh.allowedSignersFile=" + join(dir, "erlaubt"),
      "verify-tag",
      tag,
    ],
    { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
  ).status;
const lesen = (args) => Promise.resolve({ stdout: git(...args) + "\n" });
const pruefen = (tag) =>
  tagPruefen(
    (args) => lesen(args.slice(2)),
    join(dir, "repo"),
    tag,
    join(dir, "erlaubt"),
  );

test.after(() => rmSync(dir, { recursive: true, force: true }));

test("Ein mit dem hinterlegten Schlüssel signierter Tag liefert seinen Commit", async () => {
  assert.equal(await pruefen("v1.0.0"), commit);
  assert.equal(referenz("v1.0.0"), 0);
});

test("Fremder Schlüssel, fehlende Signatur und einfacher Tag werden abgewiesen", async () => {
  for (const tag of ["v1.0.1", "v1.0.2", "v1.0.3"]) {
    await assert.rejects(pruefen(tag), { code: "SIGNATUR" }, tag);
    assert.notEqual(referenz(tag), 0, tag);
  }
});

test("Ein signierter Tag unter fremdem Namen wird abgewiesen", async () => {
  await assert.rejects(pruefen("v1.0.4"), { code: "SIGNATUR" });
});

test("Veränderter Inhalt, anderer Namensraum und beschädigte Signatur werden abgewiesen", () => {
  const objekt = git("cat-file", "tag", "v1.0.0") + "\n";
  const erlaubt = signiererLesen(signierer(echt));
  assert.equal(signaturPruefen(objekt, erlaubt, "v1.0.0"), commit);
  const faelle = [
    objekt.replace("Release v1.0.0", "Release v9.9.9"),
    objekt.replace("type commit", "type tree"),
    objekt.replace(/-----BEGIN SSH SIGNATURE-----[\s\S]*$/, ""),
    objekt.replace(
      /(-----BEGIN SSH SIGNATURE-----\n)(.)/,
      (_, a, b) => a + (b === "A" ? "B" : "A"),
    ),
  ];
  // Signatur desselben Inhalts im Namensraum "file" statt "git".
  const nutzlast = objekt.slice(0, objekt.indexOf("-----BEGIN SSH SIGNATURE"));
  writeFileSync(join(dir, "nutzlast"), nutzlast);
  execFileSync("ssh-keygen", [
    "-q",
    "-Y",
    "sign",
    "-n",
    "file",
    "-f",
    join(dir, "echt"),
    join(dir, "nutzlast"),
  ]);
  faelle.push(nutzlast + readFileSync(join(dir, "nutzlast.sig"), "utf8"));
  for (const [i, fall] of faelle.entries())
    assert.throws(
      () => signaturPruefen(fall, erlaubt, "v1.0.0"),
      { code: "SIGNATUR" },
      "Fall " + i,
    );
  assert.throws(
    () => signaturPruefen(objekt, signiererLesen(signierer(fremd)), "v1.0.0"),
    { code: "SIGNATUR" },
  );
});

test("Die Signiererdatei enthält genau Ed25519-Schlüssel mit Namensraum git", () => {
  assert.equal(signiererLesen(signierer(echt)).length, 1);
  for (const text of [
    "",
    "# nur Kommentar\n",
    `timereal-release ${echt}\n`,
    `timereal-release namespaces="file" ${echt}\n`,
    `timereal-release namespaces="git" ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ\n`,
  ])
    assert.throws(() => signiererLesen(text), { code: "SIGNATUR" }, text);
  // Der ausgelieferte Schlüssel ist gültig.
  assert.equal(
    signiererLesen(readFileSync("betrieb/release-signierer", "utf8")).length,
    1,
  );
});
