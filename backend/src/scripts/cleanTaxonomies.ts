import { prisma } from "../lib/prisma.js";
import axios from "axios";

async function main() {
  console.log("🚀 Bat dau chuan hoa The loai & Quoc gia chuan KKPhim + Custom...");

  const [catRes, counRes] = await Promise.all([
    axios.get("https://phimapi.com/v1/api/the-loai"),
    axios.get("https://phimapi.com/v1/api/quoc-gia"),
  ]);

  const fetchedCategories: { name: string; slug: string }[] = catRes.data?.data?.items || catRes.data?.items || [];
  const fetchedCountries: { name: string; slug: string }[] = counRes.data?.data?.items || counRes.data?.items || [];

  const customCategories = [
    { name: "Hoạt Hình", slug: "hoat-hinh" },
    { name: "Giật Gân", slug: "giat-gan" },
    { name: "Tiên Hiệp", slug: "tien-hiep" },
    { name: "Thiếu Nhi", slug: "thieu-nhi" },
  ];

  const catMap = new Map<string, string>();
  fetchedCategories.forEach(c => catMap.set(c.slug, c.name));
  customCategories.forEach(c => {
    if (!catMap.has(c.slug)) catMap.set(c.slug, c.name);
  });

  const standardCategories: { name: string; slug: string }[] = Array.from(catMap.entries())
    .filter(([slug]) => slug !== 'tre-em')
    .map(([slug, name]) => ({
      slug,
      name,
    }));

  const standardCountries: { name: string; slug: string }[] = fetchedCountries;

  console.log(`📌 Danh muc chuan: ${standardCategories.length} the loai va ${standardCountries.length} quoc gia.`);

  for (const cat of standardCategories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug },
    });
  }

  for (const coun of standardCountries) {
    await prisma.country.upsert({
      where: { slug: coun.slug },
      update: { name: coun.name },
      create: { name: coun.name, slug: coun.slug },
    });
  }

  console.log("✅ Hoan tat chuan hoa taxonomy.");
  await prisma.$disconnect();
}

main().catch(console.error);