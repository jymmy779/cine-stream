import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  upsertMovieDetail,
  syncIncremental,
  syncBulk,
  pauseBulkSync,
  loadSyncState,
  mergeMoviesManually,
  getSourcePageStats,
} from "../services/syncService.js";
import { getCronStatus, toggleCron, recordSyncResult } from "../services/cronService.js";

export async function importMovie(req: Request, res: Response) {
  try {
    const payload = req.body;
    if (!payload || !payload.movie || !payload.movie.slug) {
      return res.status(400).json({
        status: false,
        msg: "Dữ liệu không hợp lệ. Yêu cầu object { movie, episodes }",
      });
    }

    const result = await upsertMovieDetail(payload, "KK");
    if (!result.success) {
      return res.status(500).json({ status: false, msg: "Lỗi lưu phim vào Database" });
    }

    return res.json({
      status: true,
      msg: `Đã import phim "${payload.movie.name}" (${payload.movie.slug}) thành công!`,
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function triggerInstantSync(req: Request, res: Response) {
  try {
    const source = (req.body.source || "all") as "all" | "kkphim" | "vsmov" | "nguonc";
    const pages = Math.min(10, Math.max(1, Number(req.body.pages) || 2));

    syncIncremental(source, pages)
      .then((res) => {
        recordSyncResult(source, res);
      })
      .catch((err) =>
        console.error("[Admin Instant Sync] Lỗi ngầm:", err.message)
      );

    return res.json({
      status: true,
      msg: `Đã kích hoạt đồng bộ nhanh ${pages} trang mới nhất [Nguồn: ${source.toUpperCase()}].`,
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function getSyncFullStatus(req: Request, res: Response) {
  try {
    const cron = getCronStatus();
    const bulkState = loadSyncState();
    const sourceStats = await getSourcePageStats();
    const recentLogs = await prisma.syncLog.findMany({
      take: 15,
      orderBy: { started_at: "desc" },
    });

    return res.json({
      status: true,
      data: {
        cron,
        bulk: bulkState,
        sourceStats,
        logs: recentLogs,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function toggleCronJob(req: Request, res: Response) {
  try {
    const source = (req.body.source || "all") as "all" | "kkphim" | "vsmov" | "nguonc";
    const { enable } = req.body;
    const isEnabled = toggleCron(source, typeof enable === "boolean" ? enable : undefined);

    return res.json({
      status: true,
      enabled: isEnabled,
      source,
      msg: `Cronjob 15 phút cho nguồn [${source.toUpperCase()}]: ${isEnabled ? "BẬT" : "TẮT"}`,
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function startBulkSync(req: Request, res: Response) {
  try {
    const source = (req.body.source || "all") as "all" | "kkphim" | "vsmov" | "nguonc";
    const startPage = Math.max(1, Number(req.body.startPage) || 1);
    const maxPages = req.body.maxPages ? Number(req.body.maxPages) : undefined;

    syncBulk({
      source,
      startPage,
      maxPages,
    }).catch((err) => console.error("[Admin Bulk Sync] Lỗi ngầm:", err.message));

    return res.json({
      status: true,
      msg: `Đã bắt đầu cào Full kho phim [Nguồn: ${source.toUpperCase()}] từ Page ${startPage}!`,
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function pauseBulkSyncHandler(req: Request, res: Response) {
  try {
    pauseBulkSync();
    return res.json({
      status: true,
      msg: "Đã gửi lệnh tạm dừng cào Full.",
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function mergeMoviesHandler(req: Request, res: Response) {
  try {
    const { sourceSlug, targetSlug } = req.body;
    if (!sourceSlug || !targetSlug) {
      return res.status(400).json({ status: false, msg: "Thiếu sourceSlug hoặc targetSlug" });
    }

    const result = await mergeMoviesManually(sourceSlug, targetSlug);
    return res.json({
      status: result.success,
      msg: result.msg,
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function getSyncLogs(req: Request, res: Response) {
  try {
    const logs = await prisma.syncLog.findMany({
      take: 20,
      orderBy: { started_at: "desc" },
    });

    return res.json({
      status: true,
      data: logs,
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}
