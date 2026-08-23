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
        getSiteSettings(),
        getStarredMovies(),
        fetchSystemStats(),
    ]);

    const starredMovies = starredRes.data || [];
    const dbStats = systemStatsRes?.data || null;

    const stats = {
        exclusiveMoviesCount: exclusiveCount,
        exclusiveEpisodesCount: exclusiveEpisodesCount,
        dbStats: dbStats,
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
