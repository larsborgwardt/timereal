import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  fchownSync,
  fchmodSync,
  linkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const ungueltig = () =>
  new Error(
    "Zwei-Faktor-Schlüsseldatei ist nicht lesbar, ungeschützt oder ungültig.",
  );

export function mfaSchluessel(path: string): Buffer | undefined {
  let fd: number;
  try {
    fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw ungueltig();
  }
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size !== 32 ||
      stat.mode & 0o137 ||
      ![0, process.getuid!()].includes(stat.uid)
    )
      throw ungueltig();
    const key = readFileSync(fd);
    if (key.length !== 32) throw ungueltig();
    return key;
  } catch {
    throw ungueltig();
  } finally {
    closeSync(fd);
  }
}

export function mfaSchluesselAnlegen(path: string, gid?: number) {
  if (mfaSchluessel(path)) return;
  const temp = join(dirname(path), ".mfa-" + randomBytes(12).toString("hex"));
  const fd = openSync(
    temp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    gid === undefined ? 0o600 : 0o640,
  );
  try {
    if (gid !== undefined) fchownSync(fd, process.getuid!(), gid);
    fchmodSync(fd, gid === undefined ? 0o600 : 0o640);
    writeFileSync(fd, randomBytes(32));
    fsyncSync(fd);
    try {
      linkSync(temp, path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  } finally {
    closeSync(fd);
    unlinkSync(temp);
  }
  const dir = openSync(
    dirname(path),
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
  mfaSchluessel(path);
}
