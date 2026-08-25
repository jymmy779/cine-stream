"use client";
import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { deleteExclusiveMovie } from "@/app/actions/adminMovies";
import { updateSiteSetting } from "@/app/actions/adminSettings";
import Link from "next/link";
import toast from "react-hot-toast";
import HeroSliderTab from "./HeroSliderTab";
import EditorChoicesTab from "./EditorChoicesTab";
import TopicsTab from "./TopicsTab";
import SyncManagerTab from "./SyncManagerTab";

export default function AdminDashboard({ initialStats, initialSettings, initialStarredMovies }: {
    initialStats: {
        exclusiveMoviesCount?: number;
        exclusiveEpisodesCount?: number;
        moviesCount?: number;
        episodesCount?: number;
        dbStats?: {
            totalMovies: number;
            breakdown: {
                single: number;
                series: number;
                hoathinh: number;
                tvshows: number;
                chieurap: number;
            };
            totalEpisodes: number;
            totalServers: number;
            totalCategories: number;
            totalCountries: number;
            recentlyUpdated: any[];
            topViews: any[];
        } | null;
    };
    initialSettings: any;
    initialStarredMovies?: any[];
}) {
    const [stats, setStats] = useState(initialStats);
    const [settings, setSettings] = useState(initialSettings);
    const [activeTab, setActiveTab] = useState<"stats" | "sync" | "settings" | "hero" | "editor" | "topics">("stats");
    const [isPending, startTransition] = useTransition();
    const [hasChanges, setHasChanges] = useState(false);
    const [isClearingCache, setIsClearingCache] = useState(false);

    useEffect(() => {
        setStats(initialStats);
    }, [initialStats]);

    useEffect(() => {
        setSettings(initialSettings);
        setHasChanges(false);
    }, [initialSettings]);

    // Poll /api/admin/stats mỗi 30 giây để tự động cập nhật "Phim Vừa Nạp"
    const isPollingRef = useRef(false);
    const loadDbStats = useCallback(async () => {
        if (isPollingRef.current) return; // Tránh overlapping request
        isPollingRef.current = true;
        try {
            const res = await fetch("/api/admin/stats", {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
            });
            if (!res.ok) return;
            const json = await res.json();
            if (json?.data) {
                setStats((prev) => ({
                    ...prev,
                    dbStats: json.data,
                }));
            }
        } catch {
            // Bỏ qua lỗi mạng tạm thời
        } finally {
            isPollingRef.current = false;
        }
    }, []);

    useEffect(() => {
        // Delay lần đầu 5 giây để không tranh với SSR data
        const firstTimer = setTimeout(() => loadDbStats(), 5000);
        const interval = setInterval(() => loadDbStats(), 30000);
        return () => {
            clearTimeout(firstTimer);
            clearInterval(interval);
        };
    }, [loadDbStats]);

    const handleChangeSetting = (key: string, value: any) => {
        setSettings({ ...settings, [key]: value });
        setHasChanges(true);
    };

    const handleClearSystemCache = async () => {
        setIsClearingCache(true);
        try {
            const res = await fetch("/api/admin/cache/flush", { method: "POST" });
            if (res.ok) {
                toast.success("Đã làm mới toàn bộ bộ nhớ Cache hệ thống!");
            } else {
                toast.success("Đã gửi tín hiệu làm mới Cache.");
            }
        } catch {
            toast.error("Lỗi khi kết nối xóa Cache");
        } finally {
            setIsClearingCache(false);
        }
    };

    const saveAllSettings = () => {
        startTransition(async () => {
            const keysToSave = Object.keys(settings);
            let hasError = false;

            for (const key of keysToSave) {
                if (settings[key] !== initialSettings[key]) {
                    const res = await updateSiteSetting(key, settings[key]);
                    if (res?.error) hasError = true;
                }
            }

            if (hasError) {
                toast.error("Có lỗi xảy ra khi lưu một số cài đặt!");
            } else {
                toast.success("Đã lưu tất cả cấu hình thành công!");
                setHasChanges(false);
            }
        });
    };

    const db = stats?.dbStats;
    const totalDbMovies = db?.totalMovies || 0;
    const exclusiveMovies = stats?.exclusiveMoviesCount ?? stats?.moviesCount ?? 0;
    const totalEpisodes = (db?.totalEpisodes || 0) + (stats?.exclusiveEpisodesCount ?? stats?.episodesCount ?? 0);
    const breakdown = db?.breakdown || { single: 0, series: 0, hoathinh: 0, tvshows: 0, chieurap: 0 };

    const singlePct = totalDbMovies > 0 ? Math.round((breakdown.single / totalDbMovies) * 100) : 0;
    const seriesPct = totalDbMovies > 0 ? Math.round((breakdown.series / totalDbMovies) * 100) : 0;
    const hoathinhPct = totalDbMovies > 0 ? Math.round((breakdown.hoathinh / totalDbMovies) * 100) : 0;
    const tvshowsPct = totalDbMovies > 0 ? Math.round((breakdown.tvshows / totalDbMovies) * 100) : 0;

    return (
        <div>
            {/* Tabs */}
            <div className="flex flex-wrap gap-4 mb-6 border-b border-white/10 pb-2">
                <button
                    onClick={() => setActiveTab("stats")}
                    className={`pb-2 px-2 font-medium transition ${activeTab === 'stats' ? 'text-[#D497FF] border-b-2 border-[#D497FF]' : 'text-gray-400 hover:text-white'}`}
                >
                    <i className="fa-solid fa-chart-pie mr-2"></i> Tổng quan
                </button>
                <button
                    onClick={() => setActiveTab("sync")}
                    className={`pb-2 px-2 font-medium transition ${activeTab === 'sync' ? 'text-[#D497FF] border-b-2 border-[#D497FF]' : 'text-gray-400 hover:text-white'}`}
                >
                    <i className="fa-solid fa-rotate mr-2"></i> Cào Phim & Đồng Bộ
                </button>
                <button
                    onClick={() => setActiveTab("settings")}
                    className={`pb-2 px-2 font-medium transition ${activeTab === 'settings' ? 'text-[#D497FF] border-b-2 border-[#D497FF]' : 'text-gray-400 hover:text-white'}`}
                >
                    <i className="fa-solid fa-cog mr-2"></i> Cấu hình Website
                </button>
                <button
                    onClick={() => setActiveTab("hero")}
                    className={`pb-2 px-2 font-medium transition ${activeTab === 'hero' ? 'text-[#D497FF] border-b-2 border-[#D497FF]' : 'text-gray-400 hover:text-white'}`}
                >
                    <i className="fa-solid fa-star mr-2"></i> Hero Slider
                </button>
                <button
                    onClick={() => setActiveTab("editor")}
                    className={`pb-2 px-2 font-medium transition ${activeTab === 'editor' ? 'text-[#D497FF] border-b-2 border-[#D497FF]' : 'text-gray-400 hover:text-white'}`}
                >
                    <i className="fa-solid fa-award mr-2"></i> Editor's Choices
                </button>
                <button
                    onClick={() => setActiveTab("topics")}
                    className={`pb-2 px-2 font-medium transition ${activeTab === 'topics' ? 'text-[#D497FF] border-b-2 border-[#D497FF]' : 'text-gray-400 hover:text-white'}`}
                >
                    <i className="fa-solid fa-list mr-2"></i> Quản lý Chủ đề
                </button>
            </div>

            {/* Sync Manager Tab */}
            {activeTab === "sync" && (
                <SyncManagerTab />
            )}

            {/* Stats Tab - Bento Dashboard */}
            {activeTab === "stats" && (
                <div className="space-y-6">
                    {/* Top 4 Key Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                        {/* Card 1: Tổng Phim dev.db */}
                        <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 hover:border-[#D497FF]/40 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-28 h-28 bg-[#D497FF]/5 rounded-full blur-2xl group-hover:bg-[#D497FF]/10 transition-all"></div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Tổng Kho Phim DB</span>
                                <div className="w-9 h-9 rounded-xl bg-[#D497FF]/10 text-[#D497FF] flex items-center justify-center text-base">
                                    <i className="fa-solid fa-database"></i>
                                </div>
                            </div>
                            <div className="text-3xl font-extrabold text-white tracking-tight">
                                {totalDbMovies > 0 ? totalDbMovies.toLocaleString('vi-VN') : exclusiveMovies.toLocaleString('vi-VN')}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#D497FF]/15 text-[#D497FF] font-semibold">
                                    3 Nguồn Tích Hợp
                                </span>
                                <span className="text-[11px] text-white/40">KK • Ophim • NguonC</span>
                            </div>
                        </div>

                        {/* Card 2: Phim Độc Quyền Supabase */}
                        <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 hover:border-amber-500/40 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Phim Độc Quyền CMS</span>
                                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-base">
                                    <i className="fa-solid fa-crown"></i>
                                </div>
                            </div>
                            <div className="text-3xl font-extrabold text-amber-400 tracking-tight">
                                {exclusiveMovies.toLocaleString('vi-VN')}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold">
                                    Supabase Cloud
                                </span>
                                <Link href="/admin/movies/new" className="text-[11px] text-amber-400/80 hover:text-amber-300 hover:underline">
                                    + Thêm mới
                                </Link>
                            </div>
                        </div>

                        {/* Card 3: Tổng Tập Phim & Server */}
                        <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 hover:border-cyan-500/40 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all"></div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Tổng Tập Phim</span>
                                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-base">
                                    <i className="fa-solid fa-play"></i>
                                </div>
                            </div>
                            <div className="text-3xl font-extrabold text-white tracking-tight">
                                {totalEpisodes.toLocaleString('vi-VN')}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 font-semibold">
                                    {db?.totalServers ? `${db.totalServers.toLocaleString('vi-VN')} Servers` : 'Đa luồng'}
                                </span>
                                <span className="text-[11px] text-white/40">Hỗ trợ Vietsub, LT & TM</span>
                            </div>
                        </div>

                        {/* Card 4: Danh Mục Chuẩn */}
                        <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 hover:border-emerald-500/40 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Danh Mục Chuẩn</span>
                                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-base">
                                    <i className="fa-solid fa-tags"></i>
                                </div>
                            </div>
                            <div className="text-3xl font-extrabold text-white tracking-tight flex items-baseline gap-2">
                                <span>{db?.totalCategories || 29}</span>
                                <span className="text-sm font-normal text-white/40">Thể loại</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-semibold">
                                    {db?.totalCountries || 36} Quốc Gia
                                </span>
                                <span className="text-[11px] text-white/40">Chuẩn hóa 100%</span>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown & Distribution Section */}
                    {totalDbMovies > 0 && (
                        <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 md:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                        <span className="w-1.5 h-4 bg-[#D497FF] rounded-full"></span>
                                        Cơ Cấu Phân Loại Kho Phim
                                    </h3>
                                    <p className="text-xs text-white/40 mt-0.5">Tỷ lệ phân bổ các danh mục phim chính trong Database</p>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-white/60">
                                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span>Tự động tối ưu FTS5 Search</span>
                                </div>
                            </div>

                            {/* Multi-color Progress Bar */}
                            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/5 mb-5">
                                <div style={{ width: `${singlePct}%` }} className="bg-blue-500 rounded-l-full h-full transition-all duration-500" title={`Phim Lẻ: ${singlePct}%`}></div>
                                <div style={{ width: `${seriesPct}%` }} className="bg-purple-500 h-full transition-all duration-500" title={`Phim Bộ: ${seriesPct}%`}></div>
                                <div style={{ width: `${hoathinhPct}%` }} className="bg-pink-500 h-full transition-all duration-500" title={`Hoạt Hình: ${hoathinhPct}%`}></div>
                                <div style={{ width: `${tvshowsPct}%` }} className="bg-amber-500 rounded-r-full h-full transition-all duration-500" title={`TV Shows: ${tvshowsPct}%`}></div>
                            </div>

                            {/* Breakdown Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/60 font-medium">🎬 Phim Lẻ</span>
                                        <span className="text-[10px] text-blue-400 font-bold">{singlePct}%</span>
                                    </div>
                                    <div className="text-xl font-bold text-white mt-1">
                                        {breakdown.single.toLocaleString('vi-VN')}
                                    </div>
                                </div>

                                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/60 font-medium">📺 Phim Bộ</span>
                                        <span className="text-[10px] text-purple-400 font-bold">{seriesPct}%</span>
                                    </div>
                                    <div className="text-xl font-bold text-white mt-1">
                                        {breakdown.series.toLocaleString('vi-VN')}
                                    </div>
                                </div>

                                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/60 font-medium">🎌 Hoạt Hình</span>
                                        <span className="text-[10px] text-pink-400 font-bold">{hoathinhPct}%</span>
                                    </div>
                                    <div className="text-xl font-bold text-white mt-1">
                                        {breakdown.hoathinh.toLocaleString('vi-VN')}
                                    </div>
                                </div>

                                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/60 font-medium">🎙️ TV Shows</span>
                                        <span className="text-[10px] text-amber-400 font-bold">{tvshowsPct}%</span>
                                    </div>
                                    <div className="text-xl font-bold text-white mt-1">
                                        {breakdown.tvshows.toLocaleString('vi-VN')}
                                    </div>
                                </div>

                                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between col-span-2 sm:col-span-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/60 font-medium">🎟️ Chiếu Rạp</span>
                                        <span className="text-[10px] text-red-400 font-bold">Hot</span>
                                    </div>
                                    <div className="text-xl font-bold text-red-400 mt-1">
                                        {breakdown.chieurap.toLocaleString('vi-VN')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom Two Columns: Recently Updated vs Top Views */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Recently Updated Movies (2 Cols) */}
                        <div className="lg:col-span-2 bg-[#0F1115] border border-white/10 rounded-2xl p-5 md:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <span className="w-1.5 h-4 bg-blue-400 rounded-full"></span>
                                    Phim Vừa Nạp & Cập Nhật Gần Nhất
                                </h3>
                                <button
                                    onClick={() => setActiveTab("sync")}
                                    className="text-xs text-[#D497FF] hover:underline flex items-center gap-1 font-medium"
                                >
                                    Quản lý Crawler <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                </button>
                            </div>

                            {db?.recentlyUpdated && db.recentlyUpdated.length > 0 ? (
                                <div className="divide-y divide-white/5">
                                    {db.recentlyUpdated.map((m: any) => (
                                        <div key={m.id || m.slug} className="py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-2 rounded-xl transition">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-14 rounded-lg bg-white/5 overflow-hidden shrink-0 border border-white/10 relative">
                                                    {m.thumb_url || m.poster_url ? (
                                                        <img src={m.thumb_url || m.poster_url} alt={m.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                                            <i className="fa-solid fa-image"></i>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <a
                                                        href={`/phim/${m.slug}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-sm font-bold text-white hover:text-[#D497FF] transition truncate block"
                                                    >
                                                        {m.name}
                                                    </a>
                                                    <p className="text-xs text-white/40 truncate">{m.origin_name || m.slug}</p>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 font-medium">
                                                            {m.year || '2025'}
                                                        </span>
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 font-bold uppercase">
                                                            {m.quality || 'FHD'}
                                                        </span>
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#D497FF]/10 text-[#D497FF] font-medium">
                                                            {m.episode_current || 'Full'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-[11px] text-white/30 block">
                                                    {m.updated_at ? new Date(m.updated_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}
                                                </span>
                                                <a
                                                    href={`/phim/${m.slug}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-block mt-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                                                >
                                                    Xem thử ↗
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-white/30 text-sm">
                                    Chưa có dữ liệu cập nhật gần đây
                                </div>
                            )}
                        </div>

                        {/* Top Views & Quick Controls (1 Col) */}
                        <div className="space-y-6">
                            {/* Top Views */}
                            <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 md:p-6">
                                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                    <span className="w-1.5 h-4 bg-amber-400 rounded-full"></span>
                                    Top Lượt Xem Nhiều Nhất
                                </h3>

                                {db?.topViews && db.topViews.length > 0 ? (
                                    <div className="space-y-3">
                                        {db.topViews.map((m: any, idx: number) => (
                                            <div key={m.id || m.slug} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${idx === 0 ? 'bg-amber-400 text-black' : idx === 1 ? 'bg-gray-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-white/60'}`}>
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <a href={`/phim/${m.slug}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-white hover:text-amber-400 transition truncate block">
                                                            {m.name}
                                                        </a>
                                                        <span className="text-[10px] text-white/40">{m.year || '2025'}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="text-xs font-bold text-amber-400">
                                                        {(m.view_count || 0).toLocaleString('vi-VN')}
                                                    </span>
                                                    <span className="text-[9px] text-white/30 block">lượt xem</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-white/30 text-xs">
                                        Chưa có thống kê lượt xem
                                    </div>
                                )}
                            </div>

                            {/* Quick Controls Card */}
                            <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5">
                                <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Thao tác nhanh</h4>
                                <div className="space-y-2">
                                    <button
                                        onClick={handleClearSystemCache}
                                        disabled={isClearingCache}
                                        className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-semibold transition flex items-center justify-between border border-white/5"
                                    >
                                        <span className="flex items-center gap-2">
                                            <i className="fa-solid fa-broom text-blue-400"></i> Xóa & Làm Mới Cache Web
                                        </span>
                                        {isClearingCache ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrow-right text-[10px] opacity-40"></i>}
                                    </button>
                                    <Link
                                        href="/admin/movies"
                                        className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-semibold transition flex items-center justify-between border border-white/5"
                                    >
                                        <span className="flex items-center gap-2">
                                            <i className="fa-solid fa-film text-purple-400"></i> Danh Sách Phim Độc Quyền
                                        </span>
                                        <i className="fa-solid fa-arrow-right text-[10px] opacity-40"></i>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Editor Choices Tab */}
            {activeTab === "editor" && (
                <EditorChoicesTab initialConfig={initialSettings?.editor_choices || { mode: "manual", autoCount: 30, movies: [] }} />
            )}

            {/* Topics Tab */}
            {activeTab === "topics" && (
                <TopicsTab initialTopics={initialSettings?.home_topics} />
            )}

            {/* Hero Slider Tab */}
            {activeTab === "hero" && (
                <HeroSliderTab initialStarredMovies={initialStarredMovies || []} />
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
                <div className="bg-[#0F1115] rounded-lg p-6 border border-white/5 max-w-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-semibold">Cấu hình chung</h3>
                        {hasChanges && (
                            <button
                                onClick={saveAllSettings}
                                disabled={isPending}
                                className="bg-[#D497FF] hover:bg-[#D497FF] text-black px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm animate-fade-in"
                            >
                                {isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-save"></i>}
                                Lưu thay đổi
                            </button>
                        )}
                    </div>

                    <div className="mb-6 flex items-center justify-between p-4 bg-[#0F1115] rounded-lg">
                        <div>
                            <div className="font-medium text-lg">Chế độ Bảo trì</div>
                            <div className="text-sm text-gray-400">Đóng website tạm thời, chuyển tất cả traffic về trang /maintenance</div>
                        </div>
                        <button
                            disabled={isPending}
                            onClick={() => handleChangeSetting('maintenance_mode', !settings.maintenance_mode)}
                            className={`w-14 h-7 rounded-full transition-colors relative ${settings.maintenance_mode ? 'bg-red-500' : 'bg-gray-600'}`}
                        >
                            <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full transition-all ${settings.maintenance_mode ? 'right-1' : 'left-1'}`}></span>
                        </button>
                    </div>

                    <div className="p-4 bg-[#0F1115] rounded-lg mb-6">
                        <div className="mb-3">
                            <div className="font-medium text-lg">Sự kiện Đặc biệt (Hiệu ứng)</div>
                            <div className="text-sm text-gray-400">Kích hoạt các hiệu ứng đặc biệt trên toàn trang web.</div>
                        </div>
                        <select
                            value={settings.active_event || 'none'}
                            onChange={(e) => handleChangeSetting('active_event', e.target.value)}
                            disabled={isPending}
                            className="w-full bg-[#0F1115] text-white rounded p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF]"
                        >
                            <option value="none">Không có sự kiện (Mặc định)</option>
                            <option value="reunification">Giải phóng Miền Nam 30/4</option>
                        </select>
                    </div>

                    <h3 className="text-xl mb-6 font-semibold border-t border-white/10 pt-6">Thông tin liên hệ & Mạng xã hội</h3>

                    <div className="space-y-4">
                        {[
                            { key: 'contact_telegram', label: 'Telegram URL', icon: 'fa-telegram', color: 'text-[#0088cc]' },
                            { key: 'contact_telegram_name', label: 'Telegram Name (hiển thị)', icon: 'fa-telegram', color: 'text-[#0088cc]' },
                            { key: 'contact_discord', label: 'Discord URL', icon: 'fa-discord', color: 'text-[#5865F2]' },
                            { key: 'contact_facebook', label: 'Facebook URL', icon: 'fa-facebook', color: 'text-[#1877F2]' },
                            { key: 'contact_twitter', label: 'X (Twitter) URL', icon: 'fa-x-twitter', color: 'text-white' },
                            { key: 'contact_threads', label: 'Threads URL', icon: 'fa-threads', color: 'text-white' },
                            { key: 'contact_youtube', label: 'YouTube URL', icon: 'fa-youtube', color: 'text-[#FF0000]' },
                        ].map((field) => (
                            <div key={field.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#0F1115] rounded-lg gap-4">
                                <div className="flex items-center gap-3 w-1/3">
                                    <i className={`fa-brands ${field.icon} text-2xl ${field.color}`}></i>
                                    <div className="font-medium">{field.label}</div>
                                </div>
                                <input
                                    type="text"
                                    value={settings[field.key] || ''}
                                    placeholder={`Nhập ${field.label}...`}
                                    onChange={(e) => handleChangeSetting(field.key, e.target.value)}
                                    disabled={isPending}
                                    className="flex-1 bg-[#0F1115] text-white rounded p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
