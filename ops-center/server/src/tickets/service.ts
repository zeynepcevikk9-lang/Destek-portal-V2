import { createHash } from "node:crypto";
import type { JiraSink, PortalSink, TicketInput, TicketRecord, TicketStore } from "./types.js";

export interface TicketDeps {
  portal: PortalSink;
  jira: JiraSink;
  store: TicketStore;
}

export class PortalError extends Error {}

/** Aynı alarm (aynı başlangıçla) için hep aynı anahtar: iki kez basılırsa tek ticket. */
export function idempotencyKeyOf(groupKey: string, firstSeen: string): string {
  return createHash("sha256").update(`${groupKey}|${firstSeen}`).digest("hex").slice(0, 24);
}

/**
 * Önce portal (asıl kayıt), sonra Jira. Jira hata verirse ticket KAYBOLMAZ:
 * portalda kalır, jira.status="failed" olur ve tekrar denenebilir.
 */
export async function createTicket(deps: TicketDeps, input: TicketInput): Promise<{ record: TicketRecord; duplicate: boolean }> {
  const existing = deps.store.findByKey(input.idempotencyKey);
  if (existing) return { record: existing, duplicate: true };

  let id: string;
  try {
    id = (await deps.portal.create(input)).id;
  } catch (e) {
    // Portal yoksa hiçbir şey açılmadı; Jira'ya da gönderilmez (tek taraflı kayıt oluşmasın).
    throw new PortalError(e instanceof Error ? e.message.slice(0, 80) : "Portal erişilemedi");
  }

  const jira = await deps.jira.create(input, id);
  const record: TicketRecord = {
    id, team: input.team, title: input.title, description: input.description, priority: input.priority,
    idempotencyKey: input.idempotencyKey, createdBy: input.createdBy, createdAt: new Date().toISOString(),
    source: "alarm", jira,
  };
  deps.store.save(record);
  return { record, duplicate: false };
}

/** Jira'ya gönderilemeyen ticket'ı yeniden dener. Portal kaydı değişmez. */
export async function retryJira(deps: TicketDeps, id: string): Promise<TicketRecord | undefined> {
  const rec = deps.store.findById(id);
  if (!rec) return undefined;
  if (rec.jira.status === "synced") return rec; // zaten gönderilmiş, ikinci kez açma
  const input: TicketInput = {
    title: rec.title, description: rec.description, team: rec.team, priority: rec.priority,
    idempotencyKey: rec.idempotencyKey, createdBy: rec.createdBy,
  };
  const updated: TicketRecord = { ...rec, jira: await deps.jira.create(input, rec.id) };
  deps.store.save(updated);
  return updated;
}
