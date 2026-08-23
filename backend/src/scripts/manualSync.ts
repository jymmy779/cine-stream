import { syncIncremental } from "../services/syncService.js";

async function main() {
  const pages = parseInt(process.argv[2] || "2", 10);
  const source = (process.argv[3] || "all") as "all" | "kkphim" | "vsmov" | "nguonc";
  console.log(`[ManualSync] Running sync for ${pages} pages from source: ${source}...`);
  await syncIncremental(source, pages);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
