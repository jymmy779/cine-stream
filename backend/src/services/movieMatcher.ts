import { prisma } from "../lib/prisma.js";

/**
 * Loại bỏ dấu tiếng Việt để so khớp chuỗi
 */
export function removeAccents(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim();
}

/**
 * Chuẩn hóa tên gốc (Origin Name): loại bỏ các hậu tố season, năm, dấu ngoặc, tag phụ
 */
export function cleanOriginName(originName: string): string {
  if (!originName) return "";
  let s = removeAccents(originName).toLowerCase();

  // Xóa các cụm năm (2020) -> (2029) hoặc 1990 -> 1999
  s = s.replace(/\s*\(\s*(19\d{2}|20\d{2})\s*\)/g, "");
  s = s.replace(/\s*\(tv\)/g, "").replace(/\s*\(movie\)/g, "");

  // Chuẩn hóa season / phần: ví dụ (Season 2) -> 2, SS02 -> 2, Phần 2 -> 2
  s = s.replace(/\s*\(?(?:phần|p\.|part|section|vol|volume|season|ss|tập|ep|episode|chapter|ch|book)\s*(\d+|cuối|đặc biệt|i+|iv|v|vi|vii|viii|ix|x)\)?/gi, " $1");
  
  // Loại bỏ ký tự đặc biệt
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Trích xuất Root Slug (bóc tách triệt để các hậu tố lồng nhau: -thuyet-minh, -vietsub, -phan-1, -ss1, -2024...)
 */
export function extractRootSlug(slug: string): string {
  if (!slug) return "";
  let s = slug.toLowerCase().trim();

  // Lặp bóc tách đến khi không còn hậu tố thừa
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/-(thuyet-minh|long-tieng|vietsub|raw|dub|sub|ban-cam|hd|fhd|4k|full)$/g, "")
      .replace(/-(phan-\d+|ss\d+|season-\d+|part-\d+|vol-\d+|tap-\d+|tap-full)$/g, "")
      .replace(/-(19\d{2}|20\d{2})$/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
  return s;
}

/**
 * Tính toán độ tương đồng giữa 2 chuỗi (Jaro-Winkler Similarity: 0 -> 1)
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const simJaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

  // Winkler prefix scaling (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return simJaro + 0.1 * prefix * (1 - simJaro);
}

/**
 * Tính toán độ tương đồng kết hợp (Token Overlap + Jaro-Winkler)
 */
export function combinedTextSimilarity(str1: string, str2: string): number {
  const s1 = removeAccents(str1).toLowerCase().trim();
  const s2 = removeAccents(str2).toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) {
    const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    return Math.max(0.85, ratio);
  }

  const tokens1 = new Set(s1.split(/\s+/).filter(Boolean));
  const tokens2 = new Set(s2.split(/\s+/).filter(Boolean));

  let common = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) common++;
  }

  const overlap = common / Math.max(tokens1.size, tokens2.size);
  const jw = jaroWinklerSimilarity(s1, s2);

  return 0.5 * overlap + 0.5 * jw;
}

export interface MatchCandidate {
  slug: string;
  name: string;
  origin_name?: string;
  year?: number;
  type?: string;
  tmdb_id?: string;
}

/**
 * Đối soát phim mới với Database hiện có để tìm xem có phim nào trùng khớp không
 * Trả về phim trùng khớp trong Database hoặc null nếu là phim hoàn toàn mới
 */
export async function findMatchingMovieInDb(candidate: MatchCandidate): Promise<any | null> {
  const { slug, name, origin_name, year, tmdb_id, type } = candidate;

  // 1. TẦNG 0: Khớp chính xác Slug
  if (slug) {
    const exactSlugMovie = await prisma.movie.findUnique({
      where: { slug },
    });
    if (exactSlugMovie) return exactSlugMovie;
  }

  // 2. TẦNG 1: Khớp theo TMDB ID (Độ tin cậy 100%)
  if (tmdb_id && String(tmdb_id).trim()) {
    const tmdbIdStr = String(tmdb_id).trim();
    const tmdbMatch = await prisma.movie.findFirst({
      where: { tmdb_id: tmdbIdStr },
    });
    if (tmdbMatch) {
      console.log(`[MovieMatcher] Khớp Tầng 1 (TMDB ID: ${tmdbIdStr}): "${name}" -> DB: "${tmdbMatch.name}" (${tmdbMatch.slug})`);
      return tmdbMatch;
    }
  }

  // 3. TẦNG 2: Khớp theo Clean Origin Name + Năm phát hành (Year +- 1)
  const cleanOrigin = cleanOriginName(origin_name || "");
  if (cleanOrigin.length >= 3) {
    const yearFilters: any[] = [];
    if (year && Number(year) > 1950) {
      const numYear = Number(year);
      yearFilters.push({ year: numYear }, { year: numYear - 1 }, { year: numYear + 1 });
    }

    const candidates = await prisma.movie.findMany({
      where: {
        AND: [
          type ? { type } : {},
          yearFilters.length > 0 ? { OR: yearFilters } : {},
        ],
      },
      take: 100,
    });

    for (const dbMovie of candidates) {
      const dbCleanOrigin = cleanOriginName(dbMovie.origin_name || "");
      if (dbCleanOrigin && dbCleanOrigin === cleanOrigin) {
        console.log(`[MovieMatcher] Khớp Tầng 2 (Origin Name: "${cleanOrigin}"): "${name}" -> DB: "${dbMovie.name}" (${dbMovie.slug})`);
        return dbMovie;
      }
    }
  }

  // 4. TẦNG 3: Khớp theo Root Slug & Độ tương đồng tên tiếng Việt / Tên gốc
  const rootSlug = extractRootSlug(slug);
  if (rootSlug.length >= 4) {
    const slugCandidates = await prisma.movie.findMany({
      where: {
        slug: { contains: rootSlug },
      },
      take: 20,
    });

    for (const dbMovie of slugCandidates) {
      const dbRootSlug = extractRootSlug(dbMovie.slug);
      if (dbRootSlug === rootSlug) {
        if (year && dbMovie.year && Math.abs(year - dbMovie.year) > 1) {
          continue;
        }

        const similarity = combinedTextSimilarity(name, dbMovie.name);
        if (similarity >= 0.80) {
          console.log(`[MovieMatcher] Khớp Tầng 3 (Root Slug & Sim ${(similarity * 100).toFixed(0)}%): "${name}" -> DB: "${dbMovie.name}" (${dbMovie.slug})`);
          return dbMovie;
        }
      }
    }
  }

  // Không khớp với phim nào trong DB -> Phim hoàn toàn mới
  return null;
}
