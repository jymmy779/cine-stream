import { prisma } from "../lib/prisma.js";
import {
  STANDARD_CATEGORIES,
  STANDARD_COUNTRIES,
  normalizeCategory,
  normalizeCountry,
} from "../services/taxonomyNormalizer.js";

async function main() {
  console.log("=================================================");
  console.log("🧹 BẮT ĐẦU DỌN DẸP & CHUẨN HÓA TOÀN DIỆN TAXONOMY");
  console.log("=================================================\n");

  // 1. SEED DANH MỤC CHUẨN VÀO CSDL
  console.log("1. Cập nhật / Khởi tạo danh mục chuẩn LoFilm...");
  for (const cat of STANDARD_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug },
    });
  }
  console.log(`   ✓ Đã cập nhật ${STANDARD_CATEGORIES.length} Thể Loại chuẩn.`);

  for (const coun of STANDARD_COUNTRIES) {
    await prisma.country.upsert({
      where: { slug: coun.slug },
      update: { name: coun.name },
      create: { name: coun.name, slug: coun.slug },
    });
  }
  console.log(`   ✓ Đã cập nhật ${STANDARD_COUNTRIES.length} Quốc Gia chuẩn.`);

  // Cache ID của các Category & Country chuẩn
  const dbStandardCategories = await prisma.category.findMany({
    where: { slug: { in: STANDARD_CATEGORIES.map((c) => c.slug) } },
  });
  const standardCatIdMap = new Map<string, string>(
    dbStandardCategories.map((c) => [c.slug, c.id])
  );

  const dbStandardCountries = await prisma.country.findMany({
    where: { slug: { in: STANDARD_COUNTRIES.map((c) => c.slug) } },
  });
  const standardCounIdMap = new Map<string, string>(
    dbStandardCountries.map((c) => [c.slug, c.id])
  );

  const validCategorySlugs = new Set(STANDARD_CATEGORIES.map((c) => c.slug));
  const validCountrySlugs = new Set(STANDARD_COUNTRIES.map((c) => c.slug));

  // 2. DỌN DẸP LIÊN KẾT MOVIECATEGORY & REMAP SANG CHUẨN
  console.log("\n2. Quét và chuyển đổi các liên kết Thể Loại (MovieCategory)...");
  const allDbCategories = await prisma.category.findMany();
  let remappedCatCount = 0;

  for (const oldCat of allDbCategories) {
    if (validCategorySlugs.has(oldCat.slug)) continue;

    // Tìm xem slug cũ này có map được về thể loại chuẩn nào không
    const mapped = normalizeCategory({ name: oldCat.name, slug: oldCat.slug });
    const targetCatId = mapped ? standardCatIdMap.get(mapped.slug) : null;

    const movieCatLinks = await prisma.movieCategory.findMany({
      where: { category_id: oldCat.id },
    });

    for (const link of movieCatLinks) {
      if (targetCatId && targetCatId !== oldCat.id) {
        // Remap sang category chuẩn
        await prisma.movieCategory.upsert({
          where: {
            movie_id_category_id: {
              movie_id: link.movie_id,
              category_id: targetCatId,
            },
          },
          update: {},
          create: {
            movie_id: link.movie_id,
            category_id: targetCatId,
          },
        });
        remappedCatCount++;
      }
    }

    // Xóa toàn bộ liên kết với category rác
    await prisma.movieCategory.deleteMany({
      where: { category_id: oldCat.id },
    });

    // Xóa bản ghi Category rác
    await prisma.category.delete({
      where: { id: oldCat.id },
    });
  }
  console.log(`   ✓ Đã remap ${remappedCatCount} liên kết thể loại sang danh mục chuẩn.`);
  console.log(`   ✓ Đã xóa sạch các Category rác.`);

  // 3. DỌN DẸP LIÊN KẾT MOVIECOUNTRY & REMAP SANG CHUẨN
  console.log("\n3. Quét và chuyển đổi các liên kết Quốc Gia (MovieCountry)...");
  const allDbCountries = await prisma.country.findMany();
  let remappedCounCount = 0;

  for (const oldCoun of allDbCountries) {
    if (validCountrySlugs.has(oldCoun.slug)) continue;

    // Map sang quốc gia chuẩn (hoặc quốc gia khác)
    const mapped = normalizeCountry({ name: oldCoun.name, slug: oldCoun.slug });
    const targetCounId = mapped ? standardCounIdMap.get(mapped.slug) : standardCounIdMap.get("quoc-gia-khac");

    const movieCounLinks = await prisma.movieCountry.findMany({
      where: { country_id: oldCoun.id },
    });

    for (const link of movieCounLinks) {
      if (targetCounId && targetCounId !== oldCoun.id) {
        await prisma.movieCountry.upsert({
          where: {
            movie_id_country_id: {
              movie_id: link.movie_id,
              country_id: targetCounId,
            },
          },
          update: {},
          create: {
            movie_id: link.movie_id,
            country_id: targetCounId,
          },
        });
        remappedCounCount++;
      }
    }

    // Xóa toàn bộ liên kết với country rác
    await prisma.movieCountry.deleteMany({
      where: { country_id: oldCoun.id },
    });

    // Xóa bản ghi Country rác
    await prisma.country.delete({
      where: { id: oldCoun.id },
    });
  }
  console.log(`   ✓ Đã remap ${remappedCounCount} liên kết quốc gia sang danh mục chuẩn.`);
  console.log(`   ✓ Đã xóa sạch các Country rác.`);

  // 4. KIỂM TRA LẠI TỔNG SỐ BẢN GHI SAU KHI DỌN DẸP
  const finalCatCount = await prisma.category.count();
  const finalCounCount = await prisma.country.count();

  console.log("\n=================================================");
  console.log(`🎉 HOÀN TẤT DỌN DẸP:`);
  console.log(`   - Tổng Thể Loại trong DB: ${finalCatCount} (Kỳ vọng: 25)`);
  console.log(`   - Tổng Quốc Gia trong DB: ${finalCounCount} (Kỳ vọng: 20)`);
  console.log("=================================================\n");

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi khi dọn dẹp taxonomy:", err);
  process.exit(1);
});
