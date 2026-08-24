"use server";
import { createClient } from "@/app/utils/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_cache } from "next/cache";

export const getSiteSettings = unstable_cache(
    async () => {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.from("site_settings").select("*");

            if (error || !data) {
                // Fallback nhanh
                await new Promise(r => setTimeout(r, 500));
                const retry = await supabase.from("site_settings").select("*");
                if (retry.error || !retry.data) {
                    return { maintenance_mode: false, active_event: "none" };
                }
                const settings: any = {};
                retry.data.forEach((item: any) => { settings[item.key] = item.value; });
                return settings;
            }

            const settings: any = {};
            data.forEach((item: any) => { settings[item.key] = item.value; });
            return settings;
        } catch (error) {
            console.error("Error fetching site settings:", error);
            return { maintenance_mode: false, active_event: "none" };
        }
    },
    ['site-settings-cache'],
    { revalidate: 3600, tags: ['site-settings'] }
);

export async function updateSiteSetting(key: string, value: any) {
    const supabase = await createClient();
    const { error } = await supabase
        .from("site_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
        return { error: error.message };
    }

    revalidatePath("/", "layout"); // Revalidate all layouts to apply settings
    return { success: true };
}
