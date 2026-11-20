export type AnmeldeGrenzen = {
  /** Versuche je Absender und Anmeldename innerhalb des Fensters. */
  jeZiel: number;
  /** Versuche je Absender über alle Anmeldenamen innerhalb des Fensters. */
  jeAbsender: number;
  /** Obergrenze der gemerkten Zähler je Art; darüber wird der älteste verdrängt. */
  eintraege: number;
  fensterMs: number;
};
export const anmeldeGrenzen: AnmeldeGrenzen = {
  jeZiel: 12,
  jeAbsender: 2048,
  eintraege: 4096,
  fensterMs: 600000,
};
type Zaehler = { ab: number; n: number };

/**
 * Begrenzt Anmeldeversuche im Speicher eines Prozesses. Ein ausgeschöpftes
 * Kontingent trifft nur den Absender, der es verbraucht hat: Ein voller
 * Speicher verdrängt den ältesten Zähler und weist niemanden ab.
 */
export function anmeldeDrossel(grenzen: Partial<AnmeldeGrenzen> = {}) {
  const g = { ...anmeldeGrenzen, ...grenzen };
  const ziele = new Map<string, Zaehler>(),
    absender = new Map<string, Zaehler>();
  const schluessel = (ip: string, login: string) =>
    ip + "|" + login.toLowerCase();
  function lesen(map: Map<string, Zaehler>, key: string, jetzt: number) {
    const z = map.get(key);
    if (z && z.ab <= jetzt) {
      map.delete(key);
      return undefined;
    }
    return z;
  }
  function zaehlen(
    map: Map<string, Zaehler>,
    key: string,
    bekannt: Zaehler | undefined,
    jetzt: number,
  ) {
    if (bekannt) {
      bekannt.n++;
      return;
    }
    // Das Fenster ist für alle gleich lang und beginnt mit dem Eintrag:
    // Die Einfügereihenfolge der Map ist deshalb auch die Ablaufreihenfolge.
    for (const [k, v] of map) {
      if (v.ab > jetzt && map.size < g.eintraege) break;
      map.delete(k);
    }
    map.set(key, { ab: jetzt + g.fensterMs, n: 1 });
  }
  return {
    /** Zählt einen zugelassenen Versuch; `false` heißt abgelehnt und nicht gezählt. */
    versuch(ip: string, login: string, jetzt = Date.now()): boolean {
      const key = schluessel(ip, login);
      const a = lesen(absender, ip, jetzt),
        z = lesen(ziele, key, jetzt);
      if ((a?.n ?? 0) >= g.jeAbsender || (z?.n ?? 0) >= g.jeZiel) return false;
      zaehlen(absender, ip, a, jetzt);
      zaehlen(ziele, key, z, jetzt);
      return true;
    },
    erfolg(ip: string, login: string) {
      ziele.delete(schluessel(ip, login));
    },
    groesse: () => ({ ziele: ziele.size, absender: absender.size }),
  };
}
