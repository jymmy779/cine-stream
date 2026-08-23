import {
  STANDARD_CATEGORIES,
  STANDARD_COUNTRIES,
  normalizeCategory,
  normalizeCountry,
  normalizeCategories,
  normalizeCountries,
} from "../services/taxonomyNormalizer.js";
import { prisma } from "../lib/prisma.js";

async function runTaxonomyTests() {
  console.log("==========================================");
  console.log("🧪 BẮT ĐẦU KIỂM THỬ CHUẨN HÓA DANH MỤC TAXONOMY");
  console.log("==========================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  // 1. Kiểm tra Whitelist chuẩn
  console.log("--- 1. Kiểm tra danh sách chuẩn ---");
  assert(STANDARD_CATEGORIES.length === 25, `Số lượng Thể Loại chuẩn: ${STANDARD_CATEGORIES.length} (Kỳ vọng: 25)`);
  assert(STANDARD_COUNTRIES.length === 20, `Số lượng Quốc Gia chuẩn: ${STANDARD_COUNTRIES.length} (Kỳ vọng: 20)`);

  // 2. Kiểm tra bộ lọc Thể loại
  console.log("\n--- 2. Kiểm tra chuẩn hóa Thể Loại ---");
  const c1 = normalizeCategory("Hài");
  assert(c1 !== null && c1.slug === "hai-huoc" && c1.name === "Hài Hước", "Gom 'Hài' -> 'Hài Hước'");

  const c2 = normalizeCategory("Phim Hài");
  assert(c2 !== null && c2.slug === "hai-huoc", "Gom 'Phim Hài' -> 'Hài Hước'");

  const c3 = normalizeCategory("Khoa học viễn tưởng");
  assert(c3 !== null && c3.slug === "vien-tuong", "Gom 'Khoa học viễn tưởng' -> 'Viễn Tưởng'");

  const c4 = normalizeCategory("Sci-Fi & Fantasy");
  assert(c4 !== null && c4.slug === "vien-tuong", "Gom 'Sci-Fi & Fantasy' -> 'Viễn Tưởng'");

  const c5 = normalizeCategory("1998");
  assert(c5 === null, "Lọc bỏ tag là số Năm '1998'");

  const c6 = normalizeCategory("Đang chiếu");
  assert(c6 === null, "Lọc bỏ tag là Trạng thái 'Đang chiếu'");

  const c7 = normalizeCategory("Phim bộ");
  assert(c7 === null, "Lọc bỏ tag là Loại phim 'Phim bộ'");

  const c8 = normalizeCategory("Hàn Quốc");
  assert(c8 === null, "Lọc bỏ tag là Quốc gia bị gửi nhầm vào category");

  // 3. Kiểm tra chuẩn hóa Quốc gia
  console.log("\n--- 3. Kiểm tra chuẩn hóa Quốc Gia ---");
  const q1 = normalizeCountry("United States of America");
  assert(q1 !== null && q1.slug === "au-my" && q1.name === "Âu Mỹ", "Gom 'United States of America' -> 'Âu Mỹ'");

  const q2 = normalizeCountry("Trung Quốc đại lục");
  assert(q2 !== null && q2.slug === "trung-quoc", "Gom 'Trung Quốc đại lục' -> 'Trung Quốc'");

  const q3 = normalizeCountry("BE");
  assert(q3 !== null && q3.slug === "quoc-gia-khac", "Gom mã lạ 'BE' -> 'Quốc Gia Khác'");

  // 4. Kiểm tra Database thực tế
  console.log("\n--- 4. Kiểm tra Database Thực Tế ---");
  const dbCatCount = await prisma.category.count();
  const dbCounCount = await prisma.country.count();

  assert(dbCatCount === 25, `Tổng số Thể Loại trong DB: ${dbCatCount} (Kỳ vọng: 25)`);
  assert(dbCounCount === 20, `Tổng số Quốc Gia trong DB: ${dbCounCount} (Kỳ vọng: 20)`);

  const garbageYearCat = await prisma.category.findFirst({
    where: { slug: { in: ["1931", "1998", "2020", "2026", "dang-chieu", "phim-bo"] } },
  });
  assert(garbageYearCat === null, "Không còn bất kỳ Category rác nào trong CSDL");

  // --- KẾT QUẢ TỔNG HỢP ---
  console.log("\n==========================================");
  console.log(`📊 KẾT QUẢ TEST: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log("🎉 CHUẨN HÓA TAXONOMY ĐÃ HOÀN THÀNH VÀ ĐẠT 100% TIÊU CHÍ!");
  } else {
    console.error("⚠️ CÓ TEST BỊ LỖI, VUI LÒNG KIỂM TRA LẠI.");
  }
  console.log("==========================================\n");

  await prisma.$disconnect();
  process.exit(0);
}

runTaxonomyTests().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
