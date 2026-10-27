import type { AlertGroup, RawAlert, Severity } from "./types.js";

const RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1, none: 0 };
export const MAX_INSTANCES = 8;
const INSTANCE_LABELS = ["pod", "instance", "name", "deployment", "service", "job"] as const;

export function parseSeverity(v: string | undefined): Severity {
  const s = (v ?? "").toLowerCase();
  if (s === "critical" || s === "warning" || s === "info" || s === "none") return s;
  return "info"; // bilinmeyen = düşük; aksiyon listesine girmesin
}

export interface GroupOptions {
  ignore: ReadonlySet<string>; // yok sayılan alarm adları (Watchdog gibi)
  minSeverity: Severity; // bunun altındakiler gösterilmez
}

function instanceOf(a: RawAlert): string {
  for (const k of INSTANCE_LABELS) {
    const v = a.labels[k];
    if (v) return v;
  }
  return "-";
}

function trim(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/**
 * Aynı kaynak + namespace + alarm adı olanları tek satırda toplar (Alertmanager'ın
 * gruplamasıyla aynı mantık). Aksiyon gerektirmeyenleri (gürültü) eler.
 */
export function groupAlerts(source: string, alerts: RawAlert[], opts: GroupOptions): AlertGroup[] {
  const map = new Map<string, AlertGroup & { _inst: Set<string> }>();

  for (const a of alerts) {
    if (a.status?.state && a.status.state !== "active") continue;
    const alertname = a.labels.alertname ?? "(adsız)";
    if (opts.ignore.has(alertname)) continue;
    const sev = parseSeverity(a.labels.severity);
    if (RANK[sev] < RANK[opts.minSeverity]) continue;

    const namespace = a.labels.namespace || "-";
    const key = `${source}|${namespace}|${alertname}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key, source, namespace, alertname, severity: sev, count: 0,
        firstSeen: a.startsAt,
        summary: trim(a.annotations?.summary ?? a.annotations?.description ?? alertname, 200),
        instances: [], moreInstances: 0, _inst: new Set(),
      };
      map.set(key, g);
    }
    g.count += 1;
    if (RANK[sev] > RANK[g.severity]) g.severity = sev;
    if (a.startsAt < g.firstSeen) g.firstSeen = a.startsAt;
    g._inst.add(instanceOf(a));
  }

  const out: AlertGroup[] = [];
  for (const g of map.values()) {
    const all = [...g._inst].sort();
    const { _inst, ...rest } = g;
    void _inst;
    out.push({ ...rest, instances: all.slice(0, MAX_INSTANCES), moreInstances: Math.max(0, all.length - MAX_INSTANCES) });
  }
  return out.sort(
    (x, y) => RANK[y.severity] - RANK[x.severity] || y.count - x.count || x.firstSeen.localeCompare(y.firstSeen),
  );
}
