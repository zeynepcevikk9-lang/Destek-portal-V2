import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Config, SourceDef } from "./config.js";
import type { RawAlert } from "./types.js";

export type Fetcher = (source: SourceDef) => Promise<RawAlert[]>;

/**
 * Canlı: Alertmanager v2 API'sinden YALNIZCA okur (GET). Susturulmuş ve
 * engellenmiş alarmlar sorguda zaten dışarıda bırakılır.
 */
export const liveFetcher: Fetcher = async (source) => {
  const url = `${source.url}/api/v2/alerts?active=true&silenced=false&inhibited=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("beklenmeyen yanıt biçimi");
  return data as RawAlert[];
};

/** Sahte veri: depoya gerçek bir şey girmez; geliştirme ve test için. */
export const mockFetcher: Fetcher = async (source) => {
  const file = fileURLToPath(new URL(`./fixtures/alerts.${source.name}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, "utf8")) as RawAlert[];
};

export function pickFetcher(cfg: Config): Fetcher {
  return cfg.mode === "live" ? liveFetcher : mockFetcher;
}
