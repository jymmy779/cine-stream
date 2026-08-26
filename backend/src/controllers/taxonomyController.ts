import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { STANDARD_COUNTRIES } from "../services/taxonomyNormalizer.js";

const STANDARD_CATEGORY_ORDER = [
  "bi-an", "chien-tranh", "chinh-kich", "co-trang", "gia-dinh", "giat-gan", "hoat-hinh", "hai-huoc",
  "hanh-dong", "hinh-su", "hoc-duong", "khoa-hoc", "kinh-di", "kinh-dien", "lich-su", "mien-tay",
  "phim-18", "phim-ngan", "phieu-luu", "thieu-nhi", "than-thoai", "the-thao", "tien-hiep", "tre-em",
  "tai-lieu", "tam-ly", "tinh-cam", "vien-tuong", "vo-thuat", "am-nhac"
];

/**
 * GET /api/v1/the-loai
 * Lấy toàn bộ danh sách thể loại chuẩn hóa theo đúng layout 4 cột
 */
export async function getCategories(req: Request, res: Response) {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    categories.sort((a, b) => {
      const idxA = STANDARD_CATEGORY_ORDER.indexOf(a.slug);
      const idxB = STANDARD_CATEGORY_ORDER.indexOf(b.slug);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name, "vi");
    });

    return res.json({
      status: "success",
      message: "Thành công",
      data: {
        items: categories,
      },
      items: categories,
    });
  } catch (error: any) {
    console.error("[API Categories] Lỗi:", error.message);
    return res.status(500).json({ status: "error", message: error.message });
  }
}

/**
 * GET /api/v1/quoc-gia
 * Lấy toàn bộ danh sách quốc gia
 */
export async function getCountries(req: Request, res: Response) {
  try {
    const countries = await prisma.country.findMany({
      where: { slug: { in: STANDARD_COUNTRIES.map((country) => country.slug) } },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    const countryOrder = new Map(
      STANDARD_COUNTRIES.map((country, index) => [country.slug, index]),
    );
    countries.sort((a, b) =>
      (countryOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER)
      - (countryOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER),
    );

    return res.json({
      status: "success",
      message: "Thành công",
      data: {
        items: countries,
      },
      items: countries,
    });
  } catch (error: any) {
    console.error("[API Countries] Lỗi:", error.message);
    return res.status(500).json({ status: "error", message: error.message });
  }
}
