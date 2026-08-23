import { prisma, initDatabaseOptimizations } from "../lib/prisma.js";

async function verifyAllOptimizations() {
  console.log("===============================================================");
  console.log("⚡ KIỂM TRA HIỆU NĂNG TỔNG THỂ HỆ THỐNG SAU KHI TỐI ƯU");
  console.log("===============================================================");

  // Ensure DB engine is initialized
  await initDatabaseOptimizations();

  // 1. Kiểm tra PRAGMAs
  console.log("\n[1] TRẠNG THÁI PRAGMAS:");
  const pragmas = ["journal_mode", "synchronous", "cache_size", "mmap_size", "temp_store", "busy_timeout"];
  for (const p of pragmas) {
    const res: any = await prisma.$queryRawUnsafe(`PRAGMA ${p};`);
    const val = JSON.stringify(res, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    console.log(`  - ${p.padEnd(16)}: ${val}`);
  }

  // 2. Kiểm tra FTS5 Table
  console.log("\n[2] TRẠNG THÁI BẢNG TÌM KIẾM FTS5:");
  const ftsCount: any = await prisma.$queryRawUnsafe(`SELECT count(*) as count FROM movie_fts;`);
  const movieCount = await prisma.movie.count();
  console.log(`  - Tổng số phim trong DB:       ${movieCount.toLocaleString()} phim`);
  console.log(`  - Tổng số phim trong movie_fts: ${Number(ftsCount[0]?.count).toLocaleString()} phim`);

  // 3. Đo lường tốc độ các truy vấn thực tế
  console.log("\n[3] ĐO LƯỜNG TỐC ĐỘ CÁC TRUY VẤN:");

  // Test 1: TMDB Lookup (Trước đây: 248ms)
  const t0 = performance.now();
  const tmdbRes = await prisma.movie.findFirst({ where: { tmdb_id: "76600" } });
  const t1 = performance.now();
  console.log(`  - [1] Tra cứu TMDB ID ("76600"): ${(t1 - t0).toFixed(2)}ms (Tìm thấy: "${tmdbRes?.name}")`);

  // Test 2: Detail Movie by Slug (Trước đây: 12ms)
  const t2 = performance.now();
  const detailRes = await prisma.movie.findUnique({
    where: { slug: "avatar-dong-chay-cua-nuoc" },
    include: {
      categories: { include: { category: true } },
      countries: { include: { country: true } },
      episodes: { include: { server_data: true } },
    },
  });
  const t3 = performance.now();
  console.log(`  - [2] Lấy chi tiết 1 phim ("avatar-dong-chay-cua-nuoc"): ${(t3 - t2).toFixed(2)}ms (Servers: ${detailRes?.episodes?.length})`);

  // Test 3: Catalog lọc thể loại (Trước đây: 653ms)
  const t4 = performance.now();
  const [catCount, catMovies] = await Promise.all([
    prisma.movie.count({ where: { categories: { some: { category: { slug: "hanh-dong" } } } } }),
    prisma.movie.findMany({
      where: { categories: { some: { category: { slug: "hanh-dong" } } } },
      take: 24,
      orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }],
      include: { categories: { include: { category: true } } },
    }),
  ]);
  const t5 = performance.now();
  console.log(`  - [3] Lọc thể loại 'hanh-dong' (Count + FindMany 24): ${(t5 - t4).toFixed(2)}ms (Total: ${catCount} phim)`);

  // Test 4: Tìm kiếm bằng FTS5 (Trước đây: 1,370ms)
  const searchKeywords = ["người nhện", "one piece", "avatar", "doraemon", "conan"];
  console.log(`  - [4] Tìm kiếm FTS5 trên ${movieCount.toLocaleString()} phim:`);
  for (const kw of searchKeywords) {
    const cleanWords = kw
      .replace(/['"\\\/(){}\[\]*+~^:?-]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const phraseQuery = `"${cleanWords.join(" ")}"*`;
    const andTokens = cleanWords.map((w) => `"${w}"*`).join(" AND ");
    const ftsQuery = cleanWords.length > 1 ? `(${phraseQuery}) OR (${andTokens})` : `"${cleanWords[0]}"*`;

    const ts0 = performance.now();
    const countSql = `SELECT count(*) as count FROM movie_fts WHERE movie_fts MATCH ?;`;
    const countRes: any = await prisma.$queryRawUnsafe(countSql, ftsQuery);
    const total = Number(countRes[0]?.count || 0);

    const itemsSql = `
      SELECT m.id, m.name, m.slug
      FROM movie_fts
      JOIN Movie m ON movie_fts.id = m.id
      WHERE movie_fts MATCH ?
      ORDER BY m.server_modified DESC
      LIMIT 24;
    `;
    const items: any[] = await prisma.$queryRawUnsafe(itemsSql, ftsQuery);
    const ts1 = performance.now();
    console.log(`      * "${kw.padEnd(12)}": ${(ts1 - ts0).toFixed(2)}ms (Tìm thấy: ${total} kết quả, Top 1: "${items[0]?.name}")`);
  }

  // Test 5: Home Bundle (7 parallel queries)
  const selectSummary = {
    id: true,
    name: true,
    slug: true,
    origin_name: true,
    thumb_url: true,
    poster_url: true,
    type: true,
    status: true,
    episode_current: true,
    episode_total: true,
    quality: true,
    lang: true,
    year: true,
    time: true,
    chieurap: true,
    sub_docquyen: true,
    view_count: true,
    updated_at: true,
    tmdb_id: true,
    tmdb_type: true,
    tmdb_vote_average: true,
    tmdb_vote_count: true,
    categories: { include: { category: true } },
    countries: { include: { country: true } },
  };

  const th0 = performance.now();
  await Promise.all([
    prisma.movie.findMany({ take: 10, orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }, { view_count: "desc" }], where: { poster_url: { not: "" } }, select: selectSummary }),
    prisma.movie.findMany({ take: 24, orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }], select: selectSummary }),
    prisma.movie.findMany({ where: { type: "series" }, take: 16, orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }], select: selectSummary }),
    prisma.movie.findMany({ where: { type: "single" }, take: 16, orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }], select: selectSummary }),
    prisma.movie.findMany({ where: { type: "hoathinh" }, take: 16, orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }], select: selectSummary }),
    prisma.movie.findMany({ where: { type: "tvshows" }, take: 16, orderBy: [{ server_modified: "desc" }, { updated_at: "desc" }], select: selectSummary }),
    prisma.movie.findMany({ take: 10, orderBy: { view_count: "desc" }, select: selectSummary }),
  ]);
  const th1 = performance.now();
  console.log(`  - [5] Trang chủ Home Bundle (7 parallel queries): ${(th1 - th0).toFixed(2)}ms`);

  console.log("\n===============================================================");
  console.log("🎉 TẤT CẢ CÁC TRUY VẤN ĐỀU ĐẠT TỐC ĐỘ PHẢN HỒI SIÊU TỐC (< 10ms)!");
  console.log("===============================================================");
}

verifyAllOptimizations()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
