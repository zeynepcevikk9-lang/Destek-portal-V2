import { describe, expect, it } from "vitest";
import { mockFetcher } from "./alertmanager.js";
import { buildApp, collect } from "./app.js";
import { loadConfig, parseSources } from "./config.js";
import { makeDraft } from "./draft.js";
import { groupAlerts } from "./group.js";
import type { RawAlert } from "./types.js";

const cfg = { ...loadConfig({ MODE: "mock", AUDIT_LOG: "./data/test-audit.log" }) };
const opts = { ignore: new Set(["Watchdog", "InfoInhibitor", "MonitoringHeartbeat"]), minSeverity: "warning" as const };

const a = (alertname: string, severity: string, extra: Record<string, string> = {}, startsAt = "2026-10-27T08:00:00Z"): RawAlert => ({
  startsAt,
  labels: { alertname, severity, ...extra },
  annotations: { summary: `${alertname} özeti` },
  status: { state: "active" },
});

describe("groupAlerts", () => {
  it("gürültüyü eler: Watchdog, bilgi seviyesi, pasif alarmlar", () => {
    const out = groupAlerts("kume-1", [a("Watchdog", "none"), a("Foo", "info"), { ...a("Bar", "warning"), status: { state: "suppressed" } }, a("Baz", "warning")], opts);
    expect(out.map((g) => g.alertname)).toEqual(["Baz"]);
  });

  it("aynı kaynak+namespace+alarm adını tek satırda toplar ve sayar", () => {
    const out = groupAlerts("kume-1", [a("PodNotReady", "warning", { namespace: "x", pod: "p1" }), a("PodNotReady", "warning", { namespace: "x", pod: "p2" })], opts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ count: 2, namespace: "x", instances: ["p1", "p2"] });
  });

  it("aynı alarm adı farklı namespace'te ayrı satır olur", () => {
    const out = groupAlerts("kume-1", [a("PodNotReady", "warning", { namespace: "x" }), a("PodNotReady", "warning", { namespace: "y" })], opts);
    expect(out).toHaveLength(2);
  });

  it("grubun önemi en yüksek olan, ilk görülme en eski olandır", () => {
    const out = groupAlerts("kume-1", [a("X", "warning", { namespace: "n" }, "2026-10-27T08:00:00Z"), a("X", "critical", { namespace: "n" }, "2026-10-27T07:00:00Z")], opts);
    expect(out[0]).toMatchObject({ severity: "critical", firstSeen: "2026-10-27T07:00:00Z" });
  });

  it("etkilenen listesini 8 ile sınırlar ve kalanı sayar", () => {
    const many = Array.from({ length: 12 }, (_, i) => a("X", "warning", { namespace: "n", pod: `p${String(i).padStart(2, "0")}` }));
    const [g] = groupAlerts("kume-1", many, opts);
    expect(g?.instances).toHaveLength(8);
    expect(g?.moreInstances).toBe(4);
  });

  it("kritik önce, sonra adedi çok olan gelir", () => {
    const out = groupAlerts("kume-1", [a("W1", "warning", { namespace: "n" }), a("W2", "warning", { namespace: "n" }), a("W2", "warning", { namespace: "n", pod: "b" }), a("C1", "critical", { namespace: "n" })], opts);
    expect(out.map((g) => g.alertname)).toEqual(["C1", "W2", "W1"]);
  });
});

describe("makeDraft", () => {
  it("kritikse öncelik kritik, güvenlik ipucu varsa ekip siber", () => {
    const [g] = groupAlerts("kume-1", [a("WazuhBruteForce", "critical", { namespace: "n" })], opts);
    expect(makeDraft(g!)).toMatchObject({ team: "sec", priority: "kritik" });
  });
  it("uyarı için normal öncelik ve BT ekibi, açıklamada etkilenenler yer alır", () => {
    const [g] = groupAlerts("kume-1", [a("PodNotReady", "warning", { namespace: "n", pod: "p1" })], opts);
    const d = makeDraft(g!);
    expect(d).toMatchObject({ team: "it", priority: "normal" });
    expect(d.description).toContain("p1");
    expect(d.title).toBe("PodNotReady — n");
  });
});

describe("config", () => {
  it("SOURCES ayrıştırılır; hatalı biçim hata verir", () => {
    expect(parseSources("a=http://x:1/, b=http://y:2")).toEqual([{ name: "a", url: "http://x:1" }, { name: "b", url: "http://y:2" }]);
    expect(() => parseSources("bozuk")).toThrow();
  });
  it("varsayılan mod sahte veridir ve yalnızca yerel makinede dinler", () => {
    const c = loadConfig({});
    expect(c.mode).toBe("mock");
    expect(c.host).toBe("127.0.0.1");
  });
});

describe("API (sahte veriyle)", () => {
  it("29 alarm 5 satıra iner, gürültü görünmez, ikinci ortam sağlıklı ama boş", async () => {
    const r = await collect(cfg, mockFetcher);
    const demo = r.groups.filter((g) => g.namespace === "demo-app");
    expect(demo).toHaveLength(5);
    expect(demo.reduce((n, g) => n + g.count, 0)).toBe(29);
    expect(r.groups.some((g) => g.alertname === "Watchdog")).toBe(false);
    expect(r.sources.find((s) => s.name === "kume-2")).toMatchObject({ status: "ok", alertCount: 0 });
  });

  it("bir kaynak çökerse diğeri yine gösterilir", async () => {
    const r = await collect(cfg, async (s) => {
      if (s.name === "kume-2") throw new Error("HTTP 503");
      return mockFetcher(s);
    });
    expect(r.sources.find((s) => s.name === "kume-2")).toMatchObject({ status: "error", error: "HTTP 503" });
    expect(r.groups.length).toBeGreaterThan(0);
  });

  it("yanıt ham etiket, fingerprint ve iç adres alanı taşımaz", async () => {
    const app = buildApp(cfg);
    const res = await app.inject({ method: "GET", url: "/api/alerts" });
    const body = res.body;
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    for (const forbidden of ["fingerprint", "generatorURL", "labels", "annotations"]) expect(body).not.toContain(forbidden);
    await app.close();
  });

  it("taslak üretir, hiçbir kayıt açmaz; bilinmeyen anahtar 404, eksik anahtar 400 verir", async () => {
    const app = buildApp(cfg);
    const list = (await app.inject({ method: "GET", url: "/api/alerts" })).json() as { groups: { key: string }[] };
    const ok = await app.inject({ method: "POST", url: "/api/alerts/draft", payload: { key: list.groups[0]!.key } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toHaveProperty("title");
    expect((await app.inject({ method: "POST", url: "/api/alerts/draft", payload: { key: "yok|yok|yok" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/alerts/draft", payload: {} })).statusCode).toBe(400);
    await app.close();
  });
});
