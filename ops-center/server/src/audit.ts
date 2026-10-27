import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface AuditEntry {
  user: string;
  action: string;
  detail?: string;
}

/**
 * İşlem kaydı: kim, ne zaman, ne yaptı. Yalnızca yerel dosyaya yazılır
 * (data/ klasörü git'e girmez). Alarm içeriği KAYDA yazılmaz, sadece eylem.
 */
export function writeAudit(path: string, e: AuditEntry): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...e }) + "\n");
  } catch {
    // Kayıt yazılamasa da arayüz çalışmaya devam eder; hata sessiz geçmez ama çökertmez.
    console.error("audit yazılamadı");
  }
}
