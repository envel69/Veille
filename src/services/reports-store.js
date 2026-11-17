// Historique des rapports, stocké côté serveur : un fichier JSON par rapport dans DATA_DIR/reports.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ID_RE = /^[a-z0-9]{8,40}$/;

export class NotFoundError extends Error {}

export function createReportsStore(dataDir) {
  const dir = path.join(dataDir, "reports");
  const file = (id) => {
    if (!ID_RE.test(String(id))) throw new NotFoundError("Rapport introuvable.");
    return path.join(dir, id + ".json");
  };
  const ready = fs.mkdir(dir, { recursive: true });

  /** Résumé affiché dans les listes (sans le contenu complet). */
  function summarize(e) {
    return {
      id: e.id,
      createdAt: e.createdAt,
      title: e.title,
      theme: e.meta.theme || "",
      author: e.meta.author || "",
      level: e.meta.level,
      audience: e.meta.audience,
      sections: Array.isArray(e.report.sections) ? e.report.sections.length : 0,
      words: e.stats?.words || 0,
      pages: e.stats?.pages || 0
    };
  }

  return {
    async list() {
      await ready;
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
      const items = [];
      for (const n of names) {
        try { items.push(summarize(JSON.parse(await fs.readFile(path.join(dir, n), "utf8")))); }
        catch { /* fichier illisible : ignoré */ }
      }
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async get(id) {
      await ready;
      try { return JSON.parse(await fs.readFile(file(id), "utf8")); }
      catch (e) { if (e instanceof NotFoundError || e.code === "ENOENT") throw new NotFoundError("Rapport introuvable."); throw e; }
    },

    async add({ report, meta, stats, createdAt }) {
      await ready;
      const entry = {
        id: Date.now().toString(36) + crypto.randomBytes(4).toString("hex"),
        createdAt: createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt).toISOString() : new Date().toISOString(),
        title: String(report.titre || "Rapport de veille").slice(0, 300),
        meta,
        stats: { words: Number(stats?.words) || 0, pages: Number(stats?.pages) || 0 },
        report
      };
      // Écriture atomique : fichier temporaire puis renommage.
      const tmp = file(entry.id) + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(entry));
      await fs.rename(tmp, file(entry.id));
      return summarize(entry);
    },

    async remove(id) {
      await ready;
      try { await fs.unlink(file(id)); }
      catch (e) { if (e instanceof NotFoundError || e.code === "ENOENT") throw new NotFoundError("Rapport introuvable."); throw e; }
    }
  };
}
