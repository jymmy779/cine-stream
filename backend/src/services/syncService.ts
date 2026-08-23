import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma.js";
import {
  fetchKKPhimCategories,
  fetchKKPhimCountries,
  fetchKKPhimUpdatedPage,
  fetchKKPhimMovieDetail,
  KKPhimDetailResponse,
} from "./kkphimClient.js";
import {
  fetchVSMovUpdatedPage,
  fetchVSMovMovieDetail,
} from "./vsmovClient.js";
import {
  fetchNguonCUpdatedPage,
  fetchNguonCMovieDetail,
} from "./nguoncClient.js";
import { findMatchingMovieInDb } from "./movieMatcher.js";
import {
  STANDARD_CATEGORIES,
  STANDARD_COUNTRIES,
  normalizeCategories,
  normalizeCountries,
} from "./taxonomyNormalizer.js";
import { syncMovieToFts } from "../controllers/movieController.js";

const STATE_FILE_PATH = path.resolve(process.cwd(), ".sync_state.json");

export interface LiveLogItem {
  id: string;
  time: string;
  text: string;
  type: "new" | "update" | "info" | "error";
}

interface SyncState {
  last_seed_page: number;
  total_seeded: number;
  last_sync_time: string;
  is_running?: boolean;
  current_source?: string;
  current_page?: number;
  total_pages?: number;
  percent?: string;
  percent_num?: number;
  created_count?: number;
  updated_count?: number;
  live_logs?: LiveLogItem[];
}

const memoryLogs: LiveLogItem[] = [];

export function addLiveLog(text: string, type: "new" | "update" | "info" | "error" = "info") {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("vi-VN");
  const logItem: LiveLogItem = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    time: timeStr,
    text,
    type,
  };
  memoryLogs.push(logItem); // Thứ tự thời gian chuẩn, KHÔNG LIMIT: Lưu trọn vẹn 100% dòng log
}

export function clearLiveLogs() {
  memoryLogs.length = 0;
}

export function getRecentLiveLogs(): LiveLogItem[] {
  return memoryLogs;
}

let sourceStatsCache: {
  timestamp: number;
  data: {
    kkphim: { totalPages: number; totalItems: number };
    vsmov: { totalPages: number; totalItems: number };
    nguonc: { totalPages: number; totalItems: number };
    all: { totalPages: number; totalItems: number };
  };
} | null = null;

export async function getSourcePageStats() {
  const now = Date.now();
  if (sourceStatsCache && now - sourceStatsCache.timestamp < 300000) {
    return sourceStatsCache.data;
  }

  const [kk, vs, nc] = await Promise.all([
    fetchKKPhimUpdatedPage(1).catch(() => null),
    fetchVSMovUpdatedPage(1).catch(() => null),
    fetchNguonCUpdatedPage(1).catch(() => null),
  ]);

  const kkPages = kk?.pagination?.totalPages || 1255;
  const kkItems = kk?.pagination?.totalItems || 30120;

  const vsPages = vs?.pagination?.totalPages || 774;
  const vsItems = vs?.pagination?.totalItems || 18567;

  const ncPages = nc?.pagination?.totalPages || 3345;
  const ncItems = nc?.pagination?.totalItems || 33450;

  const allPages = kkPages + vsPages + ncPages;
  const allItems = kkItems + vsItems + ncItems;

  const data = {
    kkphim: { totalPages: kkPages, totalItems: kkItems },
    vsmov: { totalPages: vsPages, totalItems: vsItems },
    nguonc: { totalPages: ncPages, totalItems: ncItems },
    all: { totalPages: allPages, totalItems: allItems },
  };

  sourceStatsCache = { timestamp: now, data };
  return data;
}

export function loadSyncState(): SyncState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        live_logs: memoryLogs, // Trả về đầy đủ log để scroll mượt mà từ dòng đầu tiên
      };
    }
  } catch {}
  return { last_seed_page: 1, total_seeded: 0, last_sync_time: "", is_running: false, live_logs: memoryLogs };
}

export function saveSyncState(state: SyncState) {
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err: any) {
    console.error("[SyncState] Không thể lưu state:", err.message);
  }
}

let isBulkSyncCancelled = false;

export function pauseBulkSync() {
  isBulkSyncCancelled = true;
  addLiveLog("⏸ Đã nhận lệnh tạm dừng cào từ Admin.", "error");
  const currentState = loadSyncState();
  saveSyncState({
    ...currentState,
    is_running: false,
  });
}

/**
 * 1. Đồng bộ Thể Loại & Quốc Gia từ KKPhim
 */
export async function syncTaxonomies() {
  console.log("[Taxonomies] Starting sync standard categories & countries...");
  addLiveLog("Đang đồng bộ danh mục Thể Loại & Quốc Gia chuẩn LoFilm...", "info");

  let catCount = 0;
  for (const cat of STANDARD_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug },
    });
    catCount++;
  }

  let countryCount = 0;
  for (const country of STANDARD_COUNTRIES) {
    await prisma.country.upsert({
      where: { slug: country.slug },
      update: { name: country.name },
      create: { name: country.name, slug: country.slug },
    });
    countryCount++;
  }

  console.log(`✅ [Taxonomies] Đã đồng bộ ${catCount} thể loại và ${countryCount} quốc gia chuẩn.`);
  addLiveLog(`✅ Đã đồng bộ ${catCount} thể loại và ${countryCount} quốc gia chuẩn LoFilm.`, "info");
}

function toSafeString(val: any): string {
  if (typeof val === "string") return val.trim();
  if (val && typeof val.url === "string") return val.url.trim();
  return "";
}

/**
 * 2. Upsert thông minh 1 bộ phim kèm toàn bộ Server & Tập phim từ bất kỳ nguồn nào
 * Tự động đối soát 4 tầng để gộp server nếu phim đã có trong DB
 */
export async function upsertMovieDetail(
  detail: KKPhimDetailResponse,
  sourcePrefix: "KK" | "VS" | "NC" = "KK"
): Promise<{ success: boolean; isNew: boolean; movieId: string | null; movieName: string; movieSlug: string }> {
  const { movie: m, episodes: servers } = detail;
  if (!m || !m.slug) return { success: false, isNew: false, movieId: null, movieName: "", movieSlug: "" };

  try {
    const serverModified = m.modified?.time ? new Date(m.modified.time) : new Date();

    const safePosterUrl = toSafeString(m.poster_url);
    const safeThumbUrl = toSafeString(m.thumb_url) || safePosterUrl;
    const safeTrailerUrl = toSafeString(m.trailer_url);
    const safeContent = toSafeString(m.content);
    const safeTime = toSafeString(m.time);
    const safeEpCurrent = toSafeString(m.episode_current);
    const safeEpTotal = toSafeString(m.episode_total);

    // 1. Đối soát phim thông minh xem đã tồn tại trong DB chưa
    const existingMovie = await findMatchingMovieInDb({
      slug: m.slug,
      name: m.name,
      origin_name: m.origin_name,
      year: m.year,
      type: m.type,
      tmdb_id: m.tmdb?.id,
    });

    let targetMovieId = "";
    let isNew = false;

    // Quality ranking logic
    const qualityRanks: Record<string, number> = {
      CAM: 1,
      SD: 2,
      HD: 3,
      FHD: 4,
      "2K": 5,
      "4K": 6,
    };
    const getRank = (q: string) => qualityRanks[q?.toUpperCase()] || 0;

    if (existingMovie) {
      targetMovieId = existingMovie.id;
      isNew = false;

      const updateData: any = {
        server_modified: serverModified,
      };

      if (sourcePrefix === "KK") {
        updateData.name = m.name;
        updateData.origin_name = m.origin_name;
        updateData.content = safeContent || existingMovie.content;
        updateData.thumb_url = safeThumbUrl || existingMovie.thumb_url;
        updateData.poster_url = safePosterUrl || existingMovie.poster_url;
        updateData.trailer_url = safeTrailerUrl || existingMovie.trailer_url;
        updateData.time = safeTime || existingMovie.time;
        updateData.year = m.year || existingMovie.year;
        if (m.tmdb?.id) {
          updateData.tmdb_id = String(m.tmdb.id);
          updateData.tmdb_type = m.tmdb.type || existingMovie.tmdb_type;
          updateData.tmdb_vote_average = m.tmdb.vote_average || existingMovie.tmdb_vote_average;
          updateData.tmdb_vote_count = m.tmdb.vote_count || existingMovie.tmdb_vote_count;
        }
      }

      // Giữ lại trailer nếu có
      if (safeTrailerUrl && !existingMovie.trailer_url) {
        updateData.trailer_url = safeTrailerUrl;
      }

      // Cập nhật số tập nếu nguồn mới có số tập cao hơn
      const newMatch = safeEpCurrent.match(/\d+/);
      const oldMatch = (existingMovie.episode_current || "").match(/\d+/);
      const newNum = newMatch ? parseInt(newMatch[0], 10) : 0;
      const oldNum = oldMatch ? parseInt(oldMatch[0], 10) : 0;

      if (
        newNum > oldNum ||
        !existingMovie.episode_current ||
        safeEpCurrent.toLowerCase().includes("hoàn tất")
      ) {
        updateData.episode_current = safeEpCurrent;
      }

      // Cập nhật chất lượng cao hơn
      if (getRank(m.quality) > getRank(existingMovie.quality || "")) {
        updateData.quality = m.quality;
      }

      await prisma.movie.update({
        where: { id: existingMovie.id },
        data: updateData,
      });
      syncMovieToFts(targetMovieId, updateData.name || existingMovie.name, updateData.origin_name || existingMovie.origin_name, existingMovie.slug).catch(() => {});
    } else {
      isNew = true;
      const created = await prisma.movie.create({
        data: {
          slug: m.slug,
          name: m.name,
          origin_name: m.origin_name,
          content: safeContent,
          type: m.type || "single",
          status: m.status || "ongoing",
          thumb_url: safeThumbUrl,
          poster_url: safePosterUrl,
          is_copyright: m.is_copyright ?? false,
          sub_docquyen: m.sub_docquyen ?? false,
          chieurap: m.chieurap ?? false,
          trailer_url: safeTrailerUrl,
          time: safeTime,
          episode_current: safeEpCurrent,
          episode_total: safeEpTotal,
          quality: m.quality || "HD",
          lang: m.lang || "Vietsub",
          notify: toSafeString(m.notify),
          showtimes: toSafeString(m.showtimes),
          year: m.year ? Number(m.year) : null,
          view_count: m.view || 0,
          tmdb_id: m.tmdb?.id ? String(m.tmdb.id) : null,
          tmdb_type: m.tmdb?.type || null,
          tmdb_vote_average: m.tmdb?.vote_average ? Number(m.tmdb.vote_average) : null,
          tmdb_vote_count: m.tmdb?.vote_count ? Number(m.tmdb.vote_count) : null,
          actors: JSON.stringify(Array.isArray(m.actor) ? m.actor.filter(Boolean) : []),
          directors: JSON.stringify(Array.isArray(m.director) ? m.director.filter(Boolean) : []),
          server_modified: serverModified,
        },
      });
      targetMovieId = created.id;
      syncMovieToFts(targetMovieId, created.name, created.origin_name, created.slug).catch(() => {});
    }

    // 2. Đồng bộ Thể loại (MovieCategory) theo danh mục chuẩn LoFilm
    const normalizedCats = normalizeCategories(m.category || []);
    if (m.type === "hoathinh" && !normalizedCats.some((c) => c.slug === "hoat-hinh")) {
      normalizedCats.push({ name: "Hoạt Hình", slug: "hoat-hinh" });
    }

    for (const cat of normalizedCats) {
      const categoryRecord = await prisma.category.findUnique({
        where: { slug: cat.slug },
      });

      if (!categoryRecord) continue; // Tuyệt đối không tự tạo slug rác

      await prisma.movieCategory.upsert({
        where: {
          movie_id_category_id: {
            movie_id: targetMovieId,
            category_id: categoryRecord.id,
          },
        },
        update: {},
        create: {
          movie_id: targetMovieId,
          category_id: categoryRecord.id,
        },
      });
    }

    // 3. Đồng bộ Quốc gia (MovieCountry) theo danh mục chuẩn LoFilm
    const normalizedCountries = normalizeCountries(m.country || []);
    for (const country of normalizedCountries) {
      const countryRecord = await prisma.country.findUnique({
        where: { slug: country.slug },
      });

      if (!countryRecord) continue; // Tuyệt đối không tự tạo slug rác

      await prisma.movieCountry.upsert({
        where: {
          movie_id_country_id: {
            movie_id: targetMovieId,
            country_id: countryRecord.id,
          },
        },
        update: {},
        create: {
          movie_id: targetMovieId,
          country_id: countryRecord.id,
        },
      });
    }

    // 4. Đồng bộ Servers & Episodes với hậu tố nguồn rõ ràng
    if (Array.isArray(servers) && servers.length > 0) {
      for (const s of servers) {
        const rawServerName = (s.server_name || "Vietsub #1").replace(/\s+/g, " ").trim();
        const suffix = ` ${sourcePrefix}`;
        const finalServerName =
          rawServerName.endsWith(" KK") ||
          rawServerName.endsWith(" VS") ||
          rawServerName.endsWith(" NC")
            ? rawServerName
            : `${rawServerName}${suffix}`;

        let serverRecord = await prisma.episodeServer.findFirst({
          where: {
            movie_id: targetMovieId,
            server_name: finalServerName,
          },
        });

        if (!serverRecord) {
          serverRecord = await prisma.episodeServer.create({
            data: {
              movie_id: targetMovieId,
              server_name: finalServerName,
            },
          });
        }

        if (Array.isArray(s.server_data) && s.server_data.length > 0) {
          for (const ep of s.server_data) {
            if (!ep.slug) continue;

            const existingEp = await prisma.episode.findFirst({
              where: {
                server_id: serverRecord.id,
                slug: ep.slug,
              },
            });

            if (existingEp) {
              await prisma.episode.update({
                where: { id: existingEp.id },
                data: {
                  name: (ep.name || existingEp.name).replace(/\s+/g, " ").trim(),
                  filename: ep.filename || existingEp.filename,
                  link_m3u8: ep.link_m3u8 || existingEp.link_m3u8,
                  link_embed: ep.link_embed || existingEp.link_embed,
                },
              });
            } else {
              await prisma.episode.create({
                data: {
                  server_id: serverRecord.id,
                  name: (ep.name || "Tập").replace(/\s+/g, " ").trim(),
                  slug: ep.slug,
                  filename: ep.filename || "",
                  link_m3u8: ep.link_m3u8 || "",
                  link_embed: ep.link_embed || "",
                },
              });
            }
          }
        }
      }
    }

    // 5. Cập nhật lại lang và episode_current tổng hợp từ TẤT CẢ các server hiện có
    const allServers = await prisma.episodeServer.findMany({
      where: { movie_id: targetMovieId },
      include: { server_data: true },
    });

    const detectedLangs = new Set<string>();
    let maxEpsCount = 0;

    function extractMaxEpNumber(srv: any): number {
      if (!srv?.server_data || !Array.isArray(srv.server_data) || srv.server_data.length === 0) return 0;
      let max = 0;
      for (const ep of srv.server_data) {
        const text = `${ep.name || ""} ${ep.slug || ""}`;
        const matches = text.match(/\d+/g);
        if (matches) {
          for (const m of matches) {
            const n = parseInt(m, 10);
            if (n > max && n < 100000) max = n;
          }
        }
      }
      return max > 0 ? max : srv.server_data.length;
    }

    allServers.forEach((srv: any) => {
      const sNameLower = srv.server_name.toLowerCase();
      if (sNameLower.includes("vietsub")) detectedLangs.add("Vietsub");
      if (sNameLower.includes("thuyết minh")) detectedLangs.add("Thuyết Minh");
      if (sNameLower.includes("lồng tiếng")) detectedLangs.add("Lồng Tiếng");
      if (sNameLower.includes("song ngữ")) detectedLangs.add("Song Ngữ");

      const srvMax = extractMaxEpNumber(srv);
      if (srvMax > maxEpsCount) {
        maxEpsCount = srvMax;
      }
    });

    const finalUpdate: any = {};

    if (detectedLangs.size > 0) {
      const order = ["Vietsub", "Thuyết Minh", "Lồng Tiếng", "Song Ngữ"];
      const sortedLangs = Array.from(detectedLangs).sort(
        (a, b) => order.indexOf(a) - order.indexOf(b)
      );
      finalUpdate.lang = sortedLangs.join(" + ");
    }

    if (m.type !== "single" && maxEpsCount > 0) {
      const cur = (m.episode_current || "").toLowerCase();
      if (!cur.includes("hoàn tất") && !cur.includes("full") && !cur.includes("trọn bộ")) {
        finalUpdate.episode_current = `Tập ${maxEpsCount}`;
      }
    }

    if (Object.keys(finalUpdate).length > 0) {
      await prisma.movie.update({
        where: { id: targetMovieId },
        data: finalUpdate,
      });
    }

    return { success: true, isNew, movieId: targetMovieId, movieName: m.name, movieSlug: m.slug };
  } catch (error: any) {
    console.error(`[SyncService] Lỗi upsert phim ${m.slug} (${sourcePrefix}):`, error.message);
    return { success: false, isNew: false, movieId: null, movieName: m.name || "", movieSlug: m.slug || "" };
  }
}

/**
 * 3. Đồng bộ Tăng Cường Định Kỳ (Incremental Sync)
 */
export async function syncIncremental(
  source: "all" | "kkphim" | "vsmov" | "nguonc" = "all",
  pagesToScan = 2
): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  console.log(`🔄 [Sync Incremental] Bắt đầu quét ${pagesToScan} trang mới nhất [Nguồn: ${source}]...`);
  addLiveLog(`🔄 [ĐỒNG BỘ ĐỊNH KỲ] Nguồn: ${source.toUpperCase()} | Quét ${pagesToScan} trang mới nhất`, "info");
  const startTime = new Date();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const sourcesToRun: Array<"kkphim" | "vsmov" | "nguonc"> =
    source === "all" ? ["kkphim", "vsmov", "nguonc"] : [source];

  for (const src of sourcesToRun) {
    const prefix: "KK" | "VS" | "NC" =
      src === "kkphim" ? "KK" : src === "vsmov" ? "VS" : "NC";

    for (let page = 1; page <= pagesToScan; page++) {
      let items: any[] = [];

      if (src === "kkphim") {
        const p = await fetchKKPhimUpdatedPage(page);
        items = p?.items || [];
      } else if (src === "vsmov") {
        const p = await fetchVSMovUpdatedPage(page);
        items = p?.items || [];
      } else if (src === "nguonc") {
        const p = await fetchNguonCUpdatedPage(page);
        items = p?.items || [];
      }

      for (const item of items) {
        if (!item.slug) continue;

        let detail: KKPhimDetailResponse | null = null;
        if (src === "kkphim") detail = await fetchKKPhimMovieDetail(item.slug);
        else if (src === "vsmov") detail = await fetchVSMovMovieDetail(item.slug);
        else if (src === "nguonc") detail = await fetchNguonCMovieDetail(item.slug);

        if (detail) {
          const res = await upsertMovieDetail(detail, prefix);
          if (res.success) {
            if (res.isNew) {
              created++;
              addLiveLog(`[+ MỚI] ${item.name} (${item.slug}) [${prefix}]`, "new");
            } else {
              updated++;
              addLiveLog(`[~ CẬP NHẬT] ${item.name} (${item.slug}) [${prefix}]`, "update");
            }
          }
        }

        await new Promise((r) => setTimeout(r, 60));
      }
    }
  }

  await prisma.syncLog.create({
    data: {
      sync_type: `CRON_${source.toUpperCase()}`,
      status: "SUCCESS",
      pages_crawled: pagesToScan * sourcesToRun.length,
      movies_created: created,
      movies_updated: updated,
      started_at: startTime,
      finished_at: new Date(),
    },
  });

  addLiveLog(`🎉 Hoàn tất quét nhanh! Mới: +${created}, Cập nhật: ~${updated} phim.`, "info");

  return { created, updated, skipped };
}

/**
 * 4. Đồng bộ Toàn Bộ Kho Phim (Bulk Seeder)
 */
export async function syncBulk(options?: {
  source?: "all" | "kkphim" | "vsmov" | "nguonc";
  startPage?: number;
  maxPages?: number;
  concurrency?: number;
  onProgress?: (progress: {
    currentPage: number;
    totalPages: number;
    syncedCount: number;
    percent: string;
    source: string;
  }) => void;
}) {
  const source = options?.source || "all";
  const startPage = options?.startPage || 1;
  const concurrency = options?.concurrency || 4;
  isBulkSyncCancelled = false;

  clearLiveLogs(); // Xóa sạch log cũ, tạo session terminal mới
  console.log(`\n🚀 [Bulk Seeder] Bắt đầu cào Full [Nguồn: ${source}] từ Page ${startPage}...`);
  addLiveLog(`🚀 [KHỞI ĐỘNG BULK SEEDER] Nguồn: ${source.toUpperCase()} | Bắt đầu từ trang ${startPage}`, "info");

  await syncTaxonomies();

  const sourcesToRun: Array<"kkphim" | "vsmov" | "nguonc"> =
    source === "all" ? ["kkphim", "vsmov", "nguonc"] : [source];

  let totalSynced = 0;

  for (const src of sourcesToRun) {
    if (isBulkSyncCancelled) {
      console.log("[Bulk Seeder] Đã tạm dừng.");
      break;
    }

    const prefix: "KK" | "VS" | "NC" =
      src === "kkphim" ? "KK" : src === "vsmov" ? "VS" : "NC";

    // Lấy tổng số trang thực tế của từng nguồn
    let totalPages = options?.maxPages || (src === "nguonc" ? 3400 : src === "kkphim" ? 1300 : 900);
    try {
      if (src === "kkphim") {
        const first = await fetchKKPhimUpdatedPage(1);
        if (first?.pagination?.totalPages) {
          totalPages = options?.maxPages ? Math.min(first.pagination.totalPages, options.maxPages) : first.pagination.totalPages;
        }
      } else if (src === "vsmov") {
        const first = await fetchVSMovUpdatedPage(1);
        if (first?.pagination?.totalPages) {
          totalPages = options?.maxPages ? Math.min(first.pagination.totalPages, options.maxPages) : first.pagination.totalPages;
        }
      } else if (src === "nguonc") {
        const first = await fetchNguonCUpdatedPage(1);
        if (first?.pagination?.totalPages) {
          totalPages = options?.maxPages ? Math.min(first.pagination.totalPages, options.maxPages) : first.pagination.totalPages;
        }
      }
    } catch (err: any) {
      console.warn(`[SyncBulk] Không lấy được totalPages cho ${src}, dùng fallback: ${totalPages}`);
    }

    addLiveLog(`👉 [${src.toUpperCase()}] Tổng số trang: ${totalPages}. Bắt đầu cào từ trang ${startPage}...`, "info");

    for (let page = startPage; page <= totalPages; page++) {
      if (isBulkSyncCancelled) break;

      let items: any[] = [];
      if (src === "kkphim") {
        const p = await fetchKKPhimUpdatedPage(page);
        items = p?.items || [];
      } else if (src === "vsmov") {
        const p = await fetchVSMovUpdatedPage(page);
        items = p?.items || [];
      } else if (src === "nguonc") {
        const p = await fetchNguonCUpdatedPage(page);
        items = p?.items || [];
      }

      if (items.length === 0) continue;

      for (let i = 0; i < items.length; i += concurrency) {
        if (isBulkSyncCancelled) break;
        const chunk = items.slice(i, i + concurrency);

        await Promise.all(
          chunk.map(async (item) => {
            if (!item.slug) return;
            let detail: KKPhimDetailResponse | null = null;
            if (src === "kkphim") detail = await fetchKKPhimMovieDetail(item.slug);
            else if (src === "vsmov") detail = await fetchVSMovMovieDetail(item.slug);
            else if (src === "nguonc") detail = await fetchNguonCMovieDetail(item.slug);

            if (detail) {
              const res = await upsertMovieDetail(detail, prefix);
              if (res.success) {
                totalSynced++;
                if (res.isNew) {
                  addLiveLog(`[+ MỚI] ${item.name} [${prefix}] (Trang ${page})`, "new");
                } else {
                  addLiveLog(`[~ CẬP NHẬT] ${item.name} [${prefix}] (Trang ${page})`, "update");
                }
              }
            }
          })
        );

        await new Promise((r) => setTimeout(r, 60));
      }

      const percentNum = Math.min(100, Math.max(0, Math.round(((page - startPage + 1) / (totalPages - startPage + 1)) * 100)));
      const percent = `${percentNum}%`;

      options?.onProgress?.({
        currentPage: page,
        totalPages,
        syncedCount: totalSynced,
        percent,
        source: src,
      });

      saveSyncState({
        last_seed_page: page + 1,
        total_seeded: totalSynced,
        last_sync_time: new Date().toISOString(),
        is_running: !isBulkSyncCancelled,
        current_source: src,
        current_page: page,
        total_pages: totalPages,
        percent,
        percent_num: percentNum,
      });
    }
  }

  saveSyncState({
    last_seed_page: startPage,
    total_seeded: totalSynced,
    last_sync_time: new Date().toISOString(),
    is_running: false,
    percent: "100%",
    percent_num: 100,
  });

  addLiveLog(`🎉 Hoàn tất cào Full! Đã lưu tổng cộng ${totalSynced} phim vào Database.`, "info");
  console.log(`\n🎉 [Bulk Seeder] Hoàn thành đồng bộ ${totalSynced} phim!`);
}

/**
 * 5. Gộp thủ công 2 phim trong Database
 */
export async function mergeMoviesManually(sourceSlug: string, targetSlug: string): Promise<{ success: boolean; msg: string }> {
  if (!sourceSlug || !targetSlug || sourceSlug === targetSlug) {
    return { success: false, msg: "Slug nguồn và slug đích không hợp lệ!" };
  }

  const [sourceMovie, targetMovie] = await Promise.all([
    prisma.movie.findUnique({
      where: { slug: sourceSlug },
      include: { episodes: { include: { server_data: true } } },
    }),
    prisma.movie.findUnique({
      where: { slug: targetSlug },
      include: { episodes: { include: { server_data: true } } },
    }),
  ]);

  if (!sourceMovie || !targetMovie) {
    return { success: false, msg: "Không tìm thấy phim nguồn hoặc phim đích trong Database!" };
  }

  for (const srv of sourceMovie.episodes) {
    const existingTargetServer = await prisma.episodeServer.findFirst({
      where: { movie_id: targetMovie.id, server_name: srv.server_name },
    });

    if (existingTargetServer) {
      for (const ep of srv.server_data) {
        const existingEp = await prisma.episode.findFirst({
          where: { server_id: existingTargetServer.id, slug: ep.slug },
        });
        if (!existingEp) {
          await prisma.episode.create({
            data: {
              server_id: existingTargetServer.id,
              name: ep.name,
              slug: ep.slug,
              filename: ep.filename,
              link_m3u8: ep.link_m3u8,
              link_embed: ep.link_embed,
            },
          });
        }
      }
    } else {
      await prisma.episodeServer.update({
        where: { id: srv.id },
        data: { movie_id: targetMovie.id },
      });
    }
  }

  await prisma.movie.delete({
    where: { id: sourceMovie.id },
  });

  const allTargetServers = await prisma.episodeServer.findMany({
    where: { movie_id: targetMovie.id },
    include: { server_data: true },
  });

  const detectedLangs = new Set<string>();
  let maxEps = 0;

  allTargetServers.forEach((srv) => {
    const sNameLower = srv.server_name.toLowerCase();
    if (sNameLower.includes("vietsub")) detectedLangs.add("Vietsub");
    if (sNameLower.includes("thuyết minh")) detectedLangs.add("Thuyết Minh");
    if (sNameLower.includes("lồng tiếng")) detectedLangs.add("Lồng Tiếng");
    if (sNameLower.includes("song ngữ")) detectedLangs.add("Song Ngữ");
    if (srv.server_data.length > maxEps) maxEps = srv.server_data.length;
  });

  const order = ["Vietsub", "Thuyết Minh", "Lồng Tiếng", "Song Ngữ"];
  const sortedLangs = Array.from(detectedLangs).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );

  await prisma.movie.update({
    where: { id: targetMovie.id },
    data: {
      lang: sortedLangs.join(" + "),
      episode_current: targetMovie.type !== "single" && maxEps > 0 ? `Tập ${maxEps}` : targetMovie.episode_current,
    },
  });

  addLiveLog(`Đã gộp thủ công phim "${sourceMovie.name}" (${sourceSlug}) sang "${targetMovie.name}" (${targetSlug})`, "info");

  return { success: true, msg: `Đã gộp thành công toàn bộ server từ "${sourceMovie.name}" sang "${targetMovie.name}"!` };
}
