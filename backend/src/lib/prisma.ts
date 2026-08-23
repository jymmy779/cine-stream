import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
  var isDbOptimized: boolean | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

let optimizationPromise: Promise<void> | null = null;

export async function initDatabaseOptimizations(): Promise<void> {
  if (global.isDbOptimized) return;
  if (optimizationPromise) return optimizationPromise;

  optimizationPromise = (async () => {
    try {
      // 1. High Performance SQLite PRAGMAs
      await prisma.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`);
      await prisma.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`);
      await prisma.$queryRawUnsafe(`PRAGMA cache_size = -131072;`); // 128MB RAM Cache
      await prisma.$queryRawUnsafe(`PRAGMA mmap_size = 536870912;`); // 512MB MMAP
      await prisma.$queryRawUnsafe(`PRAGMA temp_store = MEMORY;`);
      await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 10000;`);

      // 2. High-speed Indexes
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Movie_tmdb_id_idx" ON "Movie"("tmdb_id");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MovieCategory_category_id_movie_id_idx" ON "MovieCategory"("category_id", "movie_id");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MovieCountry_country_id_movie_id_idx" ON "MovieCountry"("country_id", "movie_id");`);

      // 3. FTS5 Virtual Table for Instant Search
      await prisma.$executeRawUnsafe(`
        CREATE VIRTUAL TABLE IF NOT EXISTS movie_fts USING fts5(
          id UNINDEXED,
          name,
          origin_name,
          slug,
          tokenize = 'unicode61 remove_diacritics 2'
        );
      `);

      // 4. Triggers to maintain FTS5 in exact sync
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER IF NOT EXISTS movie_ai AFTER INSERT ON Movie BEGIN
          INSERT INTO movie_fts(id, name, origin_name, slug) VALUES (new.id, new.name, coalesce(new.origin_name, ''), new.slug);
        END;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER IF NOT EXISTS movie_ad AFTER DELETE ON Movie BEGIN
          DELETE FROM movie_fts WHERE id = old.id;
        END;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER IF NOT EXISTS movie_au AFTER UPDATE ON Movie BEGIN
          DELETE FROM movie_fts WHERE id = old.id;
          INSERT INTO movie_fts(id, name, origin_name, slug) VALUES (new.id, new.name, coalesce(new.origin_name, ''), new.slug);
        END;
      `);

      // Check FTS population and deduplicate if count differs
      const ftsCountRes: any = await prisma.$queryRawUnsafe(`SELECT count(*) as count FROM movie_fts;`);
      const ftsCount = Number(ftsCountRes[0]?.count || 0);
      const movieCount = await prisma.movie.count();

      if (ftsCount !== movieCount) {
        console.log(`[FTS5] Rebuilding / Syncing search index (${ftsCount} vs ${movieCount} movies)...`);
        await prisma.$executeRawUnsafe(`DELETE FROM movie_fts;`);
        await prisma.$executeRawUnsafe(`
          INSERT INTO movie_fts(id, name, origin_name, slug)
          SELECT id, name, coalesce(origin_name, ''), slug 
          FROM Movie;
        `);
        console.log(`✅ [FTS5] Search index rebuilt cleanly with ${movieCount} movies.`);
      }

      // 5. Chuẩn hóa danh mục thể loại (Đảm bảo 29 thể loại chuẩn, xóa mục trùng 'tre-em')
      const standardCategories = [
        { name: 'Bí Ẩn', slug: 'bi-an' },
        { name: 'Chiến Tranh', slug: 'chien-tranh' },
        { name: 'Chính Kịch', slug: 'chinh-kich' },
        { name: 'Cổ Trang', slug: 'co-trang' },
        { name: 'Gia Đình', slug: 'gia-dinh' },
        { name: 'Giật Gân', slug: 'giat-gan' },
        { name: 'Hoạt Hình', slug: 'hoat-hinh' },
        { name: 'Hài Hước', slug: 'hai-huoc' },
        { name: 'Hành Động', slug: 'hanh-dong' },
        { name: 'Hình Sự', slug: 'hinh-su' },
        { name: 'Học Đường', slug: 'hoc-duong' },
        { name: 'Khoa Học', slug: 'khoa-hoc' },
        { name: 'Kinh Dị', slug: 'kinh-di' },
        { name: 'Kinh Điển', slug: 'kinh-dien' },
        { name: 'Lịch Sử', slug: 'lich-su' },
        { name: 'Miền Tây', slug: 'mien-tay' },
        { name: 'Phim 18+', slug: 'phim-18' },
        { name: 'Phim Ngắn', slug: 'phim-ngan' },
        { name: 'Phiêu Lưu', slug: 'phieu-luu' },
        { name: 'Thiếu Nhi', slug: 'thieu-nhi' },
        { name: 'Thần Thoại', slug: 'than-thoai' },
        { name: 'Thể Thao', slug: 'the-thao' },
        { name: 'Tiên Hiệp', slug: 'tien-hiep' },
        { name: 'Tài Liệu', slug: 'tai-lieu' },
        { name: 'Tâm Lý', slug: 'tam-ly' },
        { name: 'Tình Cảm', slug: 'tinh-cam' },
        { name: 'Viễn Tưởng', slug: 'vien-tuong' },
        { name: 'Võ Thuật', slug: 'vo-thuat' },
        { name: 'Âm Nhạc', slug: 'am-nhac' },
      ];
      await prisma.category.deleteMany({ where: { slug: 'tre-em' } });
      for (const cat of standardCategories) {
        await prisma.category.upsert({
          where: { slug: cat.slug },
          update: { name: cat.name },
          create: { name: cat.name, slug: cat.slug },
        });
      }

      global.isDbOptimized = true;
      console.log("⚡ [Database] SQLite High-Performance Engine (WAL, 128MB Cache, 512MB MMAP, FTS5) Activated.");
    } catch (err: any) {
      console.error("[Database] Error configuring optimizations:", err.message);
    } finally {
      optimizationPromise = null;
    }
  })();

  return optimizationPromise;
}
