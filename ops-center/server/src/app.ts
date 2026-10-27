import Fastify, { type FastifyInstance } from "fastify";
import { pickFetcher, type Fetcher } from "./alertmanager.js";
import type { Config } from "./config.js";
import { makeDraft } from "./draft.js";
import { writeAudit } from "./audit.js";
import { groupAlerts } from "./group.js";
import type { CollectResult, SourceStatus } from "./types.js";

/** Her kaynağı ayrı okur: biri çökerse diğerleri yine gösterilir. */
export async function collect(cfg: Config, fetcher: Fetcher): Promise<CollectResult> {
  const sources: SourceStatus[] = [];
  const groups: CollectResult["groups"] = [];
  await Promise.all(
    cfg.sources.map(async (s) => {
      try {
        const raw = await fetcher(s);
        const g = groupAlerts(s.name, raw, { ignore: cfg.ignore, minSeverity: cfg.minSeverity });
        groups.push(...g);
        sources.push({ name: s.name, status: "ok", alertCount: g.reduce((n, x) => n + x.count, 0) });
      } catch (e) {
        // Hata metninde adres/ayrıntı sızdırma: kısa ve genel.
        sources.push({ name: s.name, status: "error", alertCount: 0, error: e instanceof Error ? e.message.slice(0, 80) : "erişilemedi" });
      }
    }),
  );
  sources.sort((a, b) => a.name.localeCompare(b.name));
  return { generatedAt: new Date().toISOString(), sources, groups };
}

export function buildApp(cfg: Config, fetcher: Fetcher = pickFetcher(cfg)): FastifyInstance {
  const app = Fastify({ logger: false });
  // TODO(kimlik): Keycloak OIDC gelince burası token'dan kullanıcıyı alacak.
  const userOf = (h: Record<string, unknown>) => (typeof h["x-user"] === "string" ? (h["x-user"] as string).slice(0, 64) : "local-dev");

  app.addHook("onSend", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
  });

  app.get("/api/health", async () => ({ ok: true, mode: cfg.mode }));

  app.get("/api/alerts", async (req) => {
    writeAudit(cfg.auditLog, { user: userOf(req.headers), action: "alerts.list" });
    return collect(cfg, fetcher);
  });

  // Taslak: hiçbir yere kayıt açmaz, yalnızca metin üretir.
  app.post<{ Body: { key?: string } }>("/api/alerts/draft", async (req, reply) => {
    const key = req.body?.key;
    if (typeof key !== "string" || key.length > 300) return reply.code(400).send({ error: "key gerekli" });
    const { groups } = await collect(cfg, fetcher);
    const g = groups.find((x) => x.key === key);
    if (!g) return reply.code(404).send({ error: "alarm artık aktif değil" });
    writeAudit(cfg.auditLog, { user: userOf(req.headers), action: "alerts.draft", detail: g.alertname });
    return makeDraft(g);
  });

  return app;
}
