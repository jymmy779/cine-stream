import { prisma } from "../lib/prisma.js";

async function fixInvertedImages() {
  console.log("=================================================");
  console.log("🖼️ BẮT ĐẦU QUÉT & SỬA LỖI ẢNH BỊ NGƯỢC (VSMOV / NGUONC)");
  console.log("=================================================\n");

  // Tìm tất cả các phim có ảnh từ vsmov hoặc nguonc
  const movies = await prisma.movie.findMany({
    where: {
      OR: [
        { poster_url: { contains: "vsmov" } },
        { thumb_url: { contains: "vsmov" } },
        { poster_url: { contains: "nguonc" } },
        { thumb_url: { contains: "nguonc" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      thumb_url: true,
      poster_url: true,
    },
  });

  console.log(`Tìm thấy ${movies.length} phim liên quan đến VSMov / NguonC trong DB.`);

  let updatedCount = 0;

  for (const m of movies) {
    if (!m.poster_url || !m.thumb_url) continue;

    let shouldSwap = false;

    // NguonC: File không có -1 thường là poster đứng, file có -1 là backdrop ngang
    // Nếu poster_url chứa '-1.jpg' hoặc thumb_url không chứa '-1.jpg' -> Bị ngược
    if (m.poster_url.includes("nguonc.com") || m.thumb_url.includes("nguonc.com")) {
      if (m.poster_url.includes("-1.jpg") && !m.thumb_url.includes("-1.jpg")) {
        shouldSwap = true;
      }
    }

    // Hoặc nếu thumb_url chứa chữ 'thumb_' (đặc trưng poster dọc của VSMov) mà lại nằm ở thumb_url
    if (m.thumb_url.includes("vsmov.com") || m.poster_url.includes("vsmov.com")) {
      if (m.poster_url !== m.thumb_url) {
        shouldSwap = true;
      }
    }

    if (shouldSwap) {
      await prisma.movie.update({
        where: { id: m.id },
        data: {
          poster_url: m.thumb_url,
          thumb_url: m.poster_url,
        },
      });
      updatedCount++;
    }
  }

  console.log(`\n🎉 ĐÃ SỬA VÀ HOÁN ĐỔI THÀNH CÔNG ${updatedCount} PHIM!`);
}

fixInvertedImages()
  .catch((err) => {
    console.error("Lỗi:", err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
