import { NextResponse } from "next/server";
import { INTERNAL_API_URL } from "@/app/utils/apiConfig";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const BACKEND_BASE = INTERNAL_API_URL || "http://127.0.0.1:5000/api/v1";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { status: false, error: "Thiếu cấu hình Supabase cho thống kê lượt xem" },
        { status: 503 }
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);
    const [res, topViewsResult] = await Promise.all([
      fetch(`${BACKEND_BASE}/admin/stats`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
      supabase
        .from("movie_views")
        .select("movie_slug, view_count")
        .order("view_count", { ascending: false })
        .limit(5),
    ]);

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/json")) {
      return NextResponse.json(
        { status: false, error: `Backend phản hồi mã ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (topViewsResult.error) {
      throw new Error(`Không thể lấy movie_views: ${topViewsResult.error.message}`);
    }

    const topViews = await Promise.all(
      (topViewsResult.data ?? []).map(async (item) => {
        try {
          const detailRes = await fetch(`${BACKEND_BASE}/phim/${item.movie_slug}`, {
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "X-Internal-Metadata-Request": "admin-dashboard",
            },
          });

          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            const movie = detailJson?.movie;
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
          // Vẫn giữ đúng thứ hạng và lượt xem nếu không lấy được metadata phim.
        }

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

    return NextResponse.json({
      ...data,
      data: {
        ...data.data,
        topViews,
      },
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: false, error: `Không thể tải thống kê: ${message}` },
      { status: 503 }
    );
  }
}
