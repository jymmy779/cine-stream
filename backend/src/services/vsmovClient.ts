import axios from "axios";
import {
  KKPhimDetailResponse,
  KKPhimMovieDetail,
  KKPhimMovieItemSummary,
  KKPhimPagination,
  KKPhimServerItem,
  KKPhimTaxonomy,
} from "./kkphimClient.js";
import { normalizeCategories, normalizeCountries } from "./taxonomyNormalizer.js";

const API_BASE = "https://vsmov.com/api";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  },
});

function parseTaxonomies(raw: any, isCountry = false): KKPhimTaxonomy[] {
  if (!raw) return [];
  if (isCountry) {
    return normalizeCountries(Array.isArray(raw) ? raw : [raw]);
  }
  return normalizeCategories(Array.isArray(raw) ? raw : [raw]);
}

/**
 * Lấy danh sách phim mới cập nhật theo trang từ VSMov
 */
export async function fetchVSMovUpdatedPage(page = 1): Promise<{
  items: KKPhimMovieItemSummary[];
  pagination: KKPhimPagination;
} | null> {
  let retries = 2;
  while (retries >= 0) {
    try {
      const res = await client.get(`/danh-sach/phim-moi-cap-nhat?page=${page}`);
      const data = res.data;
      if (data?.status && data?.items) {
        const mappedItems: KKPhimMovieItemSummary[] = data.items.map((it: any) => {
          const rawPoster = (typeof it.poster_url === "string" ? it.poster_url : it.poster_url?.url || "").trim();
          const rawThumb = (typeof it.thumb_url === "string" ? it.thumb_url : it.thumb_url?.url || "").trim();
          return {
            _id: String(it._id || it.id || ""),
            name: it.name || "",
            slug: it.slug || "",
            origin_name: it.origin_name || it.original_name || it.name || "",
            // VSMov bị ngược: poster_url là ảnh ngang (16:9), thumb_url là ảnh đứng (2:3)
            thumb_url: rawPoster || rawThumb,
            poster_url: rawThumb || rawPoster,
            year: Number(it.year) || new Date().getFullYear(),
            modified: {
              time: it.modified?.time || it.updated_at || new Date().toISOString(),
            },
          };
        });

        return {
          items: mappedItems,
          pagination: data.pagination || {
            totalItems: data.pagination?.totalItems || 0,
            totalItemsPerPage: data.pagination?.totalItemsPerPage || 24,
            currentPage: page,
            totalPages: data.pagination?.totalPages || 1,
          },
        };
      }
      return null;
    } catch (error: any) {
      retries--;
      if (retries < 0) {
        console.error(`[VSMov] Lỗi fetch trang ${page}:`, error.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

/**
 * Lấy chi tiết đầy đủ của một bộ phim từ VSMov (đã chuẩn hoá theo KKPhimDetailResponse)
 */
export async function fetchVSMovMovieDetail(slug: string): Promise<KKPhimDetailResponse | null> {
  let retries = 2;
  while (retries >= 0) {
    try {
      const res = await client.get(`/phim/${encodeURIComponent(slug)}`);
      const data = res.data;
      const movie = data?.movie || data?.data?.item;
      if (!movie) return null;

      const rawEpisodes = data?.episodes || data?.data?.item?.episodes || [];
      const formattedEpisodes: KKPhimServerItem[] = rawEpisodes.map((srv: any) => ({
        server_name: (srv.server_name || "VSMov").replace(/\s+/g, " ").trim(),
        server_data: (srv.server_data || srv.items || []).map((ep: any) => ({
          name: (ep.name || "Tập").replace(/\s+/g, " ").trim(),
          slug: ep.slug || `tap-${ep.name}`,
          filename: ep.filename || ep.slug || "",
          link_embed: ep.link_embed || ep.embed || "",
          link_m3u8: ep.link_m3u8 || ep.m3u8 || "",
        })),
      }));

      const rawPoster = (typeof movie.poster_url === "string" ? movie.poster_url : movie.poster_url?.url || "").trim();
      const rawThumb = (typeof movie.thumb_url === "string" ? movie.thumb_url : movie.thumb_url?.url || "").trim();

      // VSMov bị ngược: poster_url là ảnh ngang (16:9), thumb_url là ảnh đứng (2:3)
      const safePoster = rawThumb || rawPoster;
      const safeThumb = rawPoster || rawThumb;

      const formattedMovie: KKPhimMovieDetail = {
        _id: String(movie._id || movie.id || ""),
        name: movie.name || "",
        slug: movie.slug || slug,
        origin_name: movie.origin_name || movie.original_name || movie.name || "",
        content: typeof movie.content === "string" ? movie.content : (movie.description || ""),
        type: movie.type || (movie.episode_total === "1" ? "single" : "series"),
        status: movie.status || "ongoing",
        thumb_url: safeThumb,
        poster_url: safePoster,
        is_copyright: movie.is_copyright ?? false,
        sub_docquyen: movie.sub_docquyen ?? false,
        chieurap: movie.chieurap ?? false,
        trailer_url: typeof movie.trailer_url === "string" ? movie.trailer_url : "",
        time: typeof movie.time === "string" ? movie.time : "",
        episode_current: typeof movie.episode_current === "string" ? movie.episode_current : (movie.current_episode || ""),
        episode_total: String(movie.episode_total || movie.total_episodes || ""),
        quality: typeof movie.quality === "string" ? movie.quality : "HD",
        lang: typeof movie.lang === "string" ? movie.lang : (movie.language || "Vietsub"),
        notify: typeof movie.notify === "string" ? movie.notify : "",
        showtimes: typeof movie.showtimes === "string" ? movie.showtimes : "",
        year: Number(movie.year) || new Date().getFullYear(),
        view: Number(movie.view) || 0,
        actor: Array.isArray(movie.actor)
          ? movie.actor
          : typeof movie.actor === "string"
          ? movie.actor.split(",").map((s: string) => s.trim())
          : [],
        director: Array.isArray(movie.director)
          ? movie.director
          : typeof movie.director === "string"
          ? movie.director.split(",").map((s: string) => s.trim())
          : [],
        category: normalizeCategories(movie.category || []),
        country: normalizeCountries(movie.country || []),
        tmdb: movie.tmdb
          ? {
              id: movie.tmdb.id ? String(movie.tmdb.id) : undefined,
              type: movie.tmdb.type || undefined,
              vote_average: movie.tmdb.vote_average ? Number(movie.tmdb.vote_average) : undefined,
              vote_count: movie.tmdb.vote_count ? Number(movie.tmdb.vote_count) : undefined,
            }
          : undefined,
        modified: {
          time: movie.modified?.time || movie.updated_at || new Date().toISOString(),
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
        console.error(`[VSMov] Lỗi fetch detail ${slug}:`, error.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return null;
}
