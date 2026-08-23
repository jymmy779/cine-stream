"use server";

import { INTERNAL_API_URL } from "@/app/utils/apiConfig";

const BACKEND_BASE = INTERNAL_API_URL || "http://127.0.0.1:5000/api/v1";

export async function fetchSyncStatus() {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/sync/status`, {
      cache: "no-store",
    });
    if (!res.ok) return { error: `Lỗi kết nối Backend (${res.status})` };
    const data = await res.json();
    return { data: data.data };
  } catch (err: any) {
    return { error: `Không thể kết nối đến Backend: ${err.message}` };
  }
}

export async function triggerInstantSyncAction(source: string = "all", pages: number = 2) {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/sync/instant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, pages }),
      cache: "no-store",
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { status: false, msg: `Lỗi: ${err.message}` };
  }
}

export async function toggleCronAction(source: string = "all", enable?: boolean) {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/sync/cron/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, enable }),
      cache: "no-store",
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { status: false, msg: `Lỗi: ${err.message}` };
  }
}

export async function startBulkSyncAction(source: string = "all", startPage: number = 1, maxPages?: number) {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/sync/bulk/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, startPage, maxPages }),
      cache: "no-store",
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { status: false, msg: `Lỗi: ${err.message}` };
  }
}

export async function pauseBulkSyncAction() {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/sync/bulk/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { status: false, msg: `Lỗi: ${err.message}` };
  }
}

export async function mergeMoviesAction(sourceSlug: string, targetSlug: string) {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/movies/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceSlug, targetSlug }),
      cache: "no-store",
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { status: false, msg: `Lỗi: ${err.message}` };
  }
}
