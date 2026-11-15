import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import dotenv from "dotenv";

dotenv.config();

declare global {
  var prisma: PrismaClient | undefined;
  var isDbOptimized: boolean | undefined;
}

function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    const adapter = new PrismaLibSql({
      url: tursoUrl,
      authToken: tursoToken,
    });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

let optimizationPromise: Promise<void> | null = null;

export async function initDatabaseOptimizations(): Promise<void> {
  if (global.isDbOptimized) return;
  if (optimizationPromise) return optimizationPromise;

  optimizationPromise = (async () => {
    try {
      // 1. High Performance SQLite PRAGMAs (Chỉ áp dụng khi chạy file SQLite local)
      if (!process.env.TURSO_DATABASE_URL) {
        await prisma.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`).catch(() => {});
        await prisma.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`).catch(() => {});
        await prisma.$queryRawUnsafe(`PRAGMA cache_size = -131072;`).catch(() => {}); // 128MB RAM Cache
        await prisma.$queryRawUnsafe(`PRAGMA mmap_size = 536870912;`).catch(() => {}); // 512MB MMAP
        await prisma.$queryRawUnsafe(`PRAGMA temp_store = MEMORY;`).catch(() => {});
        await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 10000;`).catch(() => {});
      }

      // 2. High-speed Indexes (Chỉ chạy local SQLite, Turso đã có sẵn index)
      if (!process.env.TURSO_DATABASE_URL) {
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Movie_tmdb_id_idx" ON "Movie"("tmdb_id");`).catch(() => {});
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MovieCategory_category_id_movie_id_idx" ON "MovieCategory"("category_id", "movie_id");`).catch(() => {});
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MovieCountry_country_id_movie_id_idx" ON "MovieCountry"("country_id", "movie_id");`).catch(() => {});
      }

      // 3. FTS5 + Triggers + Category normalization: Chỉ chạy local, KHÔNG chạy trên Turso
      // Lý do: FTS5 trên Turso tốn hàng triệu rows read mỗi lần server khởi động
      if (!process.env.TURSO_DATABASE_URL) {
        await prisma.$executeRawUnsafe(`
          CREATE VIRTUAL TABLE IF NOT EXISTS movie_fts USING fts5(
            id UNINDEXED, name, origin_name, slug,
            tokenize = 'unicode61 remove_diacritics 2'
          );
        `).catch(() => {});

        await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS movie_ai AFTER INSERT ON Movie BEGIN INSERT INTO movie_fts(id, name, origin_name, slug) VALUES (new.id, new.name, coalesce(new.origin_name, ''), new.slug); END;`).catch(() => {});
        await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS movie_ad AFTER DELETE ON Movie BEGIN DELETE FROM movie_fts WHERE id = old.id; END;`).catch(() => {});
        await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS movie_au AFTER UPDATE ON Movie BEGIN DELETE FROM movie_fts WHERE id = old.id; INSERT INTO movie_fts(id, name, origin_name, slug) VALUES (new.id, new.name, coalesce(new.origin_name, ''), new.slug); END;`).catch(() => {});

        const ftsCountRes: any = await prisma.$queryRawUnsafe(`SELECT count(*) as count FROM movie_fts;`).catch(() => [{ count: 0 }]);
        const ftsCount = Number((ftsCountRes as any)[0]?.count || 0);
        const movieCount = await prisma.movie.count();
        if (ftsCount !== movieCount) {
          await prisma.$executeRawUnsafe(`DELETE FROM movie_fts;`).catch(() => {});
          await prisma.$executeRawUnsafe(`INSERT INTO movie_fts(id, name, origin_name, slug) SELECT id, name, coalesce(origin_name, ''), slug FROM Movie;`).catch(() => {});
        }

        // Chuẩn hóa danh mục thể loại (chỉ cần 1 lần lúc dev local)
        await prisma.category.deleteMany({ where: { slug: 'tre-em' } }).catch(() => {});
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
