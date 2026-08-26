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
  refreshSelectedMovies,
} from "../services/syncService.js";
import { getCronStatus, toggleCron, recordSyncResult } from "../services/cronService.js";
import { clearApiMemoryCache } from "./movieController.js";

export async function searchMoviesForRefresh(req: Request, res: Response) {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2) return res.json({ status: true, data: [] });

    const movies = await prisma.movie.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { origin_name: { contains: query } },
          { slug: { contains: query } },
        ],
      },
      select: {
        id: true,
        name: true,
        origin_name: true,
        slug: true,
        poster_url: true,
        year: true,
        quality: true,
      },
      orderBy: { updated_at: "desc" },
      take: 20,
    });
    return res.json({ status: true, data: movies });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function refreshSelectedMoviesHandler(req: Request, res: Response) {
  try {
    const slugs = Array.isArray(req.body.slugs) ? req.body.slugs : [];
    const source = (req.body.source || "all") as "all" | "kkphim" | "vsmov" | "nguonc";
    if (slugs.length === 0) {
      return res.status(400).json({ status: false, msg: "Chưa chọn phim cần cào lại." });
    }
    if (slugs.length > 50) {
      return res.status(400).json({ status: false, msg: "Chỉ được chọn tối đa 50 phim mỗi lượt." });
    }

    const results = await refreshSelectedMovies(slugs, source);
    clearApiMemoryCache();
    const updated = results.filter((item) => item.success).length;
    return res.json({
      status: updated > 0,
      msg: `Đã cào lại ${updated}/${results.length} phim.`,
      data: { updated, total: results.length, results },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

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

export async function getSystemStats(req: Request, res: Response) {
  try {
    const [
      totalMovies,
      singleCount,
      seriesCount,
      hoathinhCount,
      tvshowsCount,
      chieurapCount,
      totalEpisodes,
      totalServers,
      totalCategories,
      totalCountries,
      recentlyUpdated,
      topViews,
    ] = await Promise.all([
      prisma.movie.count(),
      prisma.movie.count({ where: { type: "single" } }),
      prisma.movie.count({ where: { type: "series" } }),
      prisma.movie.count({ where: { type: "hoathinh" } }),
      prisma.movie.count({ where: { type: "tvshows" } }),
      prisma.movie.count({ where: { chieurap: true } }),
      prisma.episode.count(),
      prisma.episodeServer.count(),
      prisma.category.count(),
      prisma.country.count(),
      prisma.movie.findMany({
        take: 6,
        orderBy: { updated_at: "desc" },
        select: {
          id: true,
          name: true,
          origin_name: true,
          slug: true,
          thumb_url: true,
          poster_url: true,
          year: true,
          type: true,
          episode_current: true,
          quality: true,
          updated_at: true,
          server_modified: true,
        },
      }),
      prisma.movie.findMany({
        take: 5,
        orderBy: { view_count: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          thumb_url: true,
          poster_url: true,
          view_count: true,
          year: true,
          quality: true,
          type: true,
        },
      }),
    ]);

    return res.json({
      status: true,
      data: {
        totalMovies,
        breakdown: {
          single: singleCount,
          series: seriesCount,
          hoathinh: hoathinhCount,
          tvshows: tvshowsCount,
          chieurap: chieurapCount,
        },
        totalEpisodes,
        totalServers,
        totalCategories,
        totalCountries,
        recentlyUpdated,
        topViews,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

export async function getPendingImagesForSync(req: Request, res: Response) {
  try {
    const authHeader = req.headers["x-sync-secret"] || req.query.secret;
    const adminSecret = process.env.ADMIN_PASSWORD || "admin123";
    if (authHeader !== adminSecret && process.env.NODE_ENV === "production") {
      return res.status(401).json({ status: false, msg: "Unauthorized" });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const hours = parseInt(req.query.hours as string) || 0;

    const where: any = {};
    if (hours > 0) {
      const sinceDate = new Date(Date.now() - hours * 3600 * 1000);
      where.updated_at = { gte: sinceDate };
    }

    const [total, movies] = await Promise.all([
      prisma.movie.count({ where }),
      prisma.movie.findMany({
        where,
        select: {
          id: true,
          slug: true,
          name: true,
          thumb_url: true,
          poster_url: true,
          updated_at: true,
        },
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      status: true,
      data: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items: movies,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
}

