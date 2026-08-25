import { NextResponse } from "next/server";
import { INTERNAL_API_URL } from "@/app/utils/apiConfig";

const BACKEND_BASE = INTERNAL_API_URL || "http://127.0.0.1:5000/api/v1";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_BASE}/admin/sync/status`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { status: false, error: `Backend phản hồi mã ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: false, error: `Không thể kết nối Backend: ${err.message}` },
      { status: 503 }
    );
  }
}
