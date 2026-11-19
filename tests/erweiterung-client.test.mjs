import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serverAdresse,
  andereServerBerechtigungen,
} from "../web/erweiterung-vertrag.js";
test("Beim Serverwechsel bleiben keine Berechtigungen für vorherige Server übrig", () => {
  assert.deepEqual(
    andereServerBerechtigungen(
      ["https://alt.example.test/*", "https://neu.example.test/*"],
      "https://neu.example.test:8443",
    ),
    ["https://alt.example.test/*"],
  );
  assert.deepEqual(
    andereServerBerechtigungen([], "https://neu.example.test"),
    [],
  );
  assert.deepEqual(
    andereServerBerechtigungen(["https://*/*"], "https://neu.example.test"),
    ["https://*/*"],
  );
});
test("Die Erweiterung verbindet nur HTTPS-Origins oder lokales Loopback und entfernt keine versteckten URL-Bestandteile", () => {
  assert.equal(
    serverAdresse("https://zeit.example.test/"),
    "https://zeit.example.test",
  );
  assert.equal(serverAdresse("http://127.0.0.1:3040"), "http://127.0.0.1:3040");
  for (const u of [
    "http://zeit.example.test",
    "https://user:pass@zeit.example.test",
    "https://zeit.example.test/path",
    "https://zeit.example.test?token=x",
    "https://zeit.example.test/#x",
    "javascript:alert(1)",
  ])
    assert.throws(() => serverAdresse(u));
});
