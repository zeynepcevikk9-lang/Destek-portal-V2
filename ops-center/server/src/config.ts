import { parseSeverity } from "./group.js";
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.MODE === "live" ? "live" : "mock"; // varsayılan güvenli: sahte veri
  return {
    mode,
    // Yalnızca yerel makine. Dışarıya açmak bilinçli bir karar olmalı.
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
    sources: mode === "live" ? parseSources(env.SOURCES) : [{ name: "kume-1", url: "" }, { name: "kume-2", url: "" }],
    ignore: new Set((env.IGNORE_ALERTNAMES ?? "Watchdog,InfoInhibitor,MonitoringHeartbeat").split(",").map((s) => s.trim()).filter(Boolean)),
    minSeverity: parseSeverity(env.MIN_SEVERITY ?? "warning"),
    auditLog: env.AUDIT_LOG ?? "./data/audit.log",
  };
}
