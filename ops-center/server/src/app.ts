import Fastify, { type FastifyInstance } from "fastify";
import { pickFetcher, type Fetcher } from "./alertmanager.js";
import type { Config } from "./config.js";
import { makeDraft } from "./draft.js";
import { writeAudit } from "./audit.js";
import { groupAlerts } from "./group.js";
import { DryRunJiraSink, HttpJiraSink } from "./tickets/jira.js";
import { HttpPortalSink, LocalPortalSink } from "./tickets/portal.js";
import { createTicket, idempotencyKeyOf, PortalError, retryJira, type TicketDeps } from "./tickets/service.js";
import { FileTicketStore } from "./tickets/store.js";
import type { TicketRecord } from "./tickets/types.js";
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

/** Yapılandırmadan ticket bağlantılarını kurar. Varsayılan: yerel kayıt + Jira deneme modu. */
export function buildTicketDeps(cfg: Config): TicketDeps {
  const store = new FileTicketStore(cfg.tickets.storePath);
  const portal = cfg.tickets.portalMode === "http"
    ? new HttpPortalSink(cfg.tickets.portalUrl, cfg.tickets.portalToken)
    : new LocalPortalSink(store);
  const jira = cfg.tickets.jira ? new HttpJiraSink(cfg.tickets.jira) : new DryRunJiraSink();
  return { portal, jira, store };
}

/** Arayüze dönen ticket özeti: açıklama ve iç ayrıntı taşımaz. */
function publicTicket(r: TicketRecord, duplicate = false) {
  return { id: r.id, team: r.team, title: r.title, priority: r.priority, createdAt: r.createdAt, duplicate, jira: r.jira };
}

export function buildApp(cfg: Config, fetcher: Fetcher = pickFetcher(cfg), tickets: TicketDeps = buildTicketDeps(cfg)): FastifyInstance {
  const app = Fastify({ logger: false });
  // TODO(kimlik): Keycloak OIDC gelince burası token'dan kullanıcıyı alacak.
  const userOf = (h: Record<string, unknown>) => (typeof h["x-user"] === "string" ? (h["x-user"] as string).slice(0, 64) : "local-dev");

  app.addHook("onSend", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
  });

  app.get("/api/health", async () => ({ ok: true, mode: cfg.mode }));

  // Arayüzün hangi modda çalıştığını bilmesi için. Gizli ayar içermez.
  app.get("/api/config", async () => ({ tickets: { portal: cfg.tickets.portalMode, jira: cfg.tickets.jiraMode } }));

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

  // Ticket aç: yalnızca kullanıcı tuşa basınca çağrılır. Önce portal, sonra Jira.
  app.post<{ Body: { key?: string } }>("/api/tickets", async (req, reply) => {
    const key = req.body?.key;
    if (typeof key !== "string" || key.length > 300) return reply.code(400).send({ error: "key gerekli" });
    const { groups } = await collect(cfg, fetcher);
    const g = groups.find((x) => x.key === key);
    if (!g) return reply.code(404).send({ error: "alarm artık aktif değil" });
    const user = userOf(req.headers);
    try {
      const { record, duplicate } = await createTicket(tickets, {
        ...makeDraft(g), idempotencyKey: idempotencyKeyOf(g.key, g.firstSeen), createdBy: user,
      });
      writeAudit(cfg.auditLog, { user, action: duplicate ? "tickets.duplicate" : "tickets.create", detail: `${record.id} jira=${record.jira.status}` });
      return reply.code(duplicate ? 200 : 201).send(publicTicket(record, duplicate));
    } catch (e) {
      writeAudit(cfg.auditLog, { user, action: "tickets.create.failed", detail: g.alertname });
      return reply.code(e instanceof PortalError ? 502 : 500).send({ error: "Ticket açılamadı, hiçbir kayıt oluşturulmadı." });
    }
  });

  // Jira'ya gidemeyen ticket'ı yeniden dene.
  app.post<{ Params: { id: string } }>("/api/tickets/:id/retry-jira", async (req, reply) => {
    const rec = await retryJira(tickets, req.params.id);
    if (!rec) return reply.code(404).send({ error: "ticket bulunamadı" });
    writeAudit(cfg.auditLog, { user: userOf(req.headers), action: "tickets.retry-jira", detail: `${rec.id} jira=${rec.jira.status}` });
    return publicTicket(rec);
  });

  return app;
}
