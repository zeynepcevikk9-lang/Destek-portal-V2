import { describe, expect, it, vi } from "vitest";
import { mockFetcher } from "../alertmanager.js";
import { buildApp } from "../app.js";
import { loadConfig, loadJiraConfig, parsePriorityMap } from "../config.js";
import { DryRunJiraSink, HttpJiraSink, type JiraConfig } from "./jira.js";
import { HttpPortalSink, LocalPortalSink, portalId } from "./portal.js";
import { createTicket, idempotencyKeyOf, PortalError, retryJira, type TicketDeps } from "./service.js";
import { MemoryTicketStore } from "./store.js";
import type { JiraResult, JiraSink, PortalSink, TicketInput } from "./types.js";

const SECRET_TOKEN = "SAHTE-TOKEN-asla-sizmamali-123";

const input = (over: Partial<TicketInput> = {}): TicketInput => ({
  title: "KubePodNotReady — demo-app", description: "Alarm: KubePodNotReady", team: "it", priority: "normal",
  idempotencyKey: "anahtar-1", createdBy: "test", ...over,
});

const jiraCfg: JiraConfig = {
  baseUrl: "https://ornek.atlassian.invalid", email: "kisi@ornek.invalid", token: SECRET_TOKEN,
  projects: { it: "IT", sec: "SEC" }, issueTypes: { it: "Talep", sec: "Olay" }, priorityMap: { kritik: "Highest" },
};

function deps(jira: JiraSink = new DryRunJiraSink(), portal?: PortalSink): TicketDeps {
  const store = new MemoryTicketStore();
  return { store, jira, portal: portal ?? new LocalPortalSink(store) };
}

describe("portal numarası", () => {
  it("BT 1001'den, SG 0001'den başlar", () => {
    expect(portalId("it", 1)).toBe("BT-1001");
    expect(portalId("sec", 1)).toBe("SG-0001");
    expect(portalId("sec", 81)).toBe("SG-0081");
  });
});

describe("createTicket", () => {
  it("önce portala, sonra Jira'ya açar ve ikisini ilişkilendirir", async () => {
    const d = deps();
    const { record, duplicate } = await createTicket(d, input());
    expect(duplicate).toBe(false);
    expect(record.id).toBe("BT-1001");
    expect(record.jira).toEqual({ status: "dry-run", key: "DRY-1" });
    expect(d.store.findById("BT-1001")).toBeDefined();
  });

  it("aynı alarmdan ikinci kez basılırsa yeni ticket AÇMAZ", async () => {
    const d = deps();
    const a = await createTicket(d, input());
    const b = await createTicket(d, input());
    expect(b.duplicate).toBe(true);
    expect(b.record.id).toBe(a.record.id);
    expect(d.store.nextSeq("it")).toBe(2); // sayaç ilerlemedi: ikinci numara üretilmedi
  });

  it("Jira hata verirse ticket KAYBOLMAZ, 'failed' olarak kalır; tekrar denenince tamamlanır", async () => {
    const failing: JiraResult[] = [{ status: "failed", error: "Jira HTTP 503" }, { status: "synced", key: "IT-7" }];
    const jira: JiraSink = { create: vi.fn(async () => failing.shift()!) };
    const d = deps(jira);
    const { record } = await createTicket(d, input());
    expect(record.jira.status).toBe("failed");
    expect(d.store.findById(record.id)?.jira.error).toBe("Jira HTTP 503");

    const retried = await retryJira(d, record.id);
    expect(retried?.jira).toMatchObject({ status: "synced", key: "IT-7" });
    expect(retried?.id).toBe(record.id); // portal kaydı değişmedi

    await retryJira(d, record.id); // zaten gönderilmiş: ikinci kez Jira'ya gitmemeli
    expect(jira.create).toHaveBeenCalledTimes(2);
  });

  it("portal çalışmazsa hiçbir şey açılmaz, Jira'ya da gönderilmez", async () => {
    const jira: JiraSink = { create: vi.fn() };
    const portal: PortalSink = { create: async () => { throw new Error("Portal HTTP 500"); } };
    const d = deps(jira, portal);
    await expect(createTicket(d, input())).rejects.toBeInstanceOf(PortalError);
    expect(jira.create).not.toHaveBeenCalled();
    expect(d.store.findByKey("anahtar-1")).toBeUndefined();
  });

  it("idempotency anahtarı sabittir ve alarmın başlangıcı değişince değişir", () => {
    expect(idempotencyKeyOf("a|b|c", "2026-01-01T00:00:00Z")).toBe(idempotencyKeyOf("a|b|c", "2026-01-01T00:00:00Z"));
    expect(idempotencyKeyOf("a|b|c", "2026-01-01T00:00:00Z")).not.toBe(idempotencyKeyOf("a|b|c", "2026-01-02T00:00:00Z"));
  });
});

describe("HttpJiraSink (sahte ağ)", () => {
  function fakeFetch(res: { status: number; body?: unknown } | Error) {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (res instanceof Error) throw res;
      return new Response(JSON.stringify(res.body ?? {}), { status: res.status });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("doğru adrese, doğru kimlikle ve doğru alanlarla yalnızca POST atar", async () => {
    const { f, calls } = fakeFetch({ status: 201, body: { key: "SEC-9" } });
    const out = await new HttpJiraSink(jiraCfg, f).create(input({ team: "sec", priority: "kritik" }), "SG-0001");
    expect(out).toEqual({ status: "synced", key: "SEC-9", url: "https://ornek.atlassian.invalid/browse/SEC-9" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ornek.atlassian.invalid/rest/api/2/issue");
    expect(calls[0]!.init.method).toBe("POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from(`kisi@ornek.invalid:${SECRET_TOKEN}`).toString("base64")}`);
    const body = JSON.parse(calls[0]!.init.body as string).fields;
    expect(body.project).toEqual({ key: "SEC" });
    expect(body.issuetype).toEqual({ name: "Olay" });
    expect(body.priority).toEqual({ name: "Highest" });
    expect(body.labels).toContain("portal-SG-0001");
    expect(body.description.startsWith("Portal ticket: SG-0001")).toBe(true);
  });

  it("öncelik eşlemesi yoksa öncelik alanı hiç gönderilmez; başlık 250 karakterle sınırlanır", async () => {
    const { f, calls } = fakeFetch({ status: 201, body: { key: "IT-1" } });
    await new HttpJiraSink(jiraCfg, f).create(input({ priority: "normal", title: "x".repeat(400) }), "BT-1001");
    const fields = JSON.parse(calls[0]!.init.body as string).fields;
    expect(fields).not.toHaveProperty("priority");
    expect(fields.summary).toHaveLength(250);
  });

  it("hata yanıtlarında token ya da gövde SIZMAZ, yalnızca kısa durum döner", async () => {
    for (const res of [{ status: 400, body: { errorMessages: [`kimlik ${SECRET_TOKEN}`] } }, new Error(`bağlantı ${SECRET_TOKEN}`)]) {
      const { f } = fakeFetch(res);
      const out = await new HttpJiraSink(jiraCfg, f).create(input(), "BT-1001");
      expect(out.status).toBe("failed");
      expect(JSON.stringify(out)).not.toContain(SECRET_TOKEN);
    }
  });
});

describe("HttpPortalSink (sahte ağ)", () => {
  it("sözleşmeye uygun gövde gönderir; yanıtta id yoksa hata verir", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const ok = (async (url: string, init: RequestInit) => { sent = { url, init }; return new Response(JSON.stringify({ id: "BT-1500" }), { status: 201 }); }) as unknown as typeof fetch;
    const out = await new HttpPortalSink("https://portal.ornek.invalid", "tok", ok).create(input());
    expect(out.id).toBe("BT-1500");
    expect(sent!.url).toBe("https://portal.ornek.invalid/api/tickets");
    expect((sent!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(sent!.init.body as string)).toMatchObject({ source: "alarm", externalRef: "anahtar-1", team: "it" });

    const bad = (async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    await expect(new HttpPortalSink("https://p.invalid", undefined, bad).create(input())).rejects.toThrow();
    const down = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(new HttpPortalSink("https://p.invalid", undefined, down).create(input())).rejects.toThrow("Portal HTTP 500");
  });
});

describe("ayarlar", () => {
  it("varsayılan: yerel portal + Jira deneme modu (hiçbir şey gönderilmez)", () => {
    const c = loadConfig({});
    expect(c.tickets).toMatchObject({ portalMode: "local", jiraMode: "dry-run", jira: undefined });
  });

  it("JIRA_MODE=live için eksik ayarlar listelenir, ama değer ya da token yazılmaz", () => {
    expect(() => loadConfig({ JIRA_MODE: "live", JIRA_API_TOKEN: SECRET_TOKEN })).toThrow(/JIRA_BASE_URL/);
    try { loadConfig({ JIRA_MODE: "live", JIRA_API_TOKEN: SECRET_TOKEN }); } catch (e) { expect(String(e)).not.toContain(SECRET_TOKEN); }
  });

  it("JIRA_BASE_URL https olmalı; tam ayarla canlı yapılandırma kurulur", () => {
    const env = { JIRA_BASE_URL: "http://x.invalid", JIRA_EMAIL: "a@b.invalid", JIRA_API_TOKEN: "t", JIRA_PROJECT_IT: "IT", JIRA_PROJECT_SEC: "SEC", JIRA_ISSUETYPE_IT: "T", JIRA_ISSUETYPE_SEC: "O" };
    expect(() => loadJiraConfig(env)).toThrow(/https/);
    expect(loadJiraConfig({ ...env, JIRA_BASE_URL: "https://x.invalid/", JIRA_PRIORITY_MAP: "kritik=Highest, yuksek=High, bos=" }))
      .toMatchObject({ baseUrl: "https://x.invalid", priorityMap: { kritik: "Highest", yuksek: "High" } });
  });

  it("öncelik eşlemesi bilinmeyen ve boş girdileri yok sayar", () => {
    expect(parsePriorityMap("kritik=Highest,foo=Bar,normal=")).toEqual({ kritik: "Highest" });
  });

  it("PORTAL_MODE=http için PORTAL_URL zorunlu", () => {
    expect(() => loadConfig({ PORTAL_MODE: "http" })).toThrow(/PORTAL_URL/);
  });
});

describe("API: ticket aç", () => {
  const cfg = loadConfig({ MODE: "mock", AUDIT_LOG: "./data/test-audit.log" });

  async function firstKey(app: ReturnType<typeof buildApp>): Promise<string> {
    const list = (await app.inject({ method: "GET", url: "/api/alerts" })).json() as { groups: { key: string }[] };
    return list.groups[0]!.key;
  }

  it("201 döner, ikinci basışta 200 + duplicate; yanıt açıklama ve gizli ayar taşımaz", async () => {
    const app = buildApp(cfg, mockFetcher, deps());
    const key = await firstKey(app);
    const first = await app.inject({ method: "POST", url: "/api/tickets", payload: { key } });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ id: "BT-1001", duplicate: false, jira: { status: "dry-run" } });
    expect(first.body).not.toContain("description");
    const again = await app.inject({ method: "POST", url: "/api/tickets", payload: { key } });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ id: "BT-1001", duplicate: true });
    await app.close();
  });

  it("portal çalışmazsa 502 ve genel mesaj döner", async () => {
    const portal: PortalSink = { create: async () => { throw new Error("Portal HTTP 500 iç-ayrıntı"); } };
    const app = buildApp(cfg, mockFetcher, deps(new DryRunJiraSink(), portal));
    const res = await app.inject({ method: "POST", url: "/api/tickets", payload: { key: await firstKey(app) } });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("iç-ayrıntı");
    await app.close();
  });

  it("geçersiz anahtar 400/404, bilinmeyen ticket yeniden denemesi 404", async () => {
    const app = buildApp(cfg, mockFetcher, deps());
    expect((await app.inject({ method: "POST", url: "/api/tickets", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/tickets", payload: { key: "yok|yok|yok" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/tickets/YOK-1/retry-jira" })).statusCode).toBe(404);
    await app.close();
  });

  it("/api/config yalnızca modları söyler", async () => {
    const app = buildApp(cfg, mockFetcher, deps());
    const res = await app.inject({ method: "GET", url: "/api/config" });
    expect(res.json()).toEqual({ tickets: { portal: "local", jira: "dry-run" } });
    await app.close();
  });
});
