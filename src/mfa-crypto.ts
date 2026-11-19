import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// RFC 6238 / RFC 4226: HMAC-SHA1, dynamische Kürzung, 30-Sekunden-Schritte.
export function totp(secret: Buffer, step: number, digits: 6 | 8 = 6) {
  if (!Number.isSafeInteger(step) || step < 0 || ![6, 8].includes(digits))
    throw new Error("Ungültiger TOTP-Schritt.");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", secret).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String(
    (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}

export function passenderSchritt(
  secret: Buffer,
  code: string,
  now = Date.now(),
) {
  if (!/^[0-9]{6}$/.test(code) || !Number.isFinite(now) || now < 0) return null;
  const current = Math.floor(now / 30_000);
  let accepted: number | null = null;
  // Beide Vergleiche durchführen; bei zufällig gleichen Codes den neueren Schritt verwenden.
  for (const step of [current - 1, current]) {
    if (
      step >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      accepted = step;
  }
  return accepted;
}

export function base32(bytes: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

const aad = (konto: string) => Buffer.from("timereal:mfa:v1:" + konto);
export function verschluesseln(key: Buffer, konto: string, secret: Buffer) {
  if (key.length !== 32 || secret.length !== 20)
    throw new Error("Ungültige Schlüssellänge.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(konto));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [
    "v1",
    ...[nonce, encrypted, cipher.getAuthTag()].map((b) =>
      b.toString("base64url"),
    ),
  ].join(".");
}

export function entschluesseln(key: Buffer, konto: string, value: string) {
  if (
    !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22}$/.test(value)
  )
    throw new Error("Ungültiges Schlüsselformat.");
  const [, nonce, encrypted, tag] = value
    .split(".")
    .map((part, i) => (i ? Buffer.from(part, "base64url") : Buffer.alloc(0)));
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(aad(konto));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
