import { NextResponse } from "next/server";
import { flushMemoryCache } from "@/app/lib/fetch-with-redis";

export async function GET() {
  await flushMemoryCache();
  return NextResponse.json({
    status: true,
    msg: "Đã xóa sạch toàn bộ Cache RAM & Redis của LoFilm thành công!",
    timestamp: new Date().toISOString(),
  });
}
