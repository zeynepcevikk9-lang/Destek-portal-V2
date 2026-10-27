import type { PortalSink, TicketInput, TicketStore } from "./types.js";

type Fetch = typeof fetch;

/** Portal numarası: BT-1001, SG-0001 (BT 1000'den, Siber 1'den başlar). */
export function portalId(team: TicketInput["team"], n: number): string {
  return team === "sec" ? `SG-${String(n).padStart(4, "0")}` : `BT-${1000 + n}`;
}

/**
 * Yeni portal henüz yok: geliştirme için yerel kayıt. Numarayı kendisi üretir,
 * asıl kaydı (TicketRecord) servis katmanı saklar.
 */
export class LocalPortalSink implements PortalSink {
  constructor(private readonly store: TicketStore) {}
  async create(input: TicketInput): Promise<{ id: string }> {
    return { id: portalId(input.team, this.store.nextSeq(input.team)) };
  }
}

/**
 * Yeni portalın API'si hazır olunca kullanılacak. Sözleşme docs/ENTEGRASYON.md içinde.
 * İstek: POST {baseUrl}/api/tickets, yanıt: { id: "BT-1001" }
 */
export class HttpPortalSink implements PortalSink {
  constructor(private readonly baseUrl: string, private readonly token: string | undefined, private readonly doFetch: Fetch = fetch) {}
  async create(input: TicketInput): Promise<{ id: string }> {
    const res = await this.doFetch(`${this.baseUrl}/api/tickets`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify({
        title: input.title, description: input.description, team: input.team, priority: input.priority,
        source: "alarm", externalRef: input.idempotencyKey, createdBy: input.createdBy,
      }),
    });
    if (!res.ok) throw new Error(`Portal HTTP ${res.status}`);
    const data = (await res.json()) as { id?: unknown };
    if (typeof data.id !== "string" || !data.id) throw new Error("Portal beklenmeyen yanıt");
    return { id: data.id };
  }
}
