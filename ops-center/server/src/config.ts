import { parseSeverity } from "./group.js";
import type { JiraConfig } from "./tickets/jira.js";
import type { Severity } from "./types.js";

export interface SourceDef {
  name: string;
  url: string; // Alertmanager taban adresi
}

export interface Config {
  mode: "mock" | "live";
  host: string;
  port: number;
  sources: SourceDef[];
  ignore: Set<string>;
  minSeverity: Severity;
  auditLog: string;
  tickets: {
    portalMode: "local" | "http"; // local: yerel kayıt (geliştirme); http: yeni portalın API'si
    portalUrl: string;
    portalToken: string | undefined;
    jiraMode: "dry-run" | "live"; // dry-run: Jira'ya HİÇBİR ŞEY gönderilmez
    jira: JiraConfig | undefined; // yalnızca jiraMode=live iken dolu
    storePath: string;
  };
}

/** "kume-1=http://127.0.0.1:9093,kume-2=http://127.0.0.1:9094" */
export function parseSources(v: string | undefined): SourceDef[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf("=");
      if (i < 1) throw new Error(`SOURCES biçimi hatalı: "${s}" (ad=url bekleniyor)`);
      return { name: s.slice(0, i).trim(), url: s.slice(i + 1).trim().replace(/\/+$/, "") };
    });
}

/** "kritik=Highest,yuksek=High" → { kritik: "Highest", yuksek: "High" } */
export function parsePriorityMap(v: string | undefined): JiraConfig["priorityMap"] {
  const out: JiraConfig["priorityMap"] = {};
  for (const part of (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...rest] = part.split("=");
    const val = rest.join("=").trim();
    if ((k === "kritik" || k === "yuksek" || k === "normal") && val) out[k] = val;
  }
  return out;
}

/**
 * Canlı Jira için zorunlu ayarlar. Eksik varsa AÇILMADAN hata verir; hata yalnızca
 * eksik ayarın ADINI söyler, değer yazmaz.
 */
export function loadJiraConfig(env: NodeJS.ProcessEnv): JiraConfig {
  const need = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_IT", "JIRA_PROJECT_SEC", "JIRA_ISSUETYPE_IT", "JIRA_ISSUETYPE_SEC"] as const;
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`JIRA_MODE=live için eksik ayar: ${missing.join(", ")}`);
  const baseUrl = env.JIRA_BASE_URL!.replace(/\/+$/, "");
  if (!baseUrl.startsWith("https://")) throw new Error("JIRA_BASE_URL https:// ile başlamalı");
  return {
    baseUrl,
    email: env.JIRA_EMAIL!,
    token: env.JIRA_API_TOKEN!,
    projects: { it: env.JIRA_PROJECT_IT!, sec: env.JIRA_PROJECT_SEC! },
    issueTypes: { it: env.JIRA_ISSUETYPE_IT!, sec: env.JIRA_ISSUETYPE_SEC! },
    priorityMap: parsePriorityMap(env.JIRA_PRIORITY_MAP),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.MODE === "live" ? "live" : "mock"; // varsayılan güvenli: sahte veri
  const jiraMode = env.JIRA_MODE === "live" ? "live" : "dry-run"; // varsayılan güvenli: gönderme
  const portalMode = env.PORTAL_MODE === "http" ? "http" : "local";
  if (portalMode === "http" && !env.PORTAL_URL) throw new Error("PORTAL_MODE=http için PORTAL_URL gerekli");
  return {
    mode,
    // Yalnızca yerel makine. Dışarıya açmak bilinçli bir karar olmalı.
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
    sources: mode === "live" ? parseSources(env.SOURCES) : [{ name: "kume-1", url: "" }, { name: "kume-2", url: "" }],
    ignore: new Set((env.IGNORE_ALERTNAMES ?? "Watchdog,InfoInhibitor,MonitoringHeartbeat").split(",").map((s) => s.trim()).filter(Boolean)),
    minSeverity: parseSeverity(env.MIN_SEVERITY ?? "warning"),
    auditLog: env.AUDIT_LOG ?? "./data/audit.log",
    tickets: {
      portalMode,
      portalUrl: (env.PORTAL_URL ?? "").replace(/\/+$/, ""),
      portalToken: env.PORTAL_TOKEN || undefined,
      jiraMode,
      jira: jiraMode === "live" ? loadJiraConfig(env) : undefined,
      storePath: env.TICKET_STORE ?? "./data/tickets.json",
    },
  };
}
