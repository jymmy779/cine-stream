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

      // Check FTS population
      const ftsCountRes: any = await prisma.$queryRawUnsafe(`SELECT count(*) as count FROM movie_fts;`);
      const ftsCount = Number(ftsCountRes[0]?.count || 0);
      const movieCount = await prisma.movie.count();

      if (ftsCount < movieCount) {
        console.log(`[FTS5] Initializing / Syncing search index (${ftsCount} / ${movieCount} movies)...`);
        await prisma.$executeRawUnsafe(`
          INSERT INTO movie_fts(id, name, origin_name, slug)
          SELECT id, name, coalesce(origin_name, ''), slug 
          FROM Movie 
          WHERE id NOT IN (SELECT id FROM movie_fts);
        `);
        console.log(`✅ [FTS5] Search index initialized with ${movieCount} movies.`);
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
