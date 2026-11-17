import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfSanitize, buildReportPdf } from "../public/js/pdf-builder.js";
import { mockPlan, mockSection } from "../src/services/mock.js";

test("pdfSanitize remplace les caractères non pris en charge par la police PDF", () => {
  assert.equal(pdfSanitize("« l’œuvre » — 10 € → ok…"), "« l'oeuvre » - 10 EUR -> ok...");
  assert.equal(pdfSanitize(null), "");
});

// jsPDF est chargé depuis un CDN dans le navigateur ; ce test ne tourne que s'il est installé
// localement (npm install --no-save jspdf@2.5.1).
let jsPDF = null;
try { ({ jsPDF } = await import("jspdf")); } catch { /* non installé */ }

test("le sommaire est cliquable et chaque lien mène à une page de contenu", { skip: !jsPDF && "jspdf non installé" }, () => {
  const plan = mockPlan(9);
  const R = { ...plan, sections: plan.sections.map((s) => ({ titre: s.titre, ...mockSection() })) };
  const doc = buildReportPdf(R, { dateLabel: "17 novembre 2026", summary: "Résumé." }, jsPDF);
  const n = doc.getNumberOfPages();
  const links = (p) => doc.internal.getPageInfo(p).pageContext.annotations || [];
  const tocPages = [];
  for (let p = 1; p <= n; p++) if (doc.internal.pages[p].join(" ").includes("(SOMMAIRE")) tocPages.push(p);

  assert.ok(tocPages.length >= 2, "le sommaire déborde sur une seconde page");
  const targets = tocPages.flatMap((p) => links(p).map((a) => a.options.pageNumber));
  assert.ok(targets.length > 40);
  assert.ok(targets.every((t) => t > tocPages.at(-1) && t <= n));
  assert.ok(doc.output().includes("/Outlines"), "signets présents");
});
