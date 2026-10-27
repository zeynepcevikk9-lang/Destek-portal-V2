import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAlerts, fetchDraft, type AlertGroup, type CollectResult, type Severity, type TicketDraft } from "./api";

const RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1, none: 0 };
const SEV_LABEL: Record<Severity, string> = { critical: "Kritik", warning: "Uyarı", info: "Bilgi", none: "-" };
const REFRESH_MS = 30_000;

/** Satır: tek bir alarm grubu ya da (namespace modunda) bir ortamın tüm alarmları. */
interface Row {
  id: string;
  title: string;
  sub: string;
  severity: Severity;
  count: number;
  alarms: number;
  firstSeen: string;
  place: string;
  members: AlertGroup[];
}

function toRows(groups: AlertGroup[], byNamespace: boolean): Row[] {
  if (!byNamespace) {
    return groups.map((g) => ({
      id: g.key, title: g.alertname, sub: g.summary, severity: g.severity, count: g.count, alarms: 1,
      firstSeen: g.firstSeen, place: g.namespace === "-" ? g.source : `${g.source} / ${g.namespace}`, members: [g],
    }));
  }
  const map = new Map<string, AlertGroup[]>();
  for (const g of groups) {
    const k = `${g.source}|${g.namespace}`;
    map.set(k, [...(map.get(k) ?? []), g]);
  }
  return [...map.entries()].map(([k, members]) => {
    const first = members[0]!;
    const sev = members.reduce<Severity>((m, g) => (RANK[g.severity] > RANK[m] ? g.severity : m), "none");
    const names = members.map((m) => m.alertname);
    return {
      id: k,
      title: first.namespace === "-" ? `${first.source} (genel)` : first.namespace,
      sub: `${members.length} farklı alarm: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`,
      severity: sev,
      count: members.reduce((n, g) => n + g.count, 0),
      alarms: members.length,
      firstSeen: members.map((m) => m.firstSeen).sort()[0]!,
      place: first.source,
      members,
    };
  }).sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.count - a.count);
}

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} sa`;
  return `${Math.round(h / 24)} gün`;
}

export function App() {
  const [data, setData] = useState<CollectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sev, setSev] = useState<"all" | "critical" | "warning">("all");
  const [source, setSource] = useState("all");
  const [byNs, setByNs] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const [draft, setDraft] = useState<{ ok: true; d: TicketDraft; of: string } | { ok: false; msg: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setData(await fetchAlerts());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const rows = useMemo(() => {
    const groups = (data?.groups ?? []).filter((g) => (sev === "all" || g.severity === sev) && (source === "all" || g.source === source));
    return toRows(groups, byNs);
  }, [data, sev, source, byNs]);

  // Açık çekmece, yenilenen veriyle güncel kalsın (alarm bittiyse kapansın).
  const current = open ? rows.find((r) => r.id === open.id) ?? null : null;

  async function makeDraft(g: AlertGroup) {
    try {
      setDraft({ ok: true, d: await fetchDraft(g.key), of: g.alertname });
    } catch (e) {
      setDraft({ ok: false, msg: e instanceof Error ? e.message : "Taslak üretilemedi" });
      void load();
    }
  }

  const total = rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="app">
      <aside>
        <div className="logo">Operasyon</div>
        <button className="nav on">Aksiyon bekleyenler{data ? <span className="badge">{data.groups.length}</span> : null}</button>
        <button className="nav off" disabled title="Sonraki adım">Talepler <small>yakında</small></button>
        <button className="nav off" disabled title="Sonraki adım">Sunucu durumu <small>yakında</small></button>
        <div className="foot">Salt okunur · yalnızca aksiyon gerektirenler</div>
      </aside>

      <main>
        <div className="head">
          <div>
            <h1>Aksiyon bekleyenler</h1>
            <p className="muted">Aksiyon gerektirmeyen alarmlar (kalp atışı, bilgi seviyesi) gösterilmez.</p>
          </div>
          <div className="row">
            <span className="muted">{data ? `Güncelleme: ${new Date(data.generatedAt).toLocaleTimeString("tr-TR")}` : ""}</span>
            <button className="btn ghost" onClick={() => void load()}>Yenile</button>
          </div>
        </div>

        {error && <div className="banner err">API'ye ulaşılamıyor: {error}. Sunucunun çalıştığından emin ol.</div>}

        <div className="chips">
          {data?.sources.map((s) => (
            <span key={s.name} className={`chip ${s.status}`} title={s.error ?? ""}>
              <i /> {s.name}: {s.status === "ok" ? `${s.alertCount} alarm` : `erişilemedi (${s.error ?? "?"})`}
            </span>
          ))}
        </div>

        <div className="toolbar">
          <select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)} aria-label="Önem">
            <option value="all">Tüm önemler</option>
            <option value="critical">Yalnız kritik</option>
            <option value="warning">Yalnız uyarı</option>
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Ortam">
            <option value="all">Tüm ortamlar</option>
            {data?.sources.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <label className="chk"><input type="checkbox" checked={byNs} onChange={(e) => setByNs(e.target.checked)} /> Aynı uygulamayı topla</label>
          <span className="muted grow">{rows.length} satır · {total} alarm</span>
        </div>

        {data && rows.length === 0 && !error && (
          <div className="empty">✓ Aksiyon gerektiren alarm yok.</div>
        )}

        {rows.length > 0 && (
          <div className="card scroll">
            <table>
              <thead><tr><th>Önem</th><th>Alarm</th><th>Ortam</th><th>Adet</th><th>Başlangıç</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r)} className="row-click">
                    <td><span className={`sev ${r.severity}`}>{SEV_LABEL[r.severity]}</span></td>
                    <td><b>{r.title}</b><div className="muted small">{r.sub}</div></td>
                    <td>{r.place}</td>
                    <td className="num">{r.count}</td>
                    <td className="muted">{ago(r.firstSeen, now)} önce</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {current && (
        <div className="drawer" role="dialog" aria-label="Alarm ayrıntısı">
          <div className="row between">
            <h2>{current.title}</h2>
            <button className="btn ghost" onClick={() => setOpen(null)}>Kapat</button>
          </div>
          <p className="muted">{current.place} · {current.count} alarm · {ago(current.firstSeen, now)} önce başladı</p>
          {current.members.map((g) => (
            <div className="member" key={g.key}>
              <div className="row between">
                <div><span className={`sev ${g.severity}`}>{SEV_LABEL[g.severity]}</span> <b>{g.alertname}</b> <span className="muted">×{g.count}</span></div>
                <button className="btn" onClick={() => void makeDraft(g)}>Ticket taslağı</button>
              </div>
              <div className="muted small">{g.summary}</div>
              {g.instances.length > 0 && (
                <div className="inst">{g.instances.join(", ")}{g.moreInstances ? ` +${g.moreInstances} daha` : ""}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="overlay" onClick={() => setDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {draft.ok ? (
              <>
                <h2>Ticket taslağı</h2>
                <p className="muted">Bu taslak <b>henüz hiçbir yere kaydedilmedi</b>. Ticket sistemi bağlanınca buradan tek tuşla açılacak; şimdilik kopyalayabilirsin.</p>
                <div className="row"><span className="tag">{draft.d.team === "sec" ? "Siber Güvenlik" : "BT Destek"}</span><span className="tag">Öncelik: {draft.d.priority}</span></div>
                <label>Başlık</label>
                <input readOnly value={draft.d.title} />
                <label>Açıklama</label>
                <textarea readOnly value={draft.d.description} rows={9} />
                <div className="row end">
                  <button className="btn ghost" onClick={() => setDraft(null)}>Kapat</button>
                  <button className="btn" onClick={() => void navigator.clipboard.writeText(`${draft.d.title}\n\n${draft.d.description}`)}>Kopyala</button>
                </div>
              </>
            ) : (
              <>
                <h2>Taslak üretilemedi</h2>
                <p>{draft.msg}</p>
                <div className="row end"><button className="btn" onClick={() => setDraft(null)}>Tamam</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
