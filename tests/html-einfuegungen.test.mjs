import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Wächter für HTML, das als Zeichenkette in die Seite eingefügt wird
// (innerHTML, outerHTML, insertAdjacentHTML, document.write).
// Ein Wert gilt als sicher, wenn er nachweislich aus Literalen, Zahlen,
// esc(...) oder Funktionen besteht, deren Rückgaben wiederum sicher sind.
// Parameter werden über alle Aufrufstellen derselben Datei verfolgt.
// Alles andere ist ein Befund, auch wenn es heute harmlos wäre.

const quellen = [
  // web/material.js ist das erzeugte Bündel von Material Web und Lit; seine
  // Herkunft prüft scripts/oberflaeche-buendeln.mjs --check.
  ...readdirSync("web")
    .filter((d) => d.endsWith(".js") && d !== "material.js")
    .map((d) => "web/" + d),
  ...readdirSync("erweiterung")
    .filter((d) => d.endsWith(".js"))
    .map((d) => "erweiterung/" + d),
];

const K = ts.SyntaxKind;
const zahlOperatoren = new Set([
  K.MinusToken,
  K.AsteriskToken,
  K.SlashToken,
  K.PercentToken,
  K.AsteriskAsteriskToken,
]);
const ohneKlammern = (e) => {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
};
const istFunktion = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n);

export function pruefen(datei, text) {
  const quelle = ts.createSourceFile(
    datei,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const befunde = [],
    senken = [];
  const ort = (n) =>
    `${datei}:${quelle.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const alle = [];
  (function sammeln(n) {
    alle.push(n);
    ts.forEachChild(n, sammeln);
  })(quelle);

  // Benannte Funktionen: Deklarationen und const name = (…) => …
  const funktionen = new Map();
  for (const n of alle) {
    if (ts.isFunctionDeclaration(n) && n.name) funktionen.set(n.name.text, n);
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      istFunktion(ohneKlammern(n.initializer))
    )
      funktionen.set(n.name.text, ohneKlammern(n.initializer));
  }
  const rueckgaben = (fn) => {
    if (!ts.isBlock(fn.body)) return [fn.body];
    const r = [];
    (function such(n) {
      if (n !== fn.body && istFunktion(n)) return;
      if (ts.isReturnStatement(n) && n.expression) r.push(n.expression);
      ts.forEachChild(n, such);
    })(fn.body);
    return r;
  };
  const aufrufe = (name) =>
    alle.filter(
      (n) =>
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === name,
    );
  // Zuweisungen an einen Namen außerhalb seiner Deklaration.
  const zuweisungen = (name) =>
    alle.filter(
      (n) =>
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind >= K.FirstAssignment &&
        n.operatorToken.kind <= K.LastAssignment &&
        ts.isIdentifier(n.left) &&
        n.left.text === name,
    );

  // Bindung eines Namens: nächster Gültigkeitsbereich zuerst.
  function bindung(id) {
    for (let p = id.parent; p; p = p.parent) {
      if (istFunktion(p))
        for (const [index, param] of p.parameters.entries()) {
          if (ts.isIdentifier(param.name) && param.name.text === id.text)
            return { art: "parameter", fn: p, index, param };
          if (ts.isArrayBindingPattern(param.name))
            for (const [teil, el] of param.name.elements.entries())
              if (
                ts.isBindingElement(el) &&
                ts.isIdentifier(el.name) &&
                el.name.text === id.text
              )
                return { art: "tupel", fn: p, index, teil };
        }
      const anweisungen =
        ts.isBlock(p) || ts.isSourceFile(p) ? p.statements : [];
      for (const s of anweisungen)
        if (ts.isVariableStatement(s))
          for (const d of s.declarationList.declarations)
            if (ts.isIdentifier(d.name) && d.name.text === id.text)
              return { art: "variable", d };
    }
    return null;
  }

  const inArbeit = new Set(),
    ergebnis = new Map();
  function sicher(e, kette) {
    e = ohneKlammern(e);
    if (
      ts.isStringLiteral(e) ||
      ts.isNoSubstitutionTemplateLiteral(e) ||
      ts.isNumericLiteral(e)
    )
      return;
    if (ts.isTemplateExpression(e))
      return e.templateSpans.forEach((s) => sicher(s.expression, kette));
    if (ts.isBinaryExpression(e)) {
      if (zahlOperatoren.has(e.operatorToken.kind)) return;
      if (
        [K.PlusToken, K.BarBarToken, K.QuestionQuestionToken].includes(
          e.operatorToken.kind,
        )
      ) {
        sicher(e.left, kette);
        sicher(e.right, kette);
        return;
      }
    }
    if (ts.isConditionalExpression(e)) {
      sicher(e.whenTrue, kette);
      sicher(e.whenFalse, kette);
      return;
    }
    if (ts.isCallExpression(e)) {
      const f = e.expression;
      if (ts.isIdentifier(f) && f.text === "esc") return;
      if (ts.isPropertyAccessExpression(f) && f.name.text === "join") {
        const quelle = ohneKlammern(f.expression);
        if (ts.isArrayLiteralExpression(quelle))
          return quelle.elements.forEach((el) => sicher(el, kette));
        if (
          ts.isCallExpression(quelle) &&
          ts.isPropertyAccessExpression(quelle.expression) &&
          quelle.expression.name.text === "map" &&
          quelle.arguments[0] &&
          istFunktion(ohneKlammern(quelle.arguments[0]))
        )
          return rueckgaben(ohneKlammern(quelle.arguments[0])).forEach((r) =>
            sicher(r, kette),
          );
      }
      if (ts.isIdentifier(f) && funktionen.has(f.text)) {
        const fn = funktionen.get(f.text);
        // Ergebnis je Funktion merken; jede weitere unsichere Verwendung wird
        // an ihrer eigenen Stelle gemeldet. Rekursion gilt als sicher.
        if (!ergebnis.has(fn)) {
          if (inArbeit.has(fn)) return;
          inArbeit.add(fn);
          const vorher = befunde.length;
          rueckgaben(fn).forEach((r) => sicher(r, `${kette} → ${f.text}()`));
          ergebnis.set(fn, befunde.length === vorher);
          return;
        }
        if (!ergebnis.get(fn)) befund(e, `${kette} → ${f.text}() unsicher`);
        return;
      }
    }
    if (ts.isIdentifier(e)) {
      const b = bindung(e);
      if (b?.art === "variable") {
        if (
          b.d.parent.flags & ts.NodeFlags.Const ||
          !zuweisungen(e.text).length
        )
          return b.d.initializer
            ? sicher(b.d.initializer, kette)
            : befund(e, kette);
      }
      if (b?.art === "parameter") return parameter(b, e, kette);
      if (b?.art === "tupel") return tupel(b, e, kette);
    }
    befund(e, kette);
  }
  function befund(e, kette) {
    befunde.push(
      `${ort(e)} ${kette}: ${e.getText().replace(/\s+/g, " ").slice(0, 80)}`,
    );
  }
  // Empfänger eines .map(...): das Array, aus dem die Elemente stammen.
  function mapQuelle(fn) {
    const aufruf = fn.parent;
    if (
      !ts.isCallExpression(aufruf) ||
      !ts.isPropertyAccessExpression(aufruf.expression) ||
      aufruf.expression.name.text !== "map" ||
      aufruf.arguments[0] !== fn
    )
      return null;
    let q = ohneKlammern(aufruf.expression.expression);
    if (ts.isIdentifier(q)) {
      const b = bindung(q);
      if (b?.art === "variable" && b.d.parent.flags & ts.NodeFlags.Const)
        q = ohneKlammern(b.d.initializer);
    }
    return q;
  }
  function parameter({ fn, index, param }, e, kette) {
    const q = mapQuelle(fn);
    if (q) {
      // .map((wert, i) => …): der Index ist immer eine Zahl.
      if (index === 1) return;
      if (ts.isArrayLiteralExpression(q))
        return q.elements.forEach((el) => sicher(el, kette));
      return befund(e, kette);
    }
    const name =
      ts.isFunctionDeclaration(fn) && fn.name
        ? fn.name.text
        : ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)
          ? fn.parent.name.text
          : null;
    const stellen = name ? aufrufe(name) : [];
    if (!stellen.length) return befund(e, kette);
    for (const s of stellen) {
      const arg = s.arguments[index];
      if (arg) sicher(arg, `${kette} ← ${ort(s)}`);
      else if (param.initializer) sicher(param.initializer, kette);
    }
  }
  function tupel({ fn, teil }, e, kette) {
    const q = mapQuelle(fn);
    if (q && ts.isArrayLiteralExpression(q)) {
      for (const el of q.elements) {
        const x = ohneKlammern(el);
        if (!ts.isArrayLiteralExpression(x) || !x.elements[teil])
          return befund(e, kette);
        sicher(x.elements[teil], kette);
      }
      return;
    }
    // Object.entries(objektliteral).map(([schluessel, wert]) => …)
    if (
      q &&
      ts.isCallExpression(q) &&
      q.expression.getText() === "Object.entries" &&
      q.arguments[0]
    ) {
      let o = ohneKlammern(q.arguments[0]);
      if (ts.isIdentifier(o)) {
        const b = bindung(o);
        if (b?.art === "variable" && b.d.parent.flags & ts.NodeFlags.Const)
          o = ohneKlammern(b.d.initializer);
      }
      if (ts.isObjectLiteralExpression(o)) {
        for (const p of o.properties) {
          if (!ts.isPropertyAssignment(p)) return befund(e, kette);
          if (teil === 0) {
            const k = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name);
            if (!k || !/^[A-Za-z0-9_-]*$/.test(p.name.text))
              befund(p.name, kette);
          } else sicher(p.initializer, kette);
        }
        return;
      }
    }
    befund(e, kette);
  }

  for (const n of alle) {
    const ziel =
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= K.FirstAssignment &&
      n.operatorToken.kind <= K.LastAssignment
        ? n.left
        : null;
    const eigenschaft =
      ziel && ts.isPropertyAccessExpression(ziel)
        ? ziel.name.text
        : ziel &&
            ts.isElementAccessExpression(ziel) &&
            ts.isStringLiteral(ziel.argumentExpression)
          ? ziel.argumentExpression.text
          : null;
    if (["innerHTML", "outerHTML"].includes(eigenschaft)) {
      senken.push(ort(n));
      sicher(n.right, `${ort(n)} ${eigenschaft}`);
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ["insertAdjacentHTML", "write", "writeln"].includes(
        n.expression.name.text,
      ) &&
      (n.expression.name.text === "insertAdjacentHTML" ||
        n.expression.expression.getText() === "document")
    ) {
      senken.push(ort(n));
      for (const a of n.arguments.slice(
        n.expression.name.text === "insertAdjacentHTML" ? 1 : 0,
      ))
        sicher(a, `${ort(n)} ${n.expression.name.text}`);
    }
  }
  return { befunde, senken };
}

test("Jeder Wert in eingefügtem HTML ist nachweislich maskiert oder fest", () => {
  const befunde = quellen.flatMap(
    (d) => pruefen(d, readFileSync(d, "utf8")).befunde,
  );
  assert.deepEqual(befunde, []);
});

test("Der Parser findet dieselben Einfügestellen wie eine Textsuche", () => {
  // Zwei unabhängige Erzeuger: Syntaxbaum gegen Zeilensuche.
  const parser = quellen
    .flatMap((d) => pruefen(d, readFileSync(d, "utf8")).senken)
    .sort();
  const suche = quellen
    .flatMap((d) =>
      readFileSync(d, "utf8")
        .split("\n")
        .flatMap((z, i) =>
          /\.(innerHTML|outerHTML)\s*\+?=(?!=)|\.insertAdjacentHTML\(|document\.write(ln)?\(/.test(
            z,
          )
            ? [`${d}:${i + 1}`]
            : [],
        ),
    )
    .sort();
  assert.ok(parser.length > 0);
  assert.deepEqual(parser, suche);
});

test("Der Wächter erkennt unmaskierte Werte, auch über Parameter und Variablen", () => {
  const fall = (code) => pruefen("probe.js", code).befunde.length;
  assert.equal(fall('x.innerHTML = "<b>" + esc(wert) + "</b>";'), 0);
  assert.equal(fall('x.innerHTML = "<b>" + wert + "</b>";'), 1);
  assert.equal(fall("x.innerHTML = `<b>${wert}</b>`;"), 1);
  assert.equal(fall('x["innerHTML"] = wert;'), 1);
  assert.equal(fall("x.outerHTML = wert;"), 1);
  assert.equal(fall('x.insertAdjacentHTML("beforeend", wert);'), 1);
  assert.equal(fall("document.write(wert);"), 1);
  assert.equal(fall("x.innerHTML += wert;"), 1);
  // Parameter: unsicher, sobald eine Aufrufstelle einen fremden Wert übergibt.
  const hilfe = 'const knopf = (t) => "<button>" + t + "</button>";\n';
  assert.equal(fall(hilfe + 'x.innerHTML = knopf("OK");'), 0);
  // Gemeldet werden der fremde Parameterwert und die Verwendung der damit
  // unsicheren Hilfsfunktion.
  assert.equal(fall(hilfe + 'x.innerHTML = knopf("OK") + knopf(name);'), 2);
  // Variablen: let mit späterer Zuweisung gilt nicht als fest.
  assert.equal(fall('const t = "<b>"; x.innerHTML = t;'), 0);
  assert.equal(fall('let t = "<b>"; t += wert; x.innerHTML = t;'), 1);
  // Listen: Elemente aus .map werden geprüft, der Index ist eine Zahl.
  assert.equal(
    fall('x.innerHTML = l.map((v, i) => "<li>" + (i + 1) + esc(v)).join("");'),
    0,
  );
  assert.equal(fall('x.innerHTML = l.map((v) => "<li>" + v).join("");'), 1);
  assert.equal(
    fall('x.innerHTML = [["A", 1]].map(([t, n]) => "<i>" + t + n).join("");'),
    0,
  );
  assert.equal(
    fall('x.innerHTML = [["A", name]].map(([t, n]) => t + n).join("");'),
    1,
  );
  const rollen = 'const r = { admin: "Administrator", b: wert };\n';
  assert.equal(
    fall(
      rollen +
        'x.innerHTML = Object.entries(r).map(([k, v]) => k + v).join("");',
    ),
    1,
  );
  // Eine unsichere Hilfsfunktion wird an jeder Verwendung gemeldet.
  const uhr = "const uhr = (w) => w.toString();\n";
  assert.equal(fall(uhr + "x.innerHTML = uhr(a); y.innerHTML = uhr(b);"), 2);
  assert.equal(fall(uhr + "x.innerHTML = esc(uhr(a)) + esc(uhr(b));"), 0);
  // Rechenwerte sind Zahlen; ein Plus kann Text verbinden.
  assert.equal(fall("x.innerHTML = (a - b) / 60;"), 0);
  assert.equal(fall("x.innerHTML = a + 1;"), 1);
});

test("esc maskiert alle fünf HTML-Sonderzeichen und wird nur an einer Stelle definiert", () => {
  const app = readFileSync("web/app.js", "utf8");
  const quelle = ts.createSourceFile(
    "web/app.js",
    app,
    ts.ScriptTarget.Latest,
    true,
  );
  let definition = null;
  (function such(n) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "esc"
    )
      definition = n.initializer.getText();
    ts.forEachChild(n, such);
  })(quelle);
  assert.ok(definition);
  const esc = vm.runInNewContext("(" + definition + ")");
  assert.equal(
    esc(`<a href="x" title='y'>&</a>`),
    "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
  );
  assert.equal(esc(null), "");
  // Andere Dateien erhalten esc aus app.js und definieren keine eigene Fassung.
  for (const d of quellen.filter((d) => d !== "web/app.js"))
    assert.doesNotMatch(
      readFileSync(d, "utf8"),
      /(const|let|var|function)\s+esc\b|esc\s*=(?!=)/,
      d,
    );
});
