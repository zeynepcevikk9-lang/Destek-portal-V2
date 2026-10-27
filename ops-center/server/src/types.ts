export type Severity = "critical" | "warning" | "info" | "none";

/** Alertmanager /api/v2/alerts yanıtından yalnızca kullandığımız alanlar. */
export interface RawAlert {
  fingerprint?: string;
  startsAt: string;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  status?: { state?: string };
}

/**
 * Arayüze giden TEK alarm biçimi. Bilerek az veri taşır: ham etiket listesi,
 * generatorURL (iç Prometheus adresi) ve fingerprint dışarı verilmez.
 */
export interface AlertGroup {
  key: string; // kaynak|namespace|alarm adı
  source: string; // ör. "kume-1"
  namespace: string; // "-" ise namespace etiketi yok
  alertname: string;
  severity: Severity;
  count: number;
  firstSeen: string; // en eski başlangıç
  summary: string;
  instances: string[]; // en çok MAX_INSTANCES adet
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
