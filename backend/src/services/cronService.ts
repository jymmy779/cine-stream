import cron from "node-cron";
import { syncTaxonomies, syncIncremental, loadSyncState } from "./syncService.js";

type SourceType = "all" | "kkphim" | "vsmov" | "nguonc";

interface SourceCronStatus {
  enabled: boolean;
  last_run_time: string | null;
  last_run_result: any;
}

const sourceCronState: Record<SourceType, SourceCronStatus> = {
  all: { enabled: true, last_run_time: null, last_run_result: null },
  kkphim: { enabled: true, last_run_time: null, last_run_result: null },
  vsmov: { enabled: true, last_run_time: null, last_run_result: null },
  nguonc: { enabled: true, last_run_time: null, last_run_result: null },
};

let isSyncRunning = false;
let cronTask: cron.ScheduledTask | null = null;

export function getCronStatus() {
  return {
    sources: sourceCronState,
    schedule: process.env.SYNC_CRON_SCHEDULE || "*/15 * * * *",
    is_sync_running: isSyncRunning,
  };
}

export function recordSyncResult(source: SourceType, result: any) {
  const nowIso = new Date().toISOString();
  if (source === "all") {
    sourceCronState.all.last_run_time = nowIso;
    sourceCronState.all.last_run_result = result;
  } else {
    sourceCronState[source].last_run_time = nowIso;
    sourceCronState[source].last_run_result = result;
    sourceCronState.all.last_run_time = nowIso;
    sourceCronState.all.last_run_result = result;
  }
}

export function toggleCron(source: SourceType = "all", enable?: boolean): boolean {
  if (source === "all") {
    const targetVal = typeof enable === "boolean" ? enable : !sourceCronState.all.enabled;
    sourceCronState.all.enabled = targetVal;
    sourceCronState.kkphim.enabled = targetVal;
    sourceCronState.vsmov.enabled = targetVal;
    sourceCronState.nguonc.enabled = targetVal;
  } else {
    const targetVal = typeof enable === "boolean" ? enable : !sourceCronState[source].enabled;
    sourceCronState[source].enabled = targetVal;

    // Cập nhật lại cờ 'all'
    const anyEnabled = sourceCronState.kkphim.enabled || sourceCronState.vsmov.enabled || sourceCronState.nguonc.enabled;
    sourceCronState.all.enabled = anyEnabled;
  }

  console.log(`[Cron] Source [${source.toUpperCase()}] is now: ${sourceCronState[source].enabled ? "ENABLED" : "DISABLED"}`);
  return sourceCronState[source].enabled;
}

/**
 * Start background cron jobs (15 phút quét các nguồn đang BẬT)
 */
export function startCronJobs() {
  const schedule = process.env.SYNC_CRON_SCHEDULE || "*/15 * * * *";

  console.log(`[Cron] Auto-sync scheduled with frequency: "${schedule}"`);

  syncTaxonomies().catch((err) =>
    console.error("[Cron Init] Sync taxonomies error:", err.message)
  );

  if (cronTask) {
    cronTask.stop();
  }

  cronTask = cron.schedule(schedule, async () => {
    // Thu thập các nguồn đang BẬT
    const activeSources: Array<"kkphim" | "vsmov" | "nguonc"> = [];
    if (sourceCronState.kkphim.enabled) activeSources.push("kkphim");
    if (sourceCronState.vsmov.enabled) activeSources.push("vsmov");
    if (sourceCronState.nguonc.enabled) activeSources.push("nguonc");

    if (activeSources.length === 0) {
      console.log("[Cron] Tất cả các nguồn đều đang TẮT tự động đồng bộ. Bỏ qua lượt này.");
      return;
    }

    const bulkState = loadSyncState();
    if (bulkState.is_running) {
      console.log("[Cron] Tiến trình cào Bulk Seeder đang chạy. Tạm hoãn lượt cron 15p để nhường tài nguyên.");
      return;
    }

    if (isSyncRunning) {
      console.warn("[Cron] Tiến trình sync trước vẫn đang chạy, bỏ qua lượt này.");
      return;
    }

    isSyncRunning = true;
    const nowIso = new Date().toISOString();

    try {
      console.log(`[Cron Trigger] Bắt đầu tự động quét cho: ${activeSources.join(", ").toUpperCase()} lúc ${new Date().toLocaleTimeString("vi-VN")}`);

      for (const src of activeSources) {
        sourceCronState[src].last_run_time = nowIso;
        try {
          const res = await syncIncremental(src, 2);
          sourceCronState[src].last_run_result = res;
        } catch (err: any) {
          sourceCronState[src].last_run_result = { error: err.message };
        }
      }

      sourceCronState.all.last_run_time = nowIso;
    } catch (err: any) {
      console.error("[Cron Error] Lỗi tự động sync:", err.message);
    } finally {
      isSyncRunning = false;
    }
  });
}
