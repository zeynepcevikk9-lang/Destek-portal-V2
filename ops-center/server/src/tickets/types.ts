import type { TicketDraft } from "../types.js";

/** Ticket açmak için gereken her şey. Alarmdan üretilen taslağa kimlik anahtarı eklenir. */
export interface TicketInput extends TicketDraft {
  idempotencyKey: string; // aynı alarmdan ikinci ticket açılmasını engeller
  createdBy: string;
}

export interface JiraResult {
  status: "synced" | "failed" | "dry-run";
  key?: string; // Jira anahtarı (dry-run'da DRY-n)
  url?: string;
  error?: string; // kısa ve genel; ayrıntı/gizli bilgi içermez
}

export interface TicketRecord {
  id: string; // portal numarası, ör. BT-1001 / SG-0001
  team: TicketInput["team"];
  title: string;
  description: string;
  priority: TicketInput["priority"];
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
  source: "alarm";
  jira: JiraResult;
}

/** Yeni destek portalı. Asıl kayıt burasıdır. */
export interface PortalSink {
  create(input: TicketInput): Promise<{ id: string }>;
}

export interface JiraSink {
  create(input: TicketInput, portalId: string): Promise<JiraResult>;
}

export interface TicketStore {
  findByKey(idempotencyKey: string): TicketRecord | undefined;
  findById(id: string): TicketRecord | undefined;
  save(record: TicketRecord): void;
  nextSeq(team: TicketInput["team"]): number;
}
