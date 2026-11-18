import { test } from "node:test";
import assert from "node:assert/strict";
import { zeitpunkte, lokalText } from "../web/zeit.js";
test("Lokale Eingaben unterscheiden Sommerzeitlücke und die doppelte Stunde", () => {
  assert.deepEqual(zeitpunkte("2026-03-29T02:30", "Europe/Berlin"), []);
  assert.deepEqual(zeitpunkte("2026-02-30T10:00", "Europe/Berlin"), []);
  assert.deepEqual(zeitpunkte("2026-10-25T02:30", "Europe/Berlin"), [
    "2026-10-25T00:30:00.000Z",
    "2026-10-25T01:30:00.000Z",
  ]);
  assert.deepEqual(zeitpunkte("2026-11-16T09:20", "Europe/Berlin"), [
    "2026-11-16T08:20:00.000Z",
  ]);
  assert.equal(
    lokalText("2026-11-16T08:20:00Z", "Europe/Berlin"),
    "2026-11-16T09:20",
  );
});
