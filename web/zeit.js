export function lokalText(wert, zone) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wert));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zeitpunkte(wert, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wert)) return [];
  const basis = Date.parse(wert + "Z");
  if (!Number.isFinite(basis)) return [];
  const treffer = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const zeit = new Date(basis + offset * 60000).toISOString();
    if (lokalText(zeit, zone) === wert) treffer.push(zeit);
  }
  return treffer;
}
export function minutenText(minuten) {
  return (
    Math.floor(minuten / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (minuten % 60).toString().padStart(2, "0")
  );
}
