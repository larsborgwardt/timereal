// Einzige Quelle der unterstützten Caddy-Konfiguration für Betriebsdienst,
// proxy-einrichten.sh und install.sh. Eigene Konfigurationen werden nur
// erkannt und nie überschrieben.

const kopf = (ip, zusatz = "") => `{
  admin off
  auto_https disable_redirects
  default_sni ${ip}
  skip_install_trust
${zusatz}}
`;
const zugang = (
  ip,
  domain,
) => `https://${ip}${domain ? `, https://${domain}` : ""} {
  tls internal
  reverse_proxy 127.0.0.1:3040
}
`;

/** Vorlage bis 0.9.4: fremde Hostnamen erhielten 200 mit leerem Inhalt. */
export const caddyVorlageAlt = (ip, domain = "") =>
  kopf(ip) + zugang(ip, domain);

/**
 * Aktuelle Vorlage. Der Auffangblock beantwortet nicht eingerichtete
 * Hostnamen mit einem Fehler, den ein vorgeschalteter Proxy nicht als Seite
 * zwischenspeichert. HTTP/3 bleibt aus: Hinter einem fremden Proxy wäre die
 * Ankündigung für den Browser nicht einlösbar.
 */
export const caddyVorlage = (ip, domain = "") =>
  kopf(
    ip,
    `  servers {
    protocols h1 h2
  }
`,
  ) +
  zugang(ip, domain) +
  `:443 {
  tls internal
  header Cache-Control no-store
  respond "Timereal: Dieser Hostname ist hier nicht eingerichtet." 421
}
`;

const kompakt = (text) => text.replace(/\s+/g, "");

/** 2 = aktuelle Vorlage, 1 = Vorlage bis 0.9.4, 0 = eigene Konfiguration. */
export function caddyVorlagenstand(text, ip, domain = "") {
  const ist = kompakt(text);
  if (ist === kompakt(caddyVorlage(ip, domain))) return 2;
  if (ist === kompakt(caddyVorlageAlt(ip, domain))) return 1;
  return 0;
}
