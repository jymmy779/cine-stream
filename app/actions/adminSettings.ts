"use server";
import { createClient as createServerClient } from "@/app/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

let cachedSettings: { data: any; expiresAt: number } | null = null;
const CACHE_TTL = 15_000; // Cache 15 giây cho layout, siêu nhanh

export async function getSiteSettings(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && cachedSettings && now < cachedSettings.expiresAt) {
        return cachedSettings.data;
    }

    try {
        const supabase = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data, error } = await supabase.from("site_settings").select("*");

        if (error || !data) {
            return cachedSettings?.data || { maintenance_mode: false, active_event: "none" };
        }

        const settings: any = {};
        data.forEach((item: any) => { settings[item.key] = item.value; });
        cachedSettings = { data: settings, expiresAt: now + CACHE_TTL };
        return settings;
    } catch (error) {
        console.error("Error fetching site settings:", error);
        return cachedSettings?.data || { maintenance_mode: false, active_event: "none" };
    }
}

export async function updateSiteSetting(key: string, value: any) {
    // Xóa cache ngay lập tức để request tiếp theo đọc giá trị mới
    cachedSettings = null;

    const supabase = await createServerClient();
    const { error } = await supabase
        .from("site_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
        return { error: error.message };
    }

    revalidatePath("/", "layout");
    revalidatePath("/admin/dashboard");
    return { success: true };
}
