import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const cfg = loadConfig();
const app = buildApp(cfg);

app
  .listen({ host: cfg.host, port: cfg.port })
  .then(() => {
    console.log(`ops-center API: http://${cfg.host}:${cfg.port}  (mod: ${cfg.mode}${cfg.mode === "live" ? `, kaynaklar: ${cfg.sources.map((s) => s.name).join(", ")}` : ", sahte veri"})`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
