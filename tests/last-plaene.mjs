import pg from "pg";
import { writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { timer } from "../dist/timer.js";
import { woche } from "../dist/uebersicht.js";
import { historie } from "../dist/nachweise.js";
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
try {
  assert.equal(
    (await db.query("select id from timereal_lastprobe")).rows[0]?.id,
    1,
  );
  const day = (await db.query("select (current_date-1)::text as tag")).rows[0]
    .tag;
  await db.query("begin");
  await db.query("set local role timereal_app");
  await db.query("select set_config('app.konto_id','1',true)");
  const plans = [];
  // Führt die echten Fachabfragen mit RLS aus; keine nachgebildeten SQL-Abfragen.
  const traced = {
    query: async (sql, params) => {
      const result = await db.query(
        "explain(analyze,buffers,format json) " + sql,
        params,
      );
      plans.push({ sql, params, plan: result.rows[0]["QUERY PLAN"] });
      return db.query(sql, params);
    },
  };
  await timer(traced);
  await historie(traced, day, day);
  await woche(traced, day);
  await writeFile(
    process.env.LAST_AUSGABE + "/abfrageplaene.json",
    JSON.stringify(plans, null, 2) + "\n",
  );
  await db.query("rollback");
} finally {
  await db.end();
}
