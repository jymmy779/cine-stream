function getEpisodeStatus(movie: any): string {
  const cur = (movie.episode_current || "").toLowerCase().trim();
  if (cur.includes("trailer")) return "Trailer";

  const isSingleMovie =
    (movie.type === "single" ||
      movie.episode_total === 1 ||
      String(movie.episode_total) === "1" ||
      (!movie.episode_total && cur === "full")) &&
    (cur.includes("full") || movie.type === "single");
  if (isSingleMovie) return "Full";

  const isSeries =
    movie.type === "series" ||
    movie.type === "hoathinh" ||
    movie.type === "tvshows" ||
    (movie.episode_total && String(movie.episode_total) !== "1");

  const matchSlash = movie.episode_current?.match(/(\d+)\/(\d+)/);
  if (matchSlash) {
    return `HT (${matchSlash[1]}/${matchSlash[2]})`;
  }

  const totalNumMatch = String(movie.episode_total || "").match(/\d+/);
  const totalNum = totalNumMatch ? totalNumMatch[0] : null;

  if (isSeries) {
    if (cur.includes("full") || cur.includes("hoàn tất") || movie.status === "completed") {
      if (totalNum) return `HT (${totalNum}/${totalNum})`;
      const matchNum = movie.episode_current?.match(/\d+/);
      if (matchNum) return `HT (${matchNum[0]}/${matchNum[0]})`;
      return "HT";
    }

    const matchNum = movie.episode_current?.match(/\d+/);
    if (matchNum) {
      const currentNum = parseInt(matchNum[0], 10);
      if (totalNum && String(currentNum) === totalNum) {
        return `HT (${totalNum}/${totalNum})`;
      }
      return `Tập ${currentNum}`;
    }
    return "Tập mới";
  }

  return "Full";
}

function sortServersForMovie(servers: any[], isSeriesOngoing: boolean): any[] {
  if (!servers || servers.length <= 1) return servers || [];

  return [...servers].sort((a, b) => {
    const countA = a.server_data?.length || 0;
    const countB = b.server_data?.length || 0;

    // Phim bộ ongoing: Ưu tiên server có nhiều tập nhất đứng đầu
    if (isSeriesOngoing && countB !== countA) {
      return countB - countA;
    }

    // Ưu tiên Server M3U8 trực tiếp
    const hasM3u8A = a.server_data?.some((ep: any) => ep.link_m3u8 && ep.link_m3u8.trim().length > 0) ? 1 : 0;
    const hasM3u8B = b.server_data?.some((ep: any) => ep.link_m3u8 && ep.link_m3u8.trim().length > 0) ? 1 : 0;
    if (hasM3u8B !== hasM3u8A) {
      return hasM3u8B - hasM3u8A;
    }

    return 0;
  });
}

function combineLanguages(serverNames: string[]): string {
  const detectedLangs = new Set<string>();
  serverNames.forEach((sName) => {
    const sNameLower = sName.toLowerCase();
    if (sNameLower.includes("vietsub")) detectedLangs.add("Vietsub");
    if (sNameLower.includes("thuyết minh")) detectedLangs.add("Thuyết Minh");
    if (sNameLower.includes("lồng tiếng")) detectedLangs.add("Lồng Tiếng");
    if (sNameLower.includes("song ngữ")) detectedLangs.add("Song Ngữ");
  });

  const order = ["Vietsub", "Thuyết Minh", "Lồng Tiếng", "Song Ngữ"];
  const sortedLangs = Array.from(detectedLangs).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );
  return sortedLangs.join(" + ");
}

async function runPhase2Tests() {
  console.log("==========================================");
  console.log("🧪 BẮT ĐẦU CHẠY KIỂM THỬ PHASE 2 (AGILE)");
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

  // --- 1. TEST EPISODE BADGE STATUS ---
  console.log("--- 1. Kiểm tra Parse & Format Badge Số Tập ---");
  assert(getEpisodeStatus({ type: "single", episode_current: "Full", episode_total: "1" }) === "Full", "Phim lẻ -> Full");
  assert(getEpisodeStatus({ type: "series", episode_current: "Tập 06", episode_total: "14" }) === "Tập 6", "Phim bộ Tập 06/14 -> Tập 6 (chuẩn hoá số 0 ở đầu)");
  assert(getEpisodeStatus({ type: "series", episode_current: "Tập 6 (Vietsub)", episode_total: "14" }) === "Tập 6", "Phim bộ Tập 6 (Vietsub) -> Tập 6");
  assert(getEpisodeStatus({ type: "series", episode_current: "12/12", episode_total: "12" }) === "HT (12/12)", "Phim bộ 12/12 -> HT (12/12)");
  assert(getEpisodeStatus({ type: "series", episode_current: "Hoàn tất (24/24)", episode_total: "24" }) === "HT (24/24)", "Phim bộ Hoàn tất -> HT (24/24)");

  // --- 2. TEST SERVER SORTING FOR ONGOING SERIES ---
  console.log("\n--- 2. Kiểm tra Sắp xếp Server Phim Bộ Ongoing ---");
  const testServers = [
    {
      server_name: "Vietsub #1 KK",
      server_data: [{ name: "Tập 01", link_m3u8: "url1" }, { name: "Tập 02", link_m3u8: "url2" }, { name: "Tập 03", link_m3u8: "url3" }, { name: "Tập 04", link_m3u8: "url4" }],
    },
    {
      server_name: "Thuyết Minh #1 NC",
      server_data: [
        { name: "Tập 01", link_m3u8: "" },
        { name: "Tập 02", link_m3u8: "" },
        { name: "Tập 03", link_m3u8: "" },
        { name: "Tập 04", link_m3u8: "" },
        { name: "Tập 05", link_m3u8: "" },
        { name: "Tập 06", link_m3u8: "" },
      ],
    },
    {
      server_name: "Vietsub #1 VS",
      server_data: [{ name: "Tập 01", link_m3u8: "url1" }, { name: "Tập 02", link_m3u8: "url2" }, { name: "Tập 03", link_m3u8: "url3" }, { name: "Tập 04", link_m3u8: "url4" }, { name: "Tập 05", link_m3u8: "url5" }],
    },
  ];

  const sortedOngoing = sortServersForMovie(testServers, true);
  assert(sortedOngoing[0].server_name === "Thuyết Minh #1 NC", `Phim bộ ongoing: Server nhiều tập nhất (${sortedOngoing[0].server_data.length} tập) được xếp vị trí số 1`);
  assert(sortedOngoing[1].server_name === "Vietsub #1 VS", `Server 5 tập xếp vị trí số 2`);
  assert(sortedOngoing[2].server_name === "Vietsub #1 KK", `Server 4 tập xếp vị trí số 3`);

  // --- 3. TEST COMBINED LANGUAGE BADGE ---
  console.log("\n--- 3. Kiểm tra Gộp Badge Ngôn Ngữ ---");
  const serverNames = ["Vietsub #1 KK", "Thuyết Minh #1 NC", "Lồng Tiếng #1 NC"];
  const combinedLang = combineLanguages(serverNames);
  assert(combinedLang === "Vietsub + Thuyết Minh + Lồng Tiếng", `Gộp đủ tất cả ngôn ngữ: "${combinedLang}"`);

  // --- KẾT QUẢ TỔNG HỢP ---
  console.log("\n==========================================");
  console.log(`📊 KẾT QUẢ PHASE 2: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log("🎉 PHASE 2 ĐÃ HOÀN THÀNH VÀ ĐẠT 100% TIÊU CHÍ NGHIỆM THU!");
  } else {
    console.error("⚠️ CÓ TEST BỊ LỖI, VUI LÒNG KIỂM TRA LẠI.");
  }
  console.log("==========================================\n");
}

runPhase2Tests().catch((e) => console.error("Lỗi testPhase2:", e));
