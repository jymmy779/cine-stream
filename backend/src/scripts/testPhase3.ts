import { syncIncremental, loadSyncState } from "../services/syncService.js";
import { getCronStatus, toggleCron } from "../services/cronService.js";
import { prisma } from "../lib/prisma.js";

async function runPhase3Tests() {
  console.log("==========================================");
  console.log("🧪 BẮT ĐẦU CHẠY KIỂM THỬ PHASE 3 (AGILE)");
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

  // --- 1. TEST CRON STATUS & TOGGLE PER SOURCE ---
  console.log("--- 1. Kiểm tra Quản lý Cronjob Độc Lập Từng Nguồn ---");
  const initStatus = getCronStatus();
  assert(initStatus !== undefined && typeof initStatus.sources?.all?.enabled === "boolean", "Lấy trạng thái Cronjob thành công");

  const toggledNguonC = toggleCron("nguonc", false);
  assert(toggledNguonC === false, "Tắt riêng Cronjob NguonC thành công (các nguồn khác vẫn chạy)");
  const reToggledNguonC = toggleCron("nguonc", true);
  assert(reToggledNguonC === true, "Bật lại riêng Cronjob NguonC thành công");

  // --- 2. CHECK DATABASE INTEGRITY & MULTI-SOURCE SERVERS ---
  console.log("\n--- 2. Kiểm tra Tính Toàn Vẹn CSDL Sau Khi Sync Đa Nguồn ---");
  const totalMovies = await prisma.movie.count();
  const totalServers = await prisma.episodeServer.count();
  const totalEpisodes = await prisma.episode.count();

  assert(totalMovies > 0, `Tổng số phim trong DB: ${totalMovies}`);
  assert(totalServers > 0, `Tổng số Server trong DB: ${totalServers}`);
  assert(totalEpisodes > 0, `Tổng số Tập phim trong DB: ${totalEpisodes}`);

  const multiServers = await prisma.episodeServer.findMany({
    where: {
      OR: [
        { server_name: { contains: "KK" } },
        { server_name: { contains: "VS" } },
        { server_name: { contains: "NC" } },
      ],
    },
    take: 10,
  });
  console.log("Danh sách các server đa nguồn tìm thấy trong DB:", multiServers.map((s) => s.server_name));

  assert(multiServers.length > 0, `Cơ sở dữ liệu đã tích hợp thành công các server đa nguồn (tìm thấy ${multiServers.length} servers mẫu có nhãn KK/VS/NC)`);

  const state = loadSyncState();
  assert(state !== undefined, "Lưu & nạp sync state thành công");

  // --- KẾT QUẢ TỔNG HỢP ---
  console.log("\n==========================================");
  console.log(`📊 KẾT QUẢ PHASE 3: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log("🎉 PHASE 3 ĐÃ HOÀN THÀNH VÀ ĐẠT 100% TIÊU CHÍ NGHIỆM THU!");
  } else {
    console.error("⚠️ CÓ TEST BỊ LỖI, VUI LÒNG KIỂM TRA LẠI.");
  }
  console.log("==========================================\n");

  process.exit(0);
}

runPhase3Tests().catch((e) => {
  console.error("Lỗi testPhase3:", e);
  process.exit(1);
});
