import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TicketRecord, TicketStore } from "./types.js";

interface Data {
  tickets: TicketRecord[];
  seq: { it: number; sec: number };
}

const empty = (): Data => ({ tickets: [], seq: { it: 0, sec: 0 } });

/** Geliştirme için dosya tabanlı kayıt (data/ klasörü git'e girmez). */
export class FileTicketStore implements TicketStore {
  constructor(private readonly path: string) {}

  private read(): Data {
    if (!existsSync(this.path)) return empty();
    return JSON.parse(readFileSync(this.path, "utf8")) as Data;
  }

  private write(d: Data): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(d, null, 2));
    renameSync(tmp, this.path); // yarım yazılmış dosya kalmasın
  }

  findByKey(k: string) { return this.read().tickets.find((t) => t.idempotencyKey === k); }
  findById(id: string) { return this.read().tickets.find((t) => t.id === id); }

  save(r: TicketRecord): void {
    const d = this.read();
    const i = d.tickets.findIndex((t) => t.id === r.id);
    if (i >= 0) d.tickets[i] = r; else d.tickets.push(r);
    this.write(d);
  }

  nextSeq(team: "it" | "sec"): number {
    const d = this.read();
    d.seq[team] += 1;
    this.write(d);
    return d.seq[team];
  }
}

/** Testler için bellekte kayıt. */
export class MemoryTicketStore implements TicketStore {
  private d: Data = empty();
  findByKey(k: string) { return this.d.tickets.find((t) => t.idempotencyKey === k); }
  findById(id: string) { return this.d.tickets.find((t) => t.id === id); }
  save(r: TicketRecord): void {
    const i = this.d.tickets.findIndex((t) => t.id === r.id);
    if (i >= 0) this.d.tickets[i] = r; else this.d.tickets.push(r);
  }
  nextSeq(team: "it" | "sec"): number { return (this.d.seq[team] += 1); }
}
