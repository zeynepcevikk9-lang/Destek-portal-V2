import type { JiraResult, JiraSink, TicketInput } from "./types.js";

type Fetch = typeof fetch;

export interface JiraConfig {
  baseUrl: string; // https://<site>.atlassian.net
  email: string;
  token: string; // yalnızca ortam değişkeninden gelir
  projects: { it: string; sec: string };
  issueTypes: { it: string; sec: string };
  priorityMap: Partial<Record<TicketInput["priority"], string>>; // boşsa öncelik gönderilmez
}

/** Deneme modu: ağa HİÇ çıkmaz, "gönderilseydi" sonucunu üretir. */
export class DryRunJiraSink implements JiraSink {
  private n = 0;
  async create(_input: TicketInput, _portalId: string): Promise<JiraResult> {
    this.n += 1;
    return { status: "dry-run", key: `DRY-${this.n}` };
  }
}

/**
 * Jira Cloud'a yalnızca ticket OLUŞTURUR (POST /rest/api/2/issue). v2 seçildi:
 * açıklama düz metin olabilir (v3 ADF belgesi ister).
 * Hata mesajları yalnızca HTTP kodunu içerir; yanıt gövdesi ya da kimlik bilgisi sızdırılmaz.
 */
export class HttpJiraSink implements JiraSink {
  constructor(private readonly cfg: JiraConfig, private readonly doFetch: Fetch = fetch) {}

  async create(input: TicketInput, portalId: string): Promise<JiraResult> {
    const project = this.cfg.projects[input.team];
    const issuetype = this.cfg.issueTypes[input.team];
    const priority = this.cfg.priorityMap[input.priority];
    const body = {
      fields: {
        project: { key: project },
        issuetype: { name: issuetype },
        summary: input.title.slice(0, 250),
        description: `Portal ticket: ${portalId}\n\n${input.description}`,
        labels: ["ops-center", "alarm", `portal-${portalId}`],
        ...(priority ? { priority: { name: priority } } : {}),
      },
    };
    const auth = Buffer.from(`${this.cfg.email}:${this.cfg.token}`).toString("base64");
    try {
      const res = await this.doFetch(`${this.cfg.baseUrl}/rest/api/2/issue`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { status: "failed", error: `Jira HTTP ${res.status}` };
      const data = (await res.json()) as { key?: unknown };
      if (typeof data.key !== "string") return { status: "failed", error: "Jira beklenmeyen yanıt" };
      return { status: "synced", key: data.key, url: `${this.cfg.baseUrl}/browse/${data.key}` };
    } catch (e) {
      return { status: "failed", error: e instanceof Error && e.name === "TimeoutError" ? "Jira zaman aşımı" : "Jira erişilemedi" };
    }
  }
}
