"use server";

import { INTERNAL_API_URL } from "@/app/utils/apiConfig";

const BACKEND_BASE = INTERNAL_API_URL || "http://127.0.0.1:5000/api/v1";

async function fetchBackend(endpoint: string, options?: RequestInit): Promise<any> {
  try {
    const url = `${BACKEND_BASE}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        ...(options?.headers || {}),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "");
      const isHtml = text.trim().startsWith("<");
      if (isHtml || !res.ok) {
        return {
          status: false,
          error: `Backend phản hồi mã ${res.status} (${res.statusText || "HTML Error"}). Vui lòng kiểm tra biến môi trường INTERNAL_API_URL hoặc trạng thái backend service.`,
          msg: `Backend phản hồi mã ${res.status}. Vui lòng kiểm tra biến môi trường INTERNAL_API_URL trên Production.`,
        };
      }
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error(`[AdminSync API Error] ${endpoint}:`, err.message);
    return {
      status: false,
      error: `Không thể kết nối Backend (${BACKEND_BASE}): ${err.message}`,
      msg: `Không thể kết nối Backend (${BACKEND_BASE}). Vui lòng kiểm tra biến môi trường INTERNAL_API_URL trên Production.`,
    };
  }
}

export async function fetchSyncStatus() {
  const data = await fetchBackend("/admin/sync/status");
  if (data?.data) {
    return { data: data.data };
  }
  return { error: data?.error || data?.msg || "Lỗi lấy trạng thái crawler" };
}

export async function fetchSystemStats() {
  const data = await fetchBackend("/admin/stats");
  if (data?.data) {
    return { data: data.data };
  }
  return { error: data?.error || data?.msg || "Lỗi lấy thống kê hệ thống" };
}

export async function triggerInstantSyncAction(source: string = "all", pages: number = 2) {
  return await fetchBackend("/admin/sync/instant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, pages }),
  });
}

export async function toggleCronAction(source: string = "all", enable?: boolean) {
  return await fetchBackend("/admin/sync/cron/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, enable }),
  });
}

export async function startBulkSyncAction(source: string = "all", startPage: number = 1, maxPages?: number) {
  return await fetchBackend("/admin/sync/bulk/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, startPage, maxPages }),
  });
}

export async function pauseBulkSyncAction() {
  return await fetchBackend("/admin/sync/bulk/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function mergeMoviesAction(sourceSlug: string, targetSlug: string) {
  return await fetchBackend("/admin/movies/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceSlug, targetSlug }),
  });
}

export async function searchMoviesForRefreshAction(query: string) {
  return await fetchBackend(`/admin/movies/refresh/search?q=${encodeURIComponent(query)}`);
}

export async function refreshSelectedMoviesAction(slugs: string[], source: string = "all") {
  return await fetchBackend("/admin/movies/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slugs, source }),
  });
}

