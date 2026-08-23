"use server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

// Cần tạo một client với SERVICE ROLE để truy cập bảng starred_movies không bị RLS chặn
import { redis } from "@/app/lib/fetch-with-redis";

function getAdminSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export async function getStarredMovies() {
    const supabase = getAdminSupabase();
    
    // Tự động dọn dẹp các phim đã hết hạn trong DB
    await supabase
        .from("starred_movies")
        .delete()
        .lt("expires_at", new Date().toISOString());

    // Lấy danh sách phim đã đánh dấu còn hạn (expires_at > now() hoặc null)
    // Sắp xếp theo priority ASC (1, 2, 3...)
    const { data, error } = await supabase
        .from("starred_movies")
        .select("*")
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Lỗi getStarredMovies:", error);
        return { error: error.message };
    }

    return { data };
}

export async function addStarredMovie(slug: string, name: string, thumb_url: string, poster_url: string, expires_in_days: number | null) {
    const supabase = getAdminSupabase();
    
    // Dọn dẹp phim hết hạn trước khi tính priority
    await supabase
        .from("starred_movies")
        .delete()
        .lt("expires_at", new Date().toISOString());

    let expires_at = null;
    if (expires_in_days !== null) {
        const date = new Date();
        date.setDate(date.getDate() + expires_in_days);
        expires_at = date.toISOString();
    }

    // Lấy priority lớn nhất hiện tại của các phim còn hạn
    const { data: maxData } = await supabase
        .from("starred_movies")
        .select("priority")
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("priority", { ascending: false })
        .limit(1)
        .maybeSingle();
        
    const nextPriority = (maxData?.priority || 0) + 1;

    const { data, error } = await supabase
        .from("starred_movies")
        .upsert({
            slug,
            name,
            thumb_url,
            poster_url,
            expires_at,
            priority: nextPriority,
        }, { onConflict: 'slug' })
        .select("id")
        .single();

    if (error) {
        console.error("Lỗi addStarredMovie:", error);
        return { error: error.message };
    }

    await invalidateHomeCache();
    return { success: true, id: data.id, priority: nextPriority };
}

export async function removeStarredMovie(id: string) {
    const supabase = getAdminSupabase();
    
    const { error } = await supabase
        .from("starred_movies")
        .delete()
        .eq("id", id);

    if (error) {
        return { error: error.message };
    }

    await invalidateHomeCache();
    return { success: true };
}

export async function updateStarredPriority(id: string, priority: number) {
    const supabase = getAdminSupabase();
    
    const { error } = await supabase
        .from("starred_movies")
        .update({ priority })
        .eq("id", id);

    if (error) {
        return { error: error.message };
    }

    await invalidateHomeCache();
    return { success: true };
}

export async function updateStarredExpiry(id: string, expires_in_days: number | null) {
    const supabase = getAdminSupabase();

    let expires_at: string | null = null;
    if (expires_in_days !== null && expires_in_days > 0) {
        const date = new Date();
        date.setDate(date.getDate() + expires_in_days);
        expires_at = date.toISOString();
    }

    const { error } = await supabase
        .from("starred_movies")
        .update({ expires_at })
        .eq("id", id);

    if (error) return { error: error.message };

    await invalidateHomeCache();
    return { success: true, expires_at };
}

// Xóa Redis Cache để cập nhật Hero Slider ngay lập tức
async function invalidateHomeCache() {
    if (redis) {
        try {
            await redis.del("home:prefetch:bundle");
            await redis.del("home:prefetch:bundle:stale");
            await redis.del("home:prefetch:bundle:emergency");
        } catch (err) {
            console.error("Lỗi xóa Redis cache home bundle:", err);
        }
    }
    // Revalidate cho next/cache
    revalidatePath("/");
}
