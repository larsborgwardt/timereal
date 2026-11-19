import { readFileSync } from "node:fs";
import type { MailConfig } from "./mail.js";
export function smtpKonfiguration(path: string): MailConfig | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (
      !value ||
      typeof value.host !== "string" ||
      !Number.isInteger(value.port) ||
      typeof value.secure !== "boolean" ||
      typeof value.from !== "string" ||
      (value.user !== undefined && typeof value.user !== "string") ||
      (value.password !== undefined && typeof value.password !== "string")
    )
      throw new Error();
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("SMTP-Konfigurationsdatei ist nicht lesbar oder ungültig.");
  }
}
