import { prisma } from "../lib/prisma.js";
import axios from "axios";

async function syncMissingCategories() {
  const cats = ['kinh-dien', 'lich-su', 'mien-tay', 'phim-18'];

  for (const catSlug of cats) {
    console.log(`🔄 Đang quét thể loại: ${catSlug}`);
    const category = await prisma.category.findUnique({ where: { slug: catSlug } });
    if (!category) {
      console.log(`❌ Không tìm thấy category trong DB: ${catSlug}`);
      continue;
    }

    let page = 1;
    let totalPages = 1;
    let linkedCount = 0;

    while (page <= totalPages) {
      try {
        const res = await axios.get(`https://phimapi.com/v1/api/the-loai/${catSlug}?page=${page}&limit=64`, { timeout: 10000 });
        const data = res.data?.data;
        totalPages = data?.params?.pagination?.totalPages || 1;
        const items = data?.items || [];

        for (const item of items) {
          let movie = await prisma.movie.findUnique({ where: { slug: item.slug } });
          if (!movie) {
            movie = await prisma.movie.create({
              data: {
                slug: item.slug,
                name: item.name,
                origin_name: item.origin_name || '',
                thumb_url: item.thumb_url || '',
                poster_url: item.poster_url || '',
                year: item.year ? Number(item.year) : null,
                episode_current: item.episode_current || 'Full',
                quality: item.quality || 'HD',
                lang: item.lang || 'Vietsub',
                type: item.type || 'single',
                status: 'ongoing',
                server_modified: new Date(),
              },
            });
          }

          if (movie) {
            await prisma.movieCategory.upsert({
              where: {
                movie_id_category_id: {
                  movie_id: movie.id,
                  category_id: category.id,
                },
              },
              update: {},
              create: {
                movie_id: movie.id,
                category_id: category.id,
              },
            });
            linkedCount++;
          }
        }
        page++;
      } catch (err: any) {
        console.error(`Lỗi fetch page ${page} ${catSlug}:`, err.message);
        break;
      }
    }
    console.log(`✅ Hoàn tất ${catSlug} -> Liên kết thành công ${linkedCount} phim.`);
  }

  await prisma.$disconnect();
}

syncMissingCategories().catch(console.error);
