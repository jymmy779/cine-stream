import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { flushMemoryCache } from "@/app/lib/fetch-with-redis";

export async function POST() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get("lofilm_admin_token")?.value;

  if (!process.env.ADMIN_PASSWORD || adminToken !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ status: false, msg: "Không có quyền truy cập." }, { status: 401 });
  }

  await flushMemoryCache();
  return NextResponse.json({
    status: true,
    msg: "Đã xóa sạch toàn bộ Cache RAM & Redis của LoFilm thành công!",
    timestamp: new Date().toISOString(),
  });
}
