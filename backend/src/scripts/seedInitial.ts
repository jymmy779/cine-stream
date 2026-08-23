import { syncBulk } from "../services/syncService.js";

async function main() {
  console.log("[SeedInitial] Starting bulk sync...");
  await syncBulk({ source: "all", startPage: 1 });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
