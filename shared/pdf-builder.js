// Construction du PDF du rapport (fonction pure : aucune dépendance au DOM).
// jsPDF est injecté en paramètre, ce qui permet de tester le module sous Node.

export function pdfSanitize(s) {
  return String(s == null ? "" : s)
    .normalize("NFC")
    .replace(/[‘’‚′ʼ]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−‐‑]/g, "-")
    .replace(/…/g, "...")
    .replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/€/g, "EUR")
    .replace(/[      ]/g, " ")
    .replace(/→/g, "->").replace(/←/g, "<-")
    .replace(/≥/g, ">=").replace(/≤/g, "<=")
    .replace(/[•●▪]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export function buildReportPdf(R, M, JsPDF) {
  const doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210, H = 297, ML = 22, MR = 22, MT = 26, MB = 24, CW = W - ML - MR;
  const C = {
    accent: [67, 56, 202], ink: [22, 32, 43], muted: [91, 103, 116], line: [214, 220, 227],
    tint: [238, 240, 255], mark: [184, 115, 31], white: [255, 255, 255], pale: [199, 210, 254],
    haute: [168, 58, 50], moyenne: [184, 115, 31], basse: [47, 122, 79]
  };
  const S = pdfSanitize;
  const toc = [];
  let y = MT;
  const PT = 0.3528;
  const lineH = (size, k) => size * PT * (k || 1.45);

  function font(style, size, color, family) {
    doc.setFont(family || "helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor.apply(doc, color);
  }
  function newPage() { doc.addPage(); y = MT; }
  function ensure(h) { if (y + h > H - MB) newPage(); }
  function lines(text, size, width, style, family) {
    font(style || "normal", size, C.ink, family);
    return doc.splitTextToSize(S(text), width);
  }

  function para(text, o) {
    o = o || {};
    const size = o.size || 10.5, x = o.x || ML, width = o.width || CW, h = lineH(size, o.k);
    font(o.style || "normal", size, o.color || C.ink, o.family);
    const ls = doc.splitTextToSize(S(text), width);
    ls.forEach(function (ln) {
      ensure(h);
      font(o.style || "normal", size, o.color || C.ink, o.family);
      doc.text(ln, x, y + h * 0.72);
      y += h;
    });
    y += (o.after == null ? 2.6 : o.after);
  }

  function bullets(items, o) {
    o = o || {};
    const size = o.size || 10.5, x = o.x || ML, width = o.width || CW, h = lineH(size);
    (items || []).forEach(function (it) {
      if (!it) return;
      const ls = lines(it, size, width - 6);
      ls.forEach(function (ln, i) {
        ensure(h);
        if (i === 0) {
          doc.setFillColor.apply(doc, o.dot || C.accent);
          doc.circle(x + 1.3, y + h * 0.5, 0.75, "F");
        }
        font("normal", size, o.color || C.ink);
        doc.text(ln, x + 6, y + h * 0.72);
        y += h;
      });
      y += 1.4;
    });
    y += 1.6;
  }

  function h1(title, opts) {
    opts = opts || {};
    if (opts.newPage) { if (y > MT + 1) newPage(); }
    else if (y > H * 0.62) newPage();
    else if (y > MT + 1) y += 6;
    ensure(30);
    const num = String(toc.filter(function (t) { return t.level === 1; }).length + 1).padStart(2, "0");
    toc.push({ level: 1, title: title, page: doc.getCurrentPageInfo().pageNumber, num: num });
    font("bold", 10, C.mark, "courier");
    doc.text(num, ML, y + 4);
    const tl = lines(title, 19, CW, "bold", "times");
    font("bold", 19, C.ink, "times");
    let ty = y + 11.5;
    tl.forEach(function (ln) { doc.text(ln, ML, ty); ty += lineH(19, 1.2); });
    y = ty - lineH(19, 1.2) + 4;
    doc.setDrawColor.apply(doc, C.accent);
    doc.setLineWidth(0.6);
    doc.line(ML, y, ML + 18, y);
    doc.setDrawColor.apply(doc, C.line);
    doc.setLineWidth(0.2);
    doc.line(ML + 18, y, W - MR, y);
    y += 7;
  }

  function h2(title, o) {
    y += 2.5;
    ensure(16);
    if (o && o.toc) toc.push({ level: 2, title: title, page: doc.getCurrentPageInfo().pageNumber });
    const ls = lines(title, 12, CW, "bold");
    font("bold", 12, C.accent);
    ls.forEach(function (ln) { doc.text(ln, ML, y + 4.2); y += lineH(12, 1.3); });
    y += 1.6;
  }

  function box(title, items, o) {
    o = o || {};
    const pad = 5, size = 10, h = lineH(size), inner = CW - pad * 2;
    const tl = title ? lines(title, 10.5, inner, "bold") : [];
    const blocks = (items || []).filter(Boolean).map(function (it) { return lines(it, size, inner - 6); });
    let total = pad * 2 + tl.length * lineH(10.5) + (tl.length ? 2 : 0);
    blocks.forEach(function (b) { total += b.length * h + 1.4; });
    if (total > H - MT - MB) { if (title) h2(title); bullets(items); return; }
    ensure(total + 2);
    doc.setFillColor.apply(doc, o.fill || C.tint);
    doc.roundedRect(ML, y, CW, total, 2, 2, "F");
    doc.setFillColor.apply(doc, o.bar || C.accent);
    doc.rect(ML, y, 1.2, total, "F");
    let by = y + pad;
    if (tl.length) {
      font("bold", 10.5, o.bar || C.accent);
      tl.forEach(function (ln) { doc.text(ln, ML + pad, by + lineH(10.5) * 0.72); by += lineH(10.5); });
      by += 2;
    }
    blocks.forEach(function (b) {
      b.forEach(function (ln, i) {
        if (i === 0) { doc.setFillColor.apply(doc, o.bar || C.accent); doc.circle(ML + pad + 1.3, by + h * 0.5, 0.7, "F"); }
        font("normal", size, C.ink);
        doc.text(ln, ML + pad + 6, by + h * 0.72);
        by += h;
      });
      by += 1.4;
    });
    y += total + 5;
  }

  function keep(text) {
    if (!text) return;
    const size = 10.5, h = lineH(size), ls = lines(text, size, CW - 8, "italic");
    const total = ls.length * h + 6;
    ensure(total + 2);
    doc.setFillColor.apply(doc, C.mark);
    doc.rect(ML, y, 1.2, total, "F");
    font("bold", 7.5, C.mark);
    doc.text("À RETENIR", ML + 5, y + 3.2);
    let by = y + 4.5;
    ls.forEach(function (ln) { font("italic", size, C.ink); doc.text(ln, ML + 5, by + h * 0.72); by += h; });
    y += total + 5;
  }

  function table(cols, rows) {
    const size = 9.5, h = lineH(size, 1.35), pad = 2.4;
    const totalW = cols.reduce(function (a, c) { return a + c.w; }, 0);
    const ws = cols.map(function (c) { return c.w / totalW * CW; });
    function header() {
      ensure(10 + h);
      doc.setFillColor.apply(doc, C.accent);
      doc.rect(ML, y, CW, 7.5, "F");
      let x = ML;
      cols.forEach(function (c, i) {
        font("bold", 8.5, C.white);
        doc.text(S(c.label).toUpperCase(), x + pad, y + 5);
        x += ws[i];
      });
      y += 7.5;
    }
    header();
    rows.forEach(function (r, ri) {
      const cells = cols.map(function (c, i) {
        const v = r[c.key];
        if (c.badge) return { badge: S(v || "") , ls: [S(v || "")] };
        const parts = Array.isArray(v) ? v : [v];
        let ls = [];
        parts.forEach(function (p, pi) {
          if (!p) return;
          const st = (pi === 0 && c.boldFirst) ? "bold" : "normal";
          lines(p, size, ws[i] - pad * 2, st).forEach(function (l) { ls.push({ t: l, st: st, muted: pi > 0 && c.boldFirst }); });
        });
        return { ls: ls };
      });
      const rowH = Math.max.apply(null, cells.map(function (c) { return c.ls.length; })) * h + pad * 2;
      if (y + rowH > H - MB) { newPage(); header(); }
      if (ri % 2 === 1) { doc.setFillColor(245, 248, 251); doc.rect(ML, y, CW, rowH, "F"); }
      let x = ML;
      cells.forEach(function (cell, i) {
        if (cell.badge !== undefined) {
          const key = cell.badge.toLowerCase();
          const col = C[key] || C.muted;
          font("bold", 8.5, col);
          doc.text(cell.badge, x + pad, y + pad + h * 0.72);
        } else {
          let cy = y + pad;
          cell.ls.forEach(function (l) {
            font(l.st, size, l.muted ? C.muted : C.ink);
            doc.text(l.t, x + pad, cy + h * 0.72);
            cy += h;
          });
        }
        x += ws[i];
      });
      doc.setDrawColor.apply(doc, C.line);
      doc.setLineWidth(0.2);
      doc.line(ML, y + rowH, W - MR, y + rowH);
      y += rowH;
    });
    y += 6;
  }

  /* ---------- Page de garde ---------- */
  const tlPre = lines(R.titre || "Rapport de veille", 27, CW, "bold", "times").slice(0, 4);
  const slPre = R.sous_titre ? lines(R.sous_titre, 13, CW, "normal").slice(0, 4) : [];
  const bandH = Math.max(96, 50 + tlPre.length * lineH(27, 1.18) + slPre.length * lineH(13, 1.35) + 18);
  doc.setFillColor.apply(doc, C.accent);
  doc.rect(0, 0, W, bandH, "F");
  doc.setFillColor.apply(doc, C.mark);
  doc.rect(ML, 34, 14, 1.4, "F");
  font("bold", 9, C.pale);
  doc.setCharSpace(0.9);
  doc.text("RAPPORT DE VEILLE", ML, 30);
  doc.setCharSpace(0);
  let cy = 50;
  const tl = lines(R.titre || "Rapport de veille", 27, CW, "bold", "times");
  font("bold", 27, C.white, "times");
  tl.slice(0, 4).forEach(function (ln) { doc.text(ln, ML, cy); cy += lineH(27, 1.18); });
  if (R.sous_titre) {
    cy += 2;
    const sl = lines(R.sous_titre, 13, CW, "normal");
    font("normal", 13, C.pale);
    sl.slice(0, 4).forEach(function (ln) { doc.text(ln, ML, cy); cy += lineH(13, 1.35); });
  }
  y = bandH + 18;
  const meta = [
    ["Thème", M.theme || "-"],
    ["Date", M.dateLabel],
    ["Auteur(s)", M.author || "-"],
    ["Destinataires", M.audienceLabel],
    ["Niveau de détail", M.levelLabel]
  ];
  meta.forEach(function (m) {
    font("bold", 8, C.muted);
    doc.text(S(m[0]).toUpperCase(), ML, y);
    const vl = lines(m[1], 11, CW - 45);
    font("normal", 11, C.ink);
    vl.forEach(function (ln, i) { doc.text(ln, ML + 45, y + i * lineH(11)); });
    y += Math.max(1, vl.length) * lineH(11) + 4;
    doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(0.2);
    doc.line(ML, y - 2.5, W - MR, y - 2.5);
    y += 2;
  });
  if (R.mots_cles && R.mots_cles.length) {
    y += 4;
    font("bold", 8, C.muted);
    doc.text("MOTS-CLÉS", ML, y);
    y += 4;
    let kx = ML;
    R.mots_cles.slice(0, 10).forEach(function (k) {
      const t = S(k);
      font("normal", 9, C.accent);
      const tw = doc.getTextWidth(t) + 6;
      if (kx + tw > W - MR) { kx = ML; y += 8; }
      doc.setFillColor.apply(doc, C.tint);
      doc.roundedRect(kx, y, tw, 6, 1.2, 1.2, "F");
      doc.text(t, kx + 3, y + 4.1);
      kx += tw + 3;
    });
  }
  font("normal", 8.5, C.muted);
  const disc = doc.splitTextToSize(S("Rapport rédigé par Claude à partir d'un résumé de veille et de connaissances générales, sans recherche en ligne. Les chiffres, dates et faits précis listés dans « Points à vérifier » doivent être contrôlés avant diffusion."), CW);
  doc.text(disc, ML, H - 22);

  /* ---------- Sommaire (réservé) ---------- */
  doc.addPage();
  const tocPage = doc.getCurrentPageInfo().pageNumber;

  /* ---------- Contenu ---------- */
  newPage();
  h1("Synthèse exécutive");
  (R.synthese || []).forEach(function (p) { para(p); });
  if (R.points_cles && R.points_cles.length) box("Points clés", R.points_cles);

  (R.sections || []).forEach(function (sec) {
    h1(sec.titre, { newPage: true });
    if (sec.introduction) para(sec.introduction, { size: 11, color: C.muted, style: "italic" });
    (sec.blocs || []).forEach(function (b) {
      if (b.sous_titre) h2(b.sous_titre, { toc: true });
      (b.paragraphes || []).forEach(function (p) { para(p); });
    });
    if (sec.exemple) box("Exemple concret", [sec.exemple], { bar: C.accent });
    if (sec.implications && sec.implications.length) { h2("Implications concrètes"); bullets(sec.implications); }
    if (sec.encadre && sec.encadre.points && sec.encadre.points.length) box(sec.encadre.titre || "En bref", sec.encadre.points);
    keep(sec.a_retenir);
  });

  if (R.acteurs && R.acteurs.length) {
    h1("Acteurs et parties prenantes", { newPage: true });
    table([{ key: "nom", label: "Acteur", w: 32 }, { key: "role", label: "Rôle et enjeu", w: 68 }], R.acteurs);
  }
  if ((R.risques && R.risques.length) || (R.opportunites && R.opportunites.length)) {
    h1("Risques et opportunités");
    if (R.risques && R.risques.length) { h2("Risques"); bullets(R.risques, { dot: C.haute }); }
    if (R.opportunites && R.opportunites.length) { h2("Opportunités"); bullets(R.opportunites, { dot: C.basse }); }
  }
  if (R.scenarios && R.scenarios.length) {
    h1("Scénarios d'évolution", { newPage: true });
    table([
      { key: "txt", label: "Scénario", w: 62, boldFirst: true },
      { key: "signaux", label: "Signaux à surveiller", w: 38 }
    ], R.scenarios.map(function (s) {
      return { txt: [s.nom, s.description], signaux: (s.signaux || []).join(" ; ") };
    }));
  }
  if (R.recommandations && R.recommandations.length) {
    h1("Recommandations", { newPage: true });
    table([
      { key: "n", label: "#", w: 6 },
      { key: "txt", label: "Action", w: 62, boldFirst: true },
      { key: "priorite", label: "Priorité", w: 14, badge: true },
      { key: "horizon", label: "Horizon", w: 18 }
    ], R.recommandations.map(function (r, i) {
      return { n: String(i + 1), txt: [r.action, r.justification], priorite: r.priorite, horizon: r.horizon };
    }));
  }
  if ((R.questions_ouvertes && R.questions_ouvertes.length) || (R.points_a_verifier && R.points_a_verifier.length)) {
    h1("Questions ouvertes et points à vérifier");
    if (R.questions_ouvertes && R.questions_ouvertes.length) { h2("Questions ouvertes"); bullets(R.questions_ouvertes); }
    if (R.points_a_verifier && R.points_a_verifier.length) box("Points à vérifier avant diffusion", R.points_a_verifier, { bar: C.mark, fill: [249, 241, 230] });
  }
  if (R.glossaire && R.glossaire.length) {
    h1("Glossaire");
    table([{ key: "terme", label: "Terme", w: 28 }, { key: "definition", label: "Définition", w: 72 }], R.glossaire);
  }
  if (R.conclusion && R.conclusion.length) {
    h1("Conclusion");
    R.conclusion.forEach(function (p) { para(p); });
  }
  h1("Annexe : résumé source", { newPage: true });
  para("Texte saisi dans l'atelier de veille, reproduit tel quel.", { size: 9.5, color: C.muted, style: "italic" });
  String(M.summary || "").split(/\n/).forEach(function (l) {
    if (l.trim() === "") { y += 2; return; }
    para(l, { size: 9.8, after: 0.6 });
  });

  /* ---------- Sommaire dynamique ----------
     Entrées cliquables (parties et sous-parties), réparties sur autant de pages
     que nécessaire, et signets dans le panneau latéral du lecteur PDF. */
  const TOC_HEAD = 26;
  const tocStyle = function (t) {
    return t.level === 1
      ? { size: 11.5, style: "bold", indent: 12, gap: 3.2, before: 2.2 }
      : { size: 10, style: "normal", indent: 18, gap: 1.6, before: 0 };
  };
  // 1. Mesure : on répartit les entrées sur des pages de sommaire.
  const tocLayout = [];
  let tp = 0, ty = MT + TOC_HEAD;
  toc.forEach(function (t) {
    const st = tocStyle(t);
    const tls = lines(t.title, st.size, CW - st.indent - 16, st.style);
    const h = st.before + tls.length * lineH(st.size) + st.gap;
    if (ty + h > H - MB) { tp++; ty = MT + 12; }
    tocLayout.push({ t: t, st: st, tls: tls, page: tp, y: ty + st.before });
    ty += h;
  });
  // 2. Ajout des pages de sommaire supplémentaires, puis décalage des numéros.
  const extra = tp;
  for (let i = 0; i < extra; i++) doc.insertPage(tocPage + 1 + i);
  toc.forEach(function (t) { t.page += extra; });

  // 3. Rendu, avec un lien vers la page de chaque entrée.
  doc.setPage(tocPage);
  font("bold", 10, C.mark, "courier");
  doc.text("SOMMAIRE", ML, MT + 4);
  font("bold", 22, C.ink, "times");
  doc.text(S(R.titre_court || "Contenu du rapport"), ML, MT + 14);
  font("italic", 9, C.muted);
  doc.text(S("Cliquez sur une entrée pour accéder à la page."), ML, MT + 20);
  tocLayout.forEach(function (e) {
    const t = e.t, st = e.st;
    doc.setPage(tocPage + e.page);
    if (e.page > 0 && e === tocLayout.find(function (x) { return x.page === e.page; })) {
      font("bold", 10, C.mark, "courier");
      doc.text("SOMMAIRE (SUITE)", ML, MT + 4);
    }
    const base = e.y + 4.2;
    if (t.level === 1) { font("bold", 9.5, C.mark, "courier"); doc.text(t.num, ML, base); }
    font(st.style, st.size, t.level === 1 ? C.ink : C.muted);
    e.tls.forEach(function (ln, i) { doc.text(ln, ML + st.indent, base + i * lineH(st.size)); });
    const lastY = base + (e.tls.length - 1) * lineH(st.size);
    const lastW = doc.getTextWidth(e.tls[e.tls.length - 1]);
    const pg = String(t.page);
    font(t.level === 1 ? "bold" : "normal", st.size, C.accent);
    const pw = doc.getTextWidth(pg);
    doc.text(pg, W - MR - pw, lastY);
    doc.setDrawColor.apply(doc, C.line);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([0.4, 1.4], 0);
    const x1 = ML + st.indent + lastW + 2, x2 = W - MR - pw - 2;
    if (x2 > x1) doc.line(x1, lastY - 0.6, x2, lastY - 0.6);
    doc.setLineDashPattern([], 0);
    const top = e.y + 0.5, hgt = lastY - top + 1.8;
    doc.link(ML, top, CW, hgt, { pageNumber: t.page, top: 0, zoom: 0 });
  });

  // Signets (panneau latéral) : parties, avec leurs sous-parties en dessous.
  if (doc.outline) {
    doc.outline.add(null, S("Sommaire"), { pageNumber: tocPage });
    let parent = null;
    toc.forEach(function (t) {
      if (t.level === 1) parent = doc.outline.add(null, S(t.num + ". " + t.title), { pageNumber: t.page });
      else doc.outline.add(parent, S(t.title), { pageNumber: t.page });
    });
  }

  /* ---------- En-têtes et pieds de page ---------- */
  const n = doc.getNumberOfPages();
  const shortTitle = doc.splitTextToSize(S(R.titre || "Rapport de veille"), CW - 50)[0];
  for (let i = 2; i <= n; i++) {
    doc.setPage(i);
    font("normal", 8, C.muted);
    doc.text(shortTitle, ML, 14);
    const back = "Retour au sommaire";
    font("bold", 8, C.accent);
    const onToc = i >= tocPage && i <= tocPage + extra;
    doc.text(onToc ? "Rapport de veille" : back, W - MR, 14, { align: "right" });
    if (!onToc) doc.link(W - MR - doc.getTextWidth(back), 10.5, doc.getTextWidth(back), 5, { pageNumber: tocPage, top: 0, zoom: 0 });
    doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(0.2);
    doc.line(ML, 16.5, W - MR, 16.5);
    doc.line(ML, H - 15, W - MR, H - 15);
    font("normal", 8, C.muted);
    doc.text(S(M.dateLabel), ML, H - 10);
    font("bold", 8, C.accent);
    doc.text(i + " / " + n, W - MR, H - 10, { align: "right" });
  }
  return doc;
}
