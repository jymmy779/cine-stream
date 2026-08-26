"use client";

import React, { useState, useEffect, useRef, useTransition, useCallback } from "react";
import toast from "react-hot-toast";
import {
  triggerInstantSyncAction,
  toggleCronAction,
  startBulkSyncAction,
  pauseBulkSyncAction,
  mergeMoviesAction,
  searchMoviesForRefreshAction,
  refreshSelectedMoviesAction,
} from "@/app/actions/adminSync";

type SourceType = "all" | "kkphim" | "vsmov" | "nguonc";

interface RefreshMovieOption {
  id: string;
  name: string;
  origin_name?: string | null;
  slug: string;
  year?: number | null;
  quality?: string | null;
}

const SOURCE_TABS: Array<{
  id: SourceType;
  label: string;
  shortName: string;
  icon: string;
  badgeColor: string;
  estPages: string;
}> = [
    { id: "all", label: "Tổng Hợp Cả 3 Nguồn", shortName: "Tất cả", icon: "fa-solid fa-globe", badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30", estPages: "~5.500 trang" },
    { id: "kkphim", label: "KKPhim (Nguồn chính)", shortName: "KKPhim", icon: "fa-solid fa-film", badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30", estPages: "~1.250 trang" },
    { id: "vsmov", label: "VSMov", shortName: "VSMov", icon: "fa-solid fa-bolt", badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30", estPages: "~800 trang" },
    { id: "nguonc", label: "NguonC", shortName: "NguonC", icon: "fa-solid fa-tv", badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", estPages: "~3.350 trang" },
  ];

export default function SyncManagerTab() {
  const [activeSource, setActiveSource] = useState<SourceType>("all");
  const [statusData, setStatusData] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  // Instant Sync form state
  const [instantPages, setInstantPages] = useState("2");
  const [isInstantSyncing, setIsInstantSyncing] = useState(false);

  // Bulk Sync inputs riêng cho từng tab nguồn
  const [pageInputs, setPageInputs] = useState<Record<SourceType, { start: string; max: string }>>({
    all: { start: "1", max: "" },
    kkphim: { start: "1", max: "" },
    vsmov: { start: "1", max: "" },
    nguonc: { start: "1", max: "" },
  });
  const [isBulkStarting, setIsBulkStarting] = useState(false);

  // Selected movie refresh
  const [refreshQuery, setRefreshQuery] = useState("");
  const [refreshSearchResults, setRefreshSearchResults] = useState<RefreshMovieOption[]>([]);
  const [selectedRefreshMovies, setSelectedRefreshMovies] = useState<RefreshMovieOption[]>([]);
  const [isSearchingRefresh, setIsSearchingRefresh] = useState(false);
  const [isRefreshingSelected, setIsRefreshingSelected] = useState(false);
  const [refreshResults, setRefreshResults] = useState<any[]>([]);

  // Merge form state
  const [sourceSlug, setSourceSlug] = useState("");
  const [targetSlug, setTargetSlug] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  // Terminal Live Feed state
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const isManuallyScrollingRef = useRef(false);

  const handleTerminalScroll = () => {
    if (!terminalRef.current || isManuallyScrollingRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    // Chỉ kích hoạt lại auto-scroll khi người dùng đã cuộn xuống sát đáy (<= 30px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 30;
    if (isAtBottom) {
      setIsAutoScroll(true);
    } else {
      // Người dùng cuộn lên trên -> Tắt auto-scroll ngay để giữ màn hình yên tĩnh
      setIsAutoScroll(false);
    }
  };

  const scrollToTop = () => {
    if (terminalRef.current) {
      isManuallyScrollingRef.current = true;
      setIsAutoScroll(false);
      terminalRef.current.scrollTop = 0;
      setTimeout(() => {
        isManuallyScrollingRef.current = false;
      }, 300);
    }
  };

  const scrollToBottom = () => {
    if (terminalRef.current) {
      isManuallyScrollingRef.current = true;
      setIsAutoScroll(true);
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      setTimeout(() => {
        isManuallyScrollingRef.current = false;
      }, 300);
    }
  };

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sync/status", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.data) {
        setStatusData(json.data);
      }
    } catch {
      // Bỏ qua lỗi mạng tạm thời khi polling
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => {
      loadStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadStatus]);

  useEffect(() => {
    const query = refreshQuery.trim();
    if (query.length < 2) {
      setRefreshSearchResults([]);
      setIsSearchingRefresh(false);
      return;
    }

    setIsSearchingRefresh(true);
    const timer = setTimeout(async () => {
      const response = await searchMoviesForRefreshAction(query);
      setRefreshSearchResults(response?.status && Array.isArray(response.data) ? response.data : []);
      setIsSearchingRefresh(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [refreshQuery]);

  // Tự động cuộn xuống đáy khi có log mới NẾU đang bật auto-scroll
  useEffect(() => {
    if (isAutoScroll && !isManuallyScrollingRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [statusData?.bulk?.live_logs, isAutoScroll]);

  const handleInstantSync = async () => {
    setIsInstantSyncing(true);
    const pagesNum = parseInt(instantPages, 10) || 2;
    try {
      const res = await triggerInstantSyncAction(activeSource, pagesNum);
      if (res.status) {
        toast.success(res.msg || "Đã kích hoạt đồng bộ nhanh!");
        loadStatus();
      } else {
        toast.error(res.msg || "Lỗi khi kích hoạt đồng bộ");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối");
    } finally {
      setIsInstantSyncing(false);
    }
  };

  const handleToggleCron = async () => {
    startTransition(async () => {
      try {
        const res = await toggleCronAction(activeSource);
        if (res.status) {
          toast.success(res.msg || "Đã thay đổi trạng thái cronjob!");
          loadStatus();
        } else {
          toast.error(res.msg || "Lỗi khi bật/tắt cronjob");
        }
      } catch (err: any) {
        toast.error(err.message || "Lỗi kết nối");
      }
    });
  };

  const handleStartBulk = async () => {
    setIsBulkStarting(true);
    const curInputs = pageInputs[activeSource];
    const sPage = parseInt(curInputs.start, 10) || 1;
    const mPages = curInputs.max ? parseInt(curInputs.max, 10) : undefined;

    try {
      const res = await startBulkSyncAction(activeSource, sPage, mPages);
      if (res.status) {
        toast.success(res.msg || "Đã bắt đầu cào Full!");
        loadStatus();
      } else {
        toast.error(res.msg || "Lỗi khi bắt đầu cào");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối");
    } finally {
      setIsBulkStarting(false);
    }
  };

  const handlePauseBulk = async () => {
    try {
      const res = await pauseBulkSyncAction();
      if (res.status) {
        toast.success(res.msg || "Đã gửi lệnh tạm dừng!");
        loadStatus();
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối");
    }
  };

  const handleMergeMovies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceSlug.trim() || !targetSlug.trim()) {
      toast.error("Vui lòng nhập đầy đủ slug nguồn và slug đích");
      return;
    }
    if (sourceSlug.trim() === targetSlug.trim()) {
      toast.error("Slug nguồn và slug đích không được giống nhau");
      return;
    }

    setIsMerging(true);
    try {
      const res = await mergeMoviesAction(sourceSlug.trim(), targetSlug.trim());
      if (res.status) {
        toast.success(res.msg || "Gộp phim thành công!");
        setSourceSlug("");
        setTargetSlug("");
        loadStatus();
      } else {
        toast.error(res.msg || "Lỗi khi gộp phim");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối");
    } finally {
      setIsMerging(false);
    }
  };

  const toggleRefreshMovie = (movie: RefreshMovieOption) => {
    setSelectedRefreshMovies((current) => {
      if (current.some((item) => item.slug === movie.slug)) {
        return current.filter((item) => item.slug !== movie.slug);
      }
      if (current.length >= 50) {
        toast.error("Mỗi lượt chỉ được chọn tối đa 50 phim");
        return current;
      }
      return [...current, movie];
    });
  };

  const handleRefreshSelected = async () => {
    if (selectedRefreshMovies.length === 0) {
      toast.error("Hãy chọn ít nhất một phim");
      return;
    }

    setIsRefreshingSelected(true);
    setRefreshResults([]);
    try {
      const response = await refreshSelectedMoviesAction(
        selectedRefreshMovies.map((movie) => movie.slug),
        activeSource,
      );
      if (Array.isArray(response?.data?.results)) setRefreshResults(response.data.results);
      if (response?.status) {
        toast.success(response.msg || "Đã cào lại phim được chọn");
        loadStatus();
      } else {
        toast.error(response?.msg || "Không cào lại được phim đã chọn");
      }
    } catch (error: any) {
      toast.error(error.message || "Lỗi kết nối backend");
    } finally {
      setIsRefreshingSelected(false);
    }
  };

  // Trạng thái cron của nguồn hiện tại
  const currentCronSource = statusData?.cron?.sources?.[activeSource] || { enabled: true, last_run_time: null, last_run_result: null };
  const isCronEnabled = currentCronSource.enabled ?? true;
  const isSyncRunning = statusData?.cron?.is_sync_running || statusData?.bulk?.is_running;
  const bulkState = statusData?.bulk || {};
  const isThisTabRunning = bulkState.is_running && bulkState.current_source === activeSource;
  const isOtherTabRunning = bulkState.is_running && bulkState.current_source !== activeSource;

  // Tính toán phần trăm thanh progress
  const progressPercent = typeof bulkState.percent_num === "number"
    ? Math.min(100, Math.max(0, bulkState.percent_num))
    : (parseInt(bulkState.percent || "0", 10) || 0);

  const sourceStats = statusData?.sourceStats?.[activeSource];
  const exactPagesText = sourceStats?.totalPages
    ? `${sourceStats.totalPages.toLocaleString()} trang (${sourceStats.totalItems.toLocaleString()} phim)`
    : (bulkState.current_source === activeSource && bulkState.total_pages
      ? `${bulkState.total_pages.toLocaleString()} trang`
      : SOURCE_TABS.find(t => t.id === activeSource)?.estPages);

  const currentTabInputs = pageInputs[activeSource];

  return (
    <div className="space-y-8 animate-fade-in text-gray-200">
      {/* HEADER TABS: 4 Tabs Nguồn */}
      <div className="flex flex-wrap gap-2 md:gap-3 p-1.5 bg-[#14171E] rounded-xl border border-white/5">
        {SOURCE_TABS.map((tab) => {
          const isActive = activeSource === tab.id;
          const isTabCrawling = bulkState.is_running && bulkState.current_source === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSource(tab.id)}
              className={`flex-1 min-w-[160px] py-3 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2.5 relative ${isActive
                ? "bg-[#D497FF] text-black shadow-lg shadow-[#D497FF]/20 font-bold"
                : "bg-transparent text-gray-400 hover:text-white hover:bg-white/5"
                }`}
            >
              <i className={tab.icon}></i>
              <span>{tab.label}</span>
              {isTabCrawling && (
                <span className="flex h-2 w-2 relative ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* BANNER THÔNG BÁO NẾU CÓ NGUỒN KHÁC ĐANG CHẠY */}
      {isOtherTabRunning && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="text-xs text-amber-200">
              Hệ thống đang bận cào ngầm nguồn <strong className="uppercase text-amber-400">{bulkState.current_source}</strong> (Trang {bulkState.current_page || 1}/{bulkState.total_pages || "..."} - {bulkState.percent || "0%"}). Nguồn <strong>{SOURCE_TABS.find(t => t.id === activeSource)?.shortName}</strong> đang ở trạng thái chờ.
            </span>
          </div>
          <button
            onClick={handlePauseBulk}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition shrink-0"
          >
            <i className="fa-solid fa-pause mr-1"></i> Tạm Dừng Nguồn Đang Chạy
          </button>
        </div>
      )}

      {/* 2 KHU VỰC CHÍNH: CRONJOB 15 PHÚT & CÀO FULL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KHU VỰC 1: CRONJOB 15 PHÚT & ĐỒNG BỘ TỨC THÌ */}
        <div className="bg-[#14171E] border border-white/5 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-lg">
                  <i className="fa-solid fa-clock-rotate-left"></i>
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Tự Động Cập Nhật (Cronjob)</h3>
                  <p className="text-xs text-gray-400">
                    Tần suất: <strong className="text-blue-400">15 phút / lần</strong> | Nguồn: <strong className="text-white">{SOURCE_TABS.find(t => t.id === activeSource)?.label}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleCron}
                disabled={isPending}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${isCronEnabled
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  }`}
              >
                <i className={`fa-solid ${isCronEnabled ? "fa-toggle-on" : "fa-toggle-off"} text-sm`}></i>
                {isCronEnabled ? "Đang BẬT" : "Đang TẮT"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-black/30 p-3.5 rounded-xl border border-white/5">
                <span className="text-[11px] text-gray-400 block mb-1">Lần chạy gần nhất:</span>
                <span className="text-sm font-semibold text-white">
                  {currentCronSource?.last_run_time
                    ? new Date(currentCronSource.last_run_time).toLocaleTimeString("vi-VN") +
                    " (" +
                    new Date(currentCronSource.last_run_time).toLocaleDateString("vi-VN") +
                    ")"
                    : "Sẵn sàng"}
                </span>
              </div>
              <div className="bg-black/30 p-3.5 rounded-xl border border-white/5">
                <span className="text-[11px] text-gray-400 block mb-1">Kết quả lần trước:</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {currentCronSource?.last_run_result
                    ? `+${currentCronSource.last_run_result.created || 0} mới, ~${currentCronSource.last_run_result.updated || 0} update`
                    : (isCronEnabled ? "Đang chờ chu kỳ 15p ⏳" : "Đang tắt")}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-transparent p-5 rounded-xl border border-amber-500/20">
            <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-2">
              <i className="fa-solid fa-bolt"></i> Nút Đồng Bộ Tức Thì (Instant Refresh)
            </h4>
            <p className="text-xs text-gray-400 mb-4">
              Không cần chờ đến mốc 15 phút. Bấm nút dưới đây để quét ngay các trang mới nhất của{" "}
              <strong className="text-white">{SOURCE_TABS.find((t) => t.id === activeSource)?.label}</strong>.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-gray-400 whitespace-nowrap">Số trang:</span>
                <select
                  value={instantPages}
                  onChange={(e) => setInstantPages(e.target.value)}
                  className="bg-[#0F1115] border border-white/10 text-white rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  <option value="1">1 Trang (~24 phim)</option>
                  <option value="2">2 Trang (~48 phim)</option>
                  <option value="3">3 Trang (~72 phim)</option>
                  <option value="5">5 Trang (~120 phim)</option>
                </select>
              </div>

              <button
                onClick={handleInstantSync}
                disabled={isInstantSyncing || isSyncRunning}
                className="w-full sm:flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold py-2.5 px-5 rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                {isInstantSyncing ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> Đang gửi lệnh...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-bolt"></i> Quét Ngay {instantPages} Trang
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* KHU VỰC 2: CÀO TOÀN BỘ (BULK FULL CRAWLER) */}
        <div className="bg-[#14171E] border border-white/5 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-lg">
                  <i className="fa-solid fa-database"></i>
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Cào Toàn Bộ Kho Phim (Bulk Seeder)</h3>
                  <p className="text-xs text-gray-400">
                    Nguồn: <strong className="text-[#D497FF]">{SOURCE_TABS.find(t => t.id === activeSource)?.label}</strong> (
                    <span className="text-amber-300 font-medium">
                      {exactPagesText}
                    </span>
                    )
                  </p>
                </div>
              </div>
            </div>

            {/* Phạm vi cào */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Từ trang:</label>
                <input
                  type="number"
                  min="1"
                  value={currentTabInputs.start}
                  onChange={(e) =>
                    setPageInputs({
                      ...pageInputs,
                      [activeSource]: { ...currentTabInputs, start: e.target.value },
                    })
                  }
                  className="w-full bg-[#0F1115] border border-white/10 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Đến trang (tùy chọn):</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Để trống = Cào hết"
                  value={currentTabInputs.max}
                  onChange={(e) =>
                    setPageInputs({
                      ...pageInputs,
                      [activeSource]: { ...currentTabInputs, max: e.target.value },
                    })
                  }
                  className="w-full bg-[#0F1115] border border-white/10 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400 placeholder:text-gray-600"
                />
              </div>
            </div>

            {/* Thanh tiến độ thời gian thực */}
            {isThisTabRunning && (
              <div className="bg-black/50 p-4 rounded-xl border border-purple-500/40 mb-4 animate-fade-in">
                <div className="flex justify-between items-center text-xs font-semibold mb-2">
                  <span className="text-purple-300 flex items-center gap-2">
                    <i className="fa-solid fa-spinner fa-spin text-amber-400"></i>
                    Đang cào Page <strong className="text-white text-sm">{bulkState.current_page || 1}</strong> / {bulkState.total_pages || "..."} [{bulkState.current_source?.toUpperCase()}]
                  </span>
                  <span className="text-amber-400 font-mono text-sm font-bold bg-amber-400/10 px-2.5 py-0.5 rounded-md border border-amber-400/20">
                    {progressPercent}%
                  </span>
                </div>

                <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden p-0.5 border border-white/5">
                  <div
                    className="bg-gradient-to-r from-purple-600 via-[#D497FF] to-amber-400 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(2, progressPercent)}%` }}
                  ></div>
                </div>

                <div className="text-[11px] text-gray-400 mt-2.5 flex justify-between items-center">
                  <span>Đã cập nhật vào DB: <strong className="text-emerald-400 text-sm font-mono">{bulkState.total_seeded || 0}</strong> phim</span>
                </div>
              </div>
            )}
          </div>

          {/* Điều khiển Cào Full */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleStartBulk}
              disabled={isBulkStarting || bulkState.is_running}
              className="flex-1 bg-[#D497FF] hover:bg-[#c27eff] text-black font-bold py-2.5 px-4 rounded-xl transition shadow-lg shadow-[#D497FF]/20 flex items-center justify-center gap-2 text-sm disabled:opacity-40 cursor-pointer"
            >
              {isBulkStarting ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-play"></i>}
              <span>{isOtherTabRunning ? `Đang cào ${bulkState.current_source?.toUpperCase()}...` : "Bắt Đầu Cào Full"}</span>
            </button>

            {bulkState.is_running && (
              <button
                onClick={handlePauseBulk}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-2 text-sm cursor-pointer"
              >
                <i className="fa-solid fa-pause"></i>
                <span>Tạm Dừng</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KHU VỰC MỚI: LIVE LOG TERMINAL FEED (Trực tiếp dữ liệu phim đang cào) */}
      <div className="bg-[#14171E] border border-white/5 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-white/10 mb-4 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSyncRunning ? "bg-emerald-400" : "bg-gray-500"}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isSyncRunning ? "bg-emerald-500" : "bg-gray-400"}`}></span>
            </span>
            <h3 className="font-bold text-white text-sm md:text-base">
              Trực Tiếp Dữ Liệu Phim Đang Cào (Live Feed)
            </h3>
            {statusData?.bulk?.live_logs && statusData.bulk.live_logs.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300 font-mono">
                {statusData.bulk.live_logs.length} dòng
              </span>
            )}
          </div>

          {/* Công cụ điều khiển Terminal */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => {
                if (statusData) {
                  setStatusData({
                    ...statusData,
                    bulk: {
                      ...statusData.bulk,
                      live_logs: [],
                    },
                  });
                }
              }}
              title="Xóa sạch màn hình Terminal"
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition flex items-center gap-1 text-[11px] cursor-pointer"
            >
              <i className="fa-solid fa-trash-can text-[10px]"></i> Xóa
            </button>

            <button
              onClick={scrollToTop}
              title="Cuộn lên dòng lệnh đầu tiên"
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition flex items-center gap-1 text-[11px] cursor-pointer"
            >
              <i className="fa-solid fa-arrow-up text-[10px]"></i> Lên đầu
            </button>

            <button
              onClick={scrollToBottom}
              title="Cuộn xuống dòng mới nhất"
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition flex items-center gap-1 text-[11px] cursor-pointer"
            >
              <i className="fa-solid fa-arrow-down text-[10px]"></i> Xuống đáy
            </button>

            <button
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              title={isAutoScroll ? "Đang bật tự cuộn theo log mới" : "Đang tắt tự cuộn (bạn có thể đứng yên đọc log cũ)"}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 text-[11px] cursor-pointer font-medium ${isAutoScroll
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-white/5 text-gray-400 hover:text-white border border-white/5"
                }`}
            >
              <i className={`fa-solid ${isAutoScroll ? "fa-play" : "fa-pause"} text-[9px]`}></i>
              {isAutoScroll ? "Tự cuộn: BẬT" : "Tự cuộn: TẮT"}
            </button>
          </div>
        </div>

        <div
          ref={terminalRef}
          onScroll={handleTerminalScroll}
          className="bg-black/80 border border-white/10 rounded-xl p-4 font-mono text-xs max-h-80 md:max-h-96 overflow-y-auto space-y-1.5 shadow-inner custom-scrollbar"
        >
          {statusData?.bulk?.live_logs && statusData.bulk.live_logs.length > 0 ? (
            statusData.bulk.live_logs.map((log: any, idx: number) => (
              <div key={log.id || idx} className="flex items-start gap-2.5 leading-relaxed hover:bg-white/[0.02] px-1 rounded transition-colors">
                <span className="text-gray-500 shrink-0 text-[10px] select-none font-mono">
                  #{idx + 1} [{log.time}]
                </span>
                <span
                  className={`text-xs break-all ${log.type === "new"
                    ? "text-emerald-400 font-semibold"
                    : log.type === "update"
                      ? "text-amber-300"
                      : log.type === "error"
                        ? "text-red-400 font-bold"
                        : "text-purple-300"
                    }`}
                >
                  {log.text}
                </span>
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-center py-10 flex flex-col items-center justify-center gap-2">
              <i className="fa-solid fa-terminal text-2xl text-gray-600"></i>
              <span>Chưa có dữ liệu cào mới. Bấm <strong>"Nút Đồng Bộ Tức Thì"</strong> hoặc <strong>"Bắt Đầu Cào Full"</strong> để xem live stream log.</span>
            </div>
          )}
        </div>
      </div>

      {/* REFRESH SELECTED MOVIES */}
      <div className="bg-[#14171E] border border-white/5 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-lg">
              <i className="fa-solid fa-arrows-rotate"></i>
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Cào Lại Phim Được Chọn</h3>
              <p className="text-xs text-gray-400">
                Tìm trong database, chọn tối đa 50 phim và cập nhật từ {SOURCE_TABS.find((tab) => tab.id === activeSource)?.label}.
              </p>
            </div>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            Đã chọn: {selectedRefreshMovies.length}/50
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <label className="text-xs text-gray-400 block mb-2">Tìm theo tên phim hoặc slug</label>
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-gray-500 text-xs"></i>
              <input
                value={refreshQuery}
                onChange={(event) => setRefreshQuery(event.target.value)}
                placeholder="Ví dụ: lưỡi hái tử thần..."
                className="w-full bg-[#0F1115] border border-white/10 text-white rounded-xl py-3 pl-9 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              {isSearchingRefresh && <i className="fa-solid fa-spinner fa-spin absolute right-3 top-3.5 text-emerald-400"></i>}
            </div>

            {refreshQuery.trim().length >= 2 && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-black/30 divide-y divide-white/5 custom-scrollbar">
                {refreshSearchResults.length > 0 ? refreshSearchResults.map((movie) => {
                  const selected = selectedRefreshMovies.some((item) => item.slug === movie.slug);
                  return (
                    <button
                      key={movie.id}
                      type="button"
                      onClick={() => toggleRefreshMovie(movie)}
                      className={`w-full text-left p-3 flex items-center gap-3 transition ${selected ? "bg-emerald-500/10" : "hover:bg-white/5"}`}
                    >
                      <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-emerald-500 border-emerald-400 text-black" : "border-white/20"}`}>
                        {selected && <i className="fa-solid fa-check text-[10px]"></i>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-white font-medium truncate">{movie.name}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{movie.slug}</span>
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0">{movie.quality || "?"} · {movie.year || "?"}</span>
                    </button>
                  );
                }) : !isSearchingRefresh ? (
                  <div className="text-xs text-gray-500 text-center p-5">Không tìm thấy phim phù hợp.</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">Danh sách sẽ cào lại</label>
              {selectedRefreshMovies.length > 0 && (
                <button type="button" onClick={() => setSelectedRefreshMovies([])} className="text-[11px] text-red-400 hover:text-red-300">
                  Bỏ chọn tất cả
                </button>
              )}
            </div>
            <div className="min-h-32 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2 custom-scrollbar">
              {selectedRefreshMovies.length > 0 ? selectedRefreshMovies.map((movie) => (
                <div key={movie.slug} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5">
                  <span className="text-xs text-white truncate flex-1">{movie.name}</span>
                  <span className="text-[10px] text-gray-500 truncate max-w-40">{movie.slug}</span>
                  <button type="button" onClick={() => toggleRefreshMovie(movie)} className="text-gray-500 hover:text-red-400 p-1">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              )) : (
                <div className="h-28 flex items-center justify-center text-xs text-gray-600">Chưa chọn phim nào.</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleRefreshSelected}
              disabled={isRefreshingSelected || selectedRefreshMovies.length === 0 || isSyncRunning}
              className="mt-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-5 rounded-xl transition flex items-center justify-center gap-2 text-sm disabled:opacity-40"
            >
              <i className={`fa-solid ${isRefreshingSelected ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`}></i>
              {isRefreshingSelected ? "Đang cào lại..." : `Cào Lại ${selectedRefreshMovies.length} Phim`}
            </button>
          </div>
        </div>

        {refreshResults.length > 0 && (
          <div className="mt-5 border-t border-white/10 pt-4 space-y-2">
            {refreshResults.map((result: any) => (
              <div key={result.slug} className="flex flex-wrap items-center gap-2 text-xs bg-black/20 rounded-lg px-3 py-2">
                <i className={`fa-solid ${result.success ? "fa-circle-check text-emerald-400" : "fa-circle-xmark text-red-400"}`}></i>
                <span className="text-white font-medium mr-auto">{result.name}</span>
                {result.sources?.map((item: any) => (
                  <span key={item.source} className={`px-2 py-0.5 rounded ${item.status === "updated" ? "bg-emerald-500/15 text-emerald-300" : item.status === "not_found" ? "bg-white/5 text-gray-500" : "bg-red-500/15 text-red-300"}`}>
                    {item.source.toUpperCase()}: {item.status === "updated" ? "OK" : item.status === "not_found" ? "không có" : "lỗi"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KHU VỰC 3: CÔNG CỤ GỘP PHIM THỦ CÔNG */}
      <div className="bg-[#14171E] border border-white/5 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-lg">
            <i className="fa-solid fa-code-merge"></i>
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Công Cụ Gộp Phim Trùng (Manual Merge)</h3>
            <p className="text-xs text-gray-400">
              Nếu bạn phát hiện 2 bản ghi phim thực chất là một, nhập slug để gộp toàn bộ server của phim nguồn sang phim đích và tự xóa phim thừa.
            </p>
          </div>
        </div>

        <form onSubmit={handleMergeMovies} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Slug Phim Nguồn (Phim sẽ bị xóa):</label>
            <input
              type="text"
              required
              placeholder="VD: indiana-jones-5-vsmov"
              value={sourceSlug}
              onChange={(e) => setSourceSlug(e.target.value)}
              className="w-full bg-[#0F1115] border border-white/10 text-white rounded-lg p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Slug Phim Đích (Phim giữ lại & nhận server):</label>
            <input
              type="text"
              required
              placeholder="VD: indiana-jones-va-vong-quay-dinh-menh"
              value={targetSlug}
              onChange={(e) => setTargetSlug(e.target.value)}
              className="w-full bg-[#0F1115] border border-white/10 text-white rounded-lg p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <button
            type="submit"
            disabled={isMerging}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-5 rounded-xl transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            {isMerging ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-object-group"></i>}
            <span>Gộp Vào Phim Chính</span>
          </button>
        </form>
      </div>

      {/* KHU VỰC 4: NHẬT KÝ ĐỒNG BỘ (SYNC LOGS) */}
      <div className="bg-[#14171E] border border-white/5 rounded-2xl p-6 shadow-xl">
        <h3 className="font-bold text-white text-base mb-4 flex items-center gap-2">
          <i className="fa-solid fa-list-check text-purple-400"></i> Lịch Sử Đồng Bộ Gần Đây
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-black/40 text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Loại đồng bộ</th>
                <th className="py-3 px-4">Số trang</th>
                <th className="py-3 px-4">Phim mới</th>
                <th className="py-3 px-4">Cập nhật</th>
                <th className="py-3 px-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {statusData?.logs && statusData.logs.length > 0 ? (
                statusData.logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-4 font-mono text-gray-400">
                      {new Date(log.started_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-3 px-4 font-semibold text-purple-300">
                      {log.sync_type}
                    </td>
                    <td className="py-3 px-4">{log.pages_crawled} trang</td>
                    <td className="py-3 px-4 text-emerald-400 font-semibold">+{log.movies_created}</td>
                    <td className="py-3 px-4 text-amber-400 font-semibold">~{log.movies_updated}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.status === "SUCCESS"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                          }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Chưa có nhật ký đồng bộ nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
