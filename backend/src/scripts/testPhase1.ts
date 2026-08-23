import { fetchKKPhimUpdatedPage, fetchKKPhimMovieDetail } from "../services/kkphimClient.js";
import { fetchVSMovUpdatedPage, fetchVSMovMovieDetail } from "../services/vsmovClient.js";
import { fetchNguonCUpdatedPage, fetchNguonCMovieDetail } from "../services/nguoncClient.js";
import {
  cleanOriginName,
  extractRootSlug,
  jaroWinklerSimilarity,
  combinedTextSimilarity,
  removeAccents,
} from "../services/movieMatcher.js";

async function runPhase1Tests() {
  console.log("==========================================");
  console.log("🧪 BẮT ĐẦU CHẠY KIỂM THỬ PHASE 1 (AGILE)");
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

  // --- 1. TEST STRING UTILITIES & MATCHING LOGIC ---
  console.log("--- 1. Kiểm tra Thuật toán Xử lý Chuỗi & Đối Soát ---");
  
  assert(removeAccents("Đảo Hải Tặc - Vua Hải Tặc") === "Dao Hai Tac - Vua Hai Tac", "removeAccents xử lý đúng tiếng Việt có dấu/chữ Đ");

  const cleanOrigin1 = cleanOriginName("Squid Game (Season 2) (2024) (TV)");
  const cleanOrigin2 = cleanOriginName("Squid Game Season 2");
  assert(cleanOrigin1 === "squid game 2" && cleanOrigin2 === "squid game 2", `cleanOriginName chuẩn hoá season/tags: "${cleanOrigin1}" === "${cleanOrigin2}"`);

  const root1 = extractRootSlug("dao-hai-tac-thuyet-minh-2024");
  const root2 = extractRootSlug("dao-hai-tac-vietsub-phan-1");
  const root3 = extractRootSlug("dao-hai-tac");
  assert(root1 === "dao-hai-tac" && root2 === "dao-hai-tac" && root3 === "dao-hai-tac", `extractRootSlug trích xuất đúng: "${root1}", "${root2}", "${root3}"`);

  const sim1 = combinedTextSimilarity("Đảo Hải Tặc", "Vua Hải Tặc (Đảo Hải Tặc)");
  const sim2 = jaroWinklerSimilarity("One Piece", "One Piece");
  assert(sim2 === 1.0, "Jaro-Winkler khớp 100% khi chuỗi giống nhau");
  assert(sim1 >= 0.8, `combinedTextSimilarity nhận diện chuỗi con/tương đồng (${(sim1 * 100).toFixed(1)}%)`);

  // --- 2. TEST KKPHIM CLIENT ---
  console.log("\n--- 2. Kiểm tra API Client KKPhim ---");
  const kkList = await fetchKKPhimUpdatedPage(1);
  assert(kkList !== null && kkList.items.length > 0, `KKPhim fetch page 1 thành công (${kkList?.items.length} phim)`);
  
  if (kkList && kkList.items[0]) {
    const kkDetail = await fetchKKPhimMovieDetail(kkList.items[0].slug);
    assert(kkDetail !== null && kkDetail.movie !== undefined && kkDetail.episodes.length > 0, `KKPhim fetch detail "${kkList.items[0].slug}" thành công (${kkDetail?.episodes.length} servers)`);
  }

  // --- 3. TEST VSMOV CLIENT ---
  console.log("\n--- 3. Kiểm tra API Client VSMov ---");
  const vsList = await fetchVSMovUpdatedPage(1);
  assert(vsList !== null && vsList.items.length > 0, `VSMov fetch page 1 thành công (${vsList?.items.length} phim)`);
  
  if (vsList && vsList.items[0]) {
    const vsDetail = await fetchVSMovMovieDetail(vsList.items[0].slug);
    assert(vsDetail !== null && vsDetail.movie !== undefined && vsDetail.episodes.length > 0, `VSMov fetch detail "${vsList.items[0].slug}" thành công (${vsDetail?.episodes.length} servers)`);
  }

  // --- 4. TEST NGUONC CLIENT ---
  console.log("\n--- 4. Kiểm tra API Client NguonC ---");
  const ncList = await fetchNguonCUpdatedPage(1);
  assert(ncList !== null && ncList.items.length > 0, `NguonC fetch page 1 thành công (${ncList?.items.length} phim)`);
  
  if (ncList && ncList.items[0]) {
    const ncDetail = await fetchNguonCMovieDetail(ncList.items[0].slug);
    assert(ncDetail !== null && ncDetail.movie !== undefined && ncDetail.episodes.length > 0, `NguonC fetch detail "${ncList.items[0].slug}" thành công (${ncDetail?.episodes.length} servers)`);
  }

  // --- KẾT QUẢ TỔNG HỢP ---
  console.log("\n==========================================");
  console.log(`📊 KẾT QUẢ PHASE 1: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log("🎉 PHASE 1 ĐÃ HOÀN THÀNH VÀ ĐẠT 100% TIÊU CHÍ NGHIỆM THU!");
  } else {
    console.error("⚠️ CÓ TEST BỊ LỖI, VUI LÒNG KIỂM TRA LẠI.");
  }
  console.log("==========================================\n");
}

runPhase1Tests().catch((e) => console.error("Lỗi testPhase1:", e));
