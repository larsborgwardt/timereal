const repositoryUrl = "https://github.com/larsborgwardt/timereal";
const latestUrl =
  "https://api.github.com/repos/larsborgwardt/timereal/releases/latest";
const successTtl = 6 * 60 * 60 * 1000;
const failureTtl = 15 * 60 * 1000;

export type UpdateStatus = {
  status: "ok" | "unavailable" | "disabled";
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  repositoryUrl: string;
  releaseUrl: string | null;
};

export function updateCheckingEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("TIMEREAL_UPDATE_CHECK muss true oder false sein.");
}

function versionParts(value: unknown): string[] {
  if (
    typeof value !== "string" ||
    value.length > 60 ||
    !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  )
    throw new Error("Keine stabile Versionsnummer.");
  return value.replace(/^v/, "").split(".");
}

async function releaseData(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body)
    throw new Error("Release nicht erreichbar.");
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) throw new Error("Release-Antwort zu groß.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Release-Antwort ungültig.");
  return data as Record<string, unknown>;
}

/** Ein Cache pro Serverprozess; keine Kontodaten oder Anfragen aus dem Browser an GitHub. */
export function updateChecker(options: {
  version: string;
  enabled: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): () => Promise<UpdateStatus> {
  const current = versionParts(options.version).map(BigInt);
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let expires = 0;
  let pending: Promise<UpdateStatus> | undefined;
  let cached: UpdateStatus = {
    status: options.enabled ? "unavailable" : "disabled",
    currentVersion: options.version,
    latestVersion: null,
    updateAvailable: false,
    checkedAt: null,
    repositoryUrl,
    releaseUrl: null,
  };
  async function check(): Promise<UpdateStatus> {
    try {
      const data = await releaseData(
        await request(latestUrl, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Timereal-Update-Check",
          },
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
        }),
      );
      const parts = versionParts(data.tag_name);
      if (data.draft !== false || data.prerelease !== false)
        throw new Error("Keine öffentliche stabile Veröffentlichung.");
      const latest = parts.map(BigInt);
      const different = latest.findIndex((value, i) => value !== current[i]);
      cached = {
        ...cached,
        status: "ok",
        latestVersion: parts.join("."),
        updateAvailable:
          different >= 0 && latest[different] > current[different],
        checkedAt: new Date(now()).toISOString(),
        releaseUrl: repositoryUrl + "/releases/tag/" + data.tag_name,
      };
      expires = now() + successTtl;
    } catch {
      // Ein älterer Erfolg bleibt erkennbar; Fehlerdetails gehören nicht in die öffentliche API.
      cached = { ...cached, status: "unavailable" };
      expires = now() + failureTtl;
    }
    return { ...cached };
  }
  return async () => {
    if (!options.enabled || now() < expires) return { ...cached };
    pending ??= check().finally(() => {
      pending = undefined;
    });
    return { ...(await pending) };
  };
}
