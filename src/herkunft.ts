import { isIPv4 } from "node:net";

/**
 * Herkunftsprüfung für schreibende Anfragen einer Websitzung.
 *
 * Zulässig ist die eingerichtete öffentliche Adresse. Daneben bleibt der
 * Aufruf über die eigene IPv4-Adresse zulässig, wenn Herkunft und angefragter
 * Host übereinstimmen: Eine eingerichtete Domain sperrt den lokalen Zugang
 * damit nicht aus. Für Namen gilt diese Gleichheitsregel bewusst nicht; ein
 * fremder Name, der auf die Adresse zeigt, erhält keinen Zugang.
 */
export function herkunftErlaubt(
  origin: string | undefined,
  host: string | undefined,
  secure: boolean,
  eingerichtet?: string,
): boolean {
  if (origin === undefined || host === undefined) return false;
  const eigene = (secure ? "https://" : "http://") + host;
  if (eingerichtet === undefined) return origin === eigene;
  if (origin === eingerichtet) return true;
  const adresse = /^([0-9.]{7,15})(?::[0-9]{1,5})?$/.exec(host)?.[1];
  return adresse !== undefined && isIPv4(adresse) && origin === eigene;
}
