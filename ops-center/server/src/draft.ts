import type { AlertGroup, TicketDraft } from "./types.js";

const SECURITY_HINT = /security|wazuh|falco|siber|güvenlik|guvenlik|intrusion/i;

/**
 * Alarmdan ticket TASLAĞI üretir. Hiçbir yere kayıt açmaz; kullanıcı taslağı
 * görüp kendisi karar verir (otomatik ticket yok).
 */
export function makeDraft(g: AlertGroup): TicketDraft {
  const team = SECURITY_HINT.test(`${g.alertname} ${g.namespace}`) ? "sec" : "it";
  const priority = g.severity === "critical" ? "kritik" : "normal";
  const where = g.namespace !== "-" ? g.namespace : g.source;
  const lines = [
    `Alarm: ${g.alertname}`,
    `Ortam: ${g.source}${g.namespace !== "-" ? ` / ${g.namespace}` : ""}`,
    `Önem: ${g.severity === "critical" ? "Kritik" : "Uyarı"}`,
    `Adet: ${g.count}`,
    `İlk görülme: ${g.firstSeen}`,
    `Özet: ${g.summary}`,
  ];
  if (g.instances.length) {
    lines.push(`Etkilenenler: ${g.instances.join(", ")}${g.moreInstances ? ` (+${g.moreInstances} daha)` : ""}`);
  }
  return { title: `${g.alertname} — ${where}`, description: lines.join("\n"), team, priority };
}
