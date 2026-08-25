import AdminDashboard from "./AdminDashboard";
import Link from "next/link";
import { logoutAdmin } from "@/app/actions/adminAuth";
import { getSiteSettings } from "@/app/actions/adminSettings";
import { getStarredMovies } from "@/app/actions/adminStarred";
import { fetchSystemStats } from "@/app/actions/adminSync";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
    const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let exclusiveCount = 0;
    let exclusiveEpisodesCount = 0;

    try {
        const { count: mCount } = await supabase.from('exclusive_movies').select('*', { count: 'exact', head: true });
        const { count: eCount } = await supabase.from('exclusive_episodes').select('*', { count: 'exact', head: true });
        exclusiveCount = mCount || 0;
        exclusiveEpisodesCount = eCount || 0;
    } catch (e: any) {
        console.error("[Dashboard] Lỗi lấy thống kê Supabase:", e);
    }

    const [settings, starredRes, systemStatsRes] = await Promise.all([
        getSiteSettings(true),
        getStarredMovies(),
        fetchSystemStats(),
    ]);

    const starredMovies = starredRes.data || [];
    const dbStats = systemStatsRes?.data || null;

    // ── Lấy Top Lượt Xem từ Supabase movie_views (nguồn thực tế) ──
    let supabaseTopViews: any[] = [];
    try {
        const { data: topViewsRaw } = await supabase
            .from('movie_views')
            .select('movie_slug, view_count')
            .order('view_count', { ascending: false })
            .limit(5);

        if (topViewsRaw && topViewsRaw.length > 0) {
            const BACKEND_BASE =
                process.env.INTERNAL_API_URL ||
                process.env.NEXT_PUBLIC_INTERNAL_API_URL ||
                "http://127.0.0.1:5000/api/v1";

            // Lấy song song thông tin chi tiết phim từ backend cho mỗi slug
            const enriched = await Promise.allSettled(
                topViewsRaw.map(async (item) => {
                    try {
                        const res = await fetch(`${BACKEND_BASE}/phim/${item.movie_slug}`, {
                            cache: "no-store",
                            headers: { Accept: "application/json" },
                        });
                        if (res.ok) {
                            const json = await res.json();
                            const movie = json?.movie || null;
                            if (movie) {
                                return {
                                    id: movie._id || movie.id || item.movie_slug,
                                    slug: item.movie_slug,
                                    view_count: item.view_count,
                                    name: movie.name || movie.origin_name || item.movie_slug,
                                    thumb_url: movie.thumb_url || movie.poster_url || "",
                                    poster_url: movie.poster_url || movie.thumb_url || "",
                                    year: movie.year || null,
                                    quality: movie.quality || null,
                                    type: movie.type || null,
                                };
                            }
                        }
                    } catch {
                        // bỏ qua nếu backend không phản hồi
                    }
                    // Fallback: chỉ có slug + view_count, không có ảnh
                    return {
                        id: item.movie_slug,
                        slug: item.movie_slug,
                        view_count: item.view_count,
                        name: item.movie_slug,
                        thumb_url: "",
                        poster_url: "",
                        year: null,
                        quality: null,
                        type: null,
                    };
                })
            );

            supabaseTopViews = enriched
                .filter((r) => r.status === "fulfilled")
                .map((r) => (r as PromiseFulfilledResult<any>).value);
        }
    } catch (e: any) {
        console.error("[Dashboard] Lỗi lấy top views từ Supabase:", e);
    }

    const stats = {
        exclusiveMoviesCount: exclusiveCount,
        exclusiveEpisodesCount: exclusiveEpisodesCount,
        dbStats: dbStats
            ? {
                  ...dbStats,
                  // Ghi đè topViews bằng dữ liệu thực từ Supabase movie_views
                  topViews: supabaseTopViews.length > 0 ? supabaseTopViews : (dbStats.topViews ?? []),
              }
            : null,
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0F1115] p-4 rounded-xl border border-white/10">
                <div>
                    <h1 className="text-2xl font-bold text-white">Tổng quan Dashboard</h1>
                    <p className="text-sm text-white/50 mt-0.5">Trung tâm giám sát & điều hành hệ thống phim LoFilm</p>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-sm font-medium text-gray-400 hover:text-white transition">Về trang chủ</Link>
                    <form action={logoutAdmin}>
                        <button type="submit" className="text-sm bg-red-600/10 text-red-500 font-medium hover:bg-red-600 hover:text-white px-4 py-2 rounded-lg transition">
                            Đăng xuất
                        </button>
                    </form>
                </div>
            </div>

            <AdminDashboard initialStats={stats} initialSettings={settings} initialStarredMovies={starredMovies} />
        </div>
    );
}
