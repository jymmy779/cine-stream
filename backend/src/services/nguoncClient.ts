import axios from "axios";
import {
  KKPhimTaxonomy,
  KKPhimPagination,
  KKPhimMovieItemSummary,
  KKPhimServerItem,
  KKPhimMovieDetail,
  KKPhimDetailResponse,
} from "./kkphimClient.js";
import { normalizeCategories, normalizeCountries } from "./taxonomyNormalizer.js";

const API_BASE = "https://phim.nguonc.com/api";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  },
});

function extractRawList(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    const list: any[] = [];
    Object.values(raw).forEach((group: any) => {
      if (group?.list && Array.isArray(group.list)) {
        group.list.forEach((it: any) => {
          if (it.name) list.push(it);
        });
      } else if (group?.name) {
        list.push(group);
      }
    });
    return list;
  }
  return [];
}

/**
 * Lấy danh sách phim mới cập nhật theo trang từ NguonC
 */
export async function fetchNguonCUpdatedPage(page = 1): Promise<{
  items: KKPhimMovieItemSummary[];
  pagination: KKPhimPagination;
} | null> {
  let retries = 2;
  while (retries >= 0) {
    try {
      const res = await client.get(`/films/phim-moi-cap-nhat?page=${page}`);
      const data = res.data;
      if (data?.status === "success" && Array.isArray(data?.items)) {
        const mappedItems: KKPhimMovieItemSummary[] = data.items.map((it: any) => {
          const rawThumb = (typeof it.thumb_url === "string" ? it.thumb_url : it.thumb_url?.url || "").trim();
          const rawPoster = (typeof it.poster_url === "string" ? it.poster_url : it.poster_url?.url || "").trim();
          return {
            _id: String(it.id || it.slug || ""),
            name: it.name || "",
            slug: it.slug || "",
            origin_name: it.original_name || it.name || "",
            // NguonC bị ngược: thumb_url là ảnh đứng (2:3), poster_url là ảnh ngang (16:9)
            thumb_url: rawPoster || rawThumb,
            poster_url: rawThumb || rawPoster,
            year: Number(it.year) || new Date().getFullYear(),
            modified: {
              time: it.modified || it.created || new Date().toISOString(),
            },
          };
        });

        return {
          items: mappedItems,
          pagination: data.paginate || {
            totalItems: data.paginate?.total_items || data.items.length,
            totalItemsPerPage: data.paginate?.items_per_page || 10,
            currentPage: page,
            totalPages: data.paginate?.total_page || 1,
          },
        };
      }
      return null;
    } catch (error: any) {
      retries--;
      if (retries < 0) {
        console.error(`[NguonC] Lỗi fetch trang ${page}:`, error.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

/**
 * Lấy chi tiết đầy đủ của một bộ phim từ NguonC (đã chuẩn hoá theo KKPhimDetailResponse)
 */
export async function fetchNguonCMovieDetail(slug: string): Promise<KKPhimDetailResponse | null> {
  let retries = 2;
  while (retries >= 0) {
    try {
      const res = await client.get(`/film/${encodeURIComponent(slug)}`);
      const data = res.data;
      const movie = data?.movie;
      if (!movie) return null;

      const rawEpisodes = movie?.episodes || [];
      const formattedEpisodes: KKPhimServerItem[] = rawEpisodes.map((srv: any) => ({
        server_name: (srv.server_name || "NguonC").replace(/\s+/g, " ").trim(),
        server_data: (srv.items || []).map((ep: any) => ({
          name: (ep.name || "Tập").replace(/\s+/g, " ").trim(),
          slug: ep.slug || `tap-${ep.name}`,
          filename: ep.slug || "",
          link_embed: ep.embed || "",
          link_m3u8: ep.m3u8 || "",
        })),
      }));

      const parsedCategories = normalizeCategories(extractRawList(movie.category));
      const parsedCountries = normalizeCountries(extractRawList(movie.country));

      const totalEps = movie.total_episodes ? String(movie.total_episodes) : "1";
      const isSingle = totalEps === "1" || totalEps === "1 Tập";

      const rawThumb = (typeof movie.thumb_url === "string" ? movie.thumb_url : movie.thumb_url?.url || "").trim();
      const rawPoster = (typeof movie.poster_url === "string" ? movie.poster_url : movie.poster_url?.url || "").trim();

      // NguonC bị ngược: thumb_url là ảnh đứng (2:3), poster_url là ảnh ngang (16:9)
      const safePoster = rawThumb || rawPoster;
      const safeThumb = rawPoster || rawThumb;

      const formattedMovie: KKPhimMovieDetail = {
        _id: String(movie.id || movie.slug || ""),
        name: movie.name || "",
        slug: movie.slug || slug,
        origin_name: movie.original_name || movie.name || "",
        content: typeof movie.description === "string" ? movie.description : "",
        type: isSingle ? "single" : "series",
        status: (movie.current_episode || "").toLowerCase().includes("hoàn tất") ? "completed" : "ongoing",
        thumb_url: safeThumb,
        poster_url: safePoster,
        is_copyright: false,
        sub_docquyen: false,
        chieurap: false,
        trailer_url: typeof movie.trailer_url === "string" ? movie.trailer_url : "",
        time: typeof movie.time === "string" ? movie.time : "",
        episode_current: typeof movie.current_episode === "string" ? movie.current_episode : "",
        episode_total: totalEps,
        quality: typeof movie.quality === "string" ? movie.quality : "HD",
        lang: typeof movie.language === "string" ? movie.language : "Vietsub",
        notify: "",
        showtimes: "",
        year: Number(movie.year) || new Date().getFullYear(),
        view: Number(movie.view) || 0,
        actor: typeof movie.casts === "string" ? movie.casts.split(",").map((s: string) => s.trim()) : [],
        director: typeof movie.director === "string" ? movie.director.split(",").map((s: string) => s.trim()) : [],
        category: parsedCategories,
        country: parsedCountries,
        tmdb: movie.tmdb_id
          ? {
              id: String(movie.tmdb_id),
              type: isSingle ? "movie" : "tv",
            }
          : undefined,
        modified: {
          time: movie.modified || movie.created || new Date().toISOString(),
        },
      };

      return {
        status: true,
        movie: formattedMovie,
        episodes: formattedEpisodes,
      };
    } catch (error: any) {
      retries--;
      if (retries < 0) {
        console.error(`[NguonC] Lỗi fetch chi tiết phim ${slug}:`, error.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}
