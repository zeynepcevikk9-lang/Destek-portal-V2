export type Severity = "critical" | "warning" | "info" | "none";

export interface AlertGroup {
  key: string;
  source: string;
  namespace: string;
  alertname: string;
  severity: Severity;
  count: number;
  firstSeen: string;
  summary: string;
  instances: string[];
  moreInstances: number;
}

export interface SourceStatus {
  name: string;
  status: "ok" | "error";
  alertCount: number;
  error?: string;
}

export interface CollectResult {
  generatedAt: string;
  sources: SourceStatus[];
  groups: AlertGroup[];
}

export interface TicketDraft {
  title: string;
  description: string;
  team: "it" | "sec";
  priority: "kritik" | "yuksek" | "normal";
}

export async function fetchAlerts(): Promise<CollectResult> {
  const r = await fetch("/api/alerts");
  if (!r.ok) throw new Error(`API hatası (${r.status})`);
  return (await r.json()) as CollectResult;
}

export async function fetchDraft(key: string): Promise<TicketDraft> {
  const r = await fetch("/api/alerts/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (r.status === 404) throw new Error("Bu alarm artık aktif değil, liste yenilendi.");
  if (!r.ok) throw new Error(`API hatası (${r.status})`);
  return (await r.json()) as TicketDraft;
}
