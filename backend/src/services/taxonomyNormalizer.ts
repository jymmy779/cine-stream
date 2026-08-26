import { removeAccents } from "./movieMatcher.js";

export interface TaxonomyItem {
  name: string;
  slug: string;
}

// ==========================================
// 1. DANH SÁCH 25 THỂ LOẠI CHUẨN LOFILM
// ==========================================
export const STANDARD_CATEGORIES: TaxonomyItem[] = [
  { name: "Hành Động", slug: "hanh-dong" },
  { name: "Tình Cảm", slug: "tinh-cam" },
  { name: "Cổ Trang", slug: "co-trang" },
  { name: "Hài Hước", slug: "hai-huoc" },
  { name: "Tâm Lý", slug: "tam-ly" },
  { name: "Kinh Dị", slug: "kinh-di" },
  { name: "Viễn Tưởng", slug: "vien-tuong" },
  { name: "Võ Thuật", slug: "vo-thuat" },
  { name: "Hình Sự", slug: "hinh-su" },
  { name: "Hoạt Hình", slug: "hoat-hinh" },
  { name: "Phiêu Lưu", slug: "phieu-luu" },
  { name: "Chiến Tranh", slug: "chien-tranh" },
  { name: "Bí Ẩn", slug: "bi-an" },
  { name: "Học Đường", slug: "hoc-duong" },
  { name: "Gia Đình", slug: "gia-dinh" },
  { name: "Tài Liệu", slug: "tai-lieu" },
  { name: "Thần Thoại", slug: "than-thoai" },
  { name: "Thể Thao", slug: "the-thao" },
  { name: "Âm Nhạc", slug: "am-nhac" },
  { name: "Khoa Học", slug: "khoa-hoc" },
  { name: "Giật Gân", slug: "giat-gan" },
  { name: "Chính Kịch", slug: "chinh-kich" },
  { name: "Tiên Hiệp", slug: "tien-hiep" },
  { name: "Phim Ngắn", slug: "phim-ngan" },
  { name: "Thiếu Nhi", slug: "thieu-nhi" },
  { name: "Kinh Điển", slug: "kinh-dien" },
  { name: "Lịch Sử", slug: "lich-su" },
  { name: "Miền Tây", slug: "mien-tay" },
  { name: "Phim 18+", slug: "phim-18" },
];

// ==========================================
// 2. DANH SÁCH 36 QUỐC GIA CHUẨN LOFILM (4 cột x 9 hàng)
// ==========================================
export const STANDARD_COUNTRIES: TaxonomyItem[] = [
  // Cột 1
  { name: "Việt Nam", slug: "viet-nam" },
  { name: "Trung Quốc", slug: "trung-quoc" },
  { name: "Hàn Quốc", slug: "han-quoc" },
  { name: "Nhật Bản", slug: "nhat-ban" },
  { name: "Thái Lan", slug: "thai-lan" },
  { name: "Âu Mỹ", slug: "au-my" },
  { name: "Hồng Kông", slug: "hong-kong" },
  { name: "Đài Loan", slug: "dai-loan" },
  { name: "Ấn Độ", slug: "an-do" },

  // Cột 2
  { name: "Anh", slug: "anh" },
  { name: "Pháp", slug: "phap" },
  { name: "Đức", slug: "duc" },
  { name: "Tây Ban Nha", slug: "tay-ban-nha" },
  { name: "Nga", slug: "nga" },
  { name: "Canada", slug: "canada" },
  { name: "Úc", slug: "uc" },
  { name: "Ý", slug: "y" },
  { name: "Indonesia", slug: "indonesia" },

  // Cột 3
  { name: "Philippines", slug: "philippines" },
  { name: "Malaysia", slug: "malaysia" },
  { name: "Thổ Nhĩ Kỳ", slug: "tho-nhi-ky" },
  { name: "Brazil", slug: "brazil" },
  { name: "Mexico", slug: "mexico" },
  { name: "Argentina", slug: "argentina" },
  { name: "Ba Lan", slug: "ba-lan" },
  { name: "Đan Mạch", slug: "dan-mach" },
  { name: "Thụy Điển", slug: "thuy-dien" },

  // Cột 4
  { name: "Thụy Sĩ", slug: "thuy-si" },
  { name: "Hà Lan", slug: "ha-lan" },
  { name: "Na Uy", slug: "na-uy" },
  { name: "Phần Lan", slug: "phan-lan" },
  { name: "Bỉ", slug: "bi" },
  { name: "Bồ Đào Nha", slug: "bo-dao-nha" },
  { name: "Colombia", slug: "colombia" },
  { name: "Nam Phi", slug: "nam-phi" },
  { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
];

// Map tra cứu nhanh chuẩn
const STANDARD_CAT_MAP = new Map(STANDARD_CATEGORIES.map((c) => [c.slug, c]));
const STANDARD_COUN_MAP = new Map(STANDARD_COUNTRIES.map((c) => [c.slug, c]));

// Bảng ánh xạ đa nguồn sang Thể Loại Chuẩn
const CATEGORY_MAP: Record<string, TaxonomyItem> = {
  // Hành động
  "hanh-dong": { name: "Hành Động", slug: "hanh-dong" },
  "phim-hanh-dong": { name: "Hành Động", slug: "hanh-dong" },
  "hanh dong": { name: "Hành Động", slug: "hanh-dong" },
  "action": { name: "Hành Động", slug: "hanh-dong" },

  // Tình cảm / Lãng mạn
  "tinh-cam": { name: "Tình Cảm", slug: "tinh-cam" },
  "phim-tinh-cam": { name: "Tình Cảm", slug: "tinh-cam" },
  "tinh cam": { name: "Tình Cảm", slug: "tinh-cam" },
  "lang-man": { name: "Tình Cảm", slug: "tinh-cam" },
  "lang man": { name: "Tình Cảm", slug: "tinh-cam" },
  "romance": { name: "Tình Cảm", slug: "tinh-cam" },
  "tinh-yeu-ngot-ngao": { name: "Tình Cảm", slug: "tinh-cam" },
  "tinh yeu ngot ngao": { name: "Tình Cảm", slug: "tinh-cam" },
  "tinh-ban": { name: "Tình Cảm", slug: "tinh-cam" },

  // Cổ trang
  "co-trang": { name: "Cổ Trang", slug: "co-trang" },
  "phim-co-trang": { name: "Cổ Trang", slug: "co-trang" },
  "co trang": { name: "Cổ Trang", slug: "co-trang" },
  "period": { name: "Cổ Trang", slug: "co-trang" },
  "costume": { name: "Cổ Trang", slug: "co-trang" },

  // Hài hước
  "hai": { name: "Hài Hước", slug: "hai-huoc" },
  "phim-hai": { name: "Hài Hước", slug: "hai-huoc" },
  "hai-huoc": { name: "Hài Hước", slug: "hai-huoc" },
  "phim-hai-huoc": { name: "Hài Hước", slug: "hai-huoc" },
  "hai huoc": { name: "Hài Hước", slug: "hai-huoc" },
  "comedy": { name: "Hài Hước", slug: "hai-huoc" },

  // Tâm lý
  "tam-ly": { name: "Tâm Lý", slug: "tam-ly" },
  "phim-tam-ly": { name: "Tâm Lý", slug: "tam-ly" },
  "tam ly": { name: "Tâm Lý", slug: "tam-ly" },
  "drama": { name: "Tâm Lý", slug: "tam-ly" },
  "hon-nhan": { name: "Tâm Lý", slug: "tam-ly" },
  "tra-thu": { name: "Tâm Lý", slug: "tam-ly" },
  "thuong-truong": { name: "Tâm Lý", slug: "tam-ly" },

  // Chính kịch
  "chinh-kich": { name: "Chính Kịch", slug: "chinh-kich" },
  "chinh kich": { name: "Chính Kịch", slug: "chinh-kich" },

  // Kinh dị
  "kinh-di": { name: "Kinh Dị", slug: "kinh-di" },
  "phim-kinh-di": { name: "Kinh Dị", slug: "kinh-di" },
  "kinh di": { name: "Kinh Dị", slug: "kinh-di" },
  "horror": { name: "Kinh Dị", slug: "kinh-di" },

  // Viễn tưởng / Khoa học
  "vien-tuong": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "phim-vien-tuong": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "vien tuong": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "khoa-hoc-vien-tuong": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "khoa-hoc-vien-tuong-gia-tuong": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "sci-fi": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "sci-fi-fantasy": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "science-fiction": { name: "Viễn Tưởng", slug: "vien-tuong" },
  "khoa-hoc": { name: "Khoa Học", slug: "khoa-hoc" },
  "khoa hoc": { name: "Khoa Học", slug: "khoa-hoc" },

  // Võ thuật / Kiếm hiệp / Tiên hiệp
  "vo-thuat": { name: "Võ Thuật", slug: "vo-thuat" },
  "phim-vo-thuat": { name: "Võ Thuật", slug: "vo-thuat" },
  "vo thuat": { name: "Võ Thuật", slug: "vo-thuat" },
  "martial-arts": { name: "Võ Thuật", slug: "vo-thuat" },
  "kungfu": { name: "Võ Thuật", slug: "vo-thuat" },
  "kiem-hiep": { name: "Tiên Hiệp", slug: "tien-hiep" },
  "tien-hiep": { name: "Tiên Hiệp", slug: "tien-hiep" },
  "wuxia": { name: "Tiên Hiệp", slug: "tien-hiep" },
  "xianxia": { name: "Tiên Hiệp", slug: "tien-hiep" },

  // Hình sự / Tội phạm
  "hinh-su": { name: "Hình Sự", slug: "hinh-su" },
  "phim-hinh-su": { name: "Hình Sự", slug: "hinh-su" },
  "hinh su": { name: "Hình Sự", slug: "hinh-su" },
  "toi-pham": { name: "Hình Sự", slug: "hinh-su" },
  "toi pham": { name: "Hình Sự", slug: "hinh-su" },
  "crime": { name: "Hình Sự", slug: "hinh-su" },

  // Hoạt hình / Anime
  "hoat-hinh": { name: "Hoạt Hình", slug: "hoat-hinh" },
  "phim-hoat-hinh": { name: "Hoạt Hình", slug: "hoat-hinh" },
  "hoat hinh": { name: "Hoạt Hình", slug: "hoat-hinh" },
  "anime": { name: "Hoạt Hình", slug: "hoat-hinh" },
  "animation": { name: "Hoạt Hình", slug: "hoat-hinh" },
  "cartoon": { name: "Hoạt Hình", slug: "hoat-hinh" },

  // Thiếu nhi / Trẻ em
  "thieu-nhi": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "phim-thieu-nhi": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "thieu nhi": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "tre-em": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "phim-tre-em": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "tre em": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "children": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "kids": { name: "Thiếu Nhi", slug: "thieu-nhi" },
  "kid": { name: "Thiếu Nhi", slug: "thieu-nhi" },

  // Phiêu lưu
  "phieu-luu": { name: "Phiêu Lưu", slug: "phieu-luu" },
  "phim-phieu-luu": { name: "Phiêu Lưu", slug: "phieu-luu" },
  "phieu luu": { name: "Phiêu Lưu", slug: "phieu-luu" },
  "adventure": { name: "Phiêu Lưu", slug: "phieu-luu" },
  "hanh-dong-phieu-luu": { name: "Phiêu Lưu", slug: "phieu-luu" },

  // Chiến tranh
  "chien-tranh": { name: "Chiến Tranh", slug: "chien-tranh" },
  "phim-chien-tranh": { name: "Chiến Tranh", slug: "chien-tranh" },
  "chien tranh": { name: "Chiến Tranh", slug: "chien-tranh" },
  "war": { name: "Chiến Tranh", slug: "chien-tranh" },

  // Bí ẩn
  "bi-an": { name: "Bí Ẩn", slug: "bi-an" },
  "phim-bi-an": { name: "Bí Ẩn", slug: "bi-an" },
  "bi an": { name: "Bí Ẩn", slug: "bi-an" },
  "mystery": { name: "Bí Ẩn", slug: "bi-an" },

  // Học đường / Thanh xuân
  "hoc-duong": { name: "Học Đường", slug: "hoc-duong" },
  "phim-hoc-duong": { name: "Học Đường", slug: "hoc-duong" },
  "hoc duong": { name: "Học Đường", slug: "hoc-duong" },
  "thanh-xuan": { name: "Học Đường", slug: "hoc-duong" },
  "thanh xuan": { name: "Học Đường", slug: "hoc-duong" },
  "school": { name: "Học Đường", slug: "hoc-duong" },

  // Gia đình
  "gia-dinh": { name: "Gia Đình", slug: "gia-dinh" },
  "phim-gia-dinh": { name: "Gia Đình", slug: "gia-dinh" },
  "gia dinh": { name: "Gia Đình", slug: "gia-dinh" },
  "family": { name: "Gia Đình", slug: "gia-dinh" },

  // Tài liệu
  "tai-lieu": { name: "Tài Liệu", slug: "tai-lieu" },
  "phim-tai-lieu": { name: "Tài Liệu", slug: "tai-lieu" },
  "tai lieu": { name: "Tài Liệu", slug: "tai-lieu" },
  "documentary": { name: "Tài Liệu", slug: "tai-lieu" },

  // Thần thoại / Giả tưởng
  "than-thoai": { name: "Thần Thoại", slug: "than-thoai" },
  "phim-than-thoai": { name: "Thần Thoại", slug: "than-thoai" },
  "than thoai": { name: "Thần Thoại", slug: "than-thoai" },
  "gia-tuong": { name: "Thần Thoại", slug: "than-thoai" },
  "fantasy": { name: "Thần Thoại", slug: "than-thoai" },
  "mythology": { name: "Thần Thoại", slug: "than-thoai" },

  // Thể thao
  "the-thao": { name: "Thể Thao", slug: "the-thao" },
  "phim-the-thao": { name: "Thể Thao", slug: "the-thao" },
  "the thao": { name: "Thể Thao", slug: "the-thao" },
  "sport": { name: "Thể Thao", slug: "the-thao" },

  // Âm nhạc
  "am-nhac": { name: "Âm Nhạc", slug: "am-nhac" },
  "phim-am-nhac": { name: "Âm Nhạc", slug: "am-nhac" },
  "am nhac": { name: "Âm Nhạc", slug: "am-nhac" },
  "music": { name: "Âm Nhạc", slug: "am-nhac" },
  "musical": { name: "Âm Nhạc", slug: "am-nhac" },
  "ca-nhac": { name: "Âm Nhạc", slug: "am-nhac" },

  // Giật gân
  "giat-gan": { name: "Giật Gân", slug: "giat-gan" },
  "phim-giat-gan": { name: "Giật Gân", slug: "giat-gan" },
  "giat gan": { name: "Giật Gân", slug: "giat-gan" },
  "gay-can": { name: "Giật Gân", slug: "giat-gan" },
  "gay can": { name: "Giật Gân", slug: "giat-gan" },
  "thriller": { name: "Giật Gân", slug: "giat-gan" },

  // Phim ngắn / Đoản văn / Short drama / Tiểu thuyết chuyển thể
  "phim-ngan": { name: "Phim Ngắn", slug: "phim-ngan" },
  "phim ngan": { name: "Phim Ngắn", slug: "phim-ngan" },
  "doan-van": { name: "Phim Ngắn", slug: "phim-ngan" },
  "doan van": { name: "Phim Ngắn", slug: "phim-ngan" },
  "doan-kich": { name: "Phim Ngắn", slug: "phim-ngan" },
  "doan kich": { name: "Phim Ngắn", slug: "phim-ngan" },
  "short-film": { name: "Phim Ngắn", slug: "phim-ngan" },
  "short-drama": { name: "Phim Ngắn", slug: "phim-ngan" },
  "micro-drama": { name: "Phim Ngắn", slug: "phim-ngan" },
  "tieu-thuyet-chuyen-the": { name: "Phim Ngắn", slug: "phim-ngan" },
  
  // Kinh điển
  "kinh-dien": { name: "Kinh Điển", slug: "kinh-dien" },
  "phim-kinh-dien": { name: "Kinh Điển", slug: "kinh-dien" },
  "kinh dien": { name: "Kinh Điển", slug: "kinh-dien" },
  "classic": { name: "Kinh Điển", slug: "kinh-dien" },
  "classics": { name: "Kinh Điển", slug: "kinh-dien" },

  // Lịch sử
  "lich-su": { name: "Lịch Sử", slug: "lich-su" },
  "phim-lich-su": { name: "Lịch Sử", slug: "lich-su" },
  "lich su": { name: "Lịch Sử", slug: "lich-su" },
  "history": { name: "Lịch Sử", slug: "lich-su" },
  "historical": { name: "Lịch Sử", slug: "lich-su" },

  // Miền Tây / Viễn Tây
  "mien-tay": { name: "Miền Tây", slug: "mien-tay" },
  "phim-mien-tay": { name: "Miền Tây", slug: "mien-tay" },
  "mien tay": { name: "Miền Tây", slug: "mien-tay" },
  "western": { name: "Miền Tây", slug: "mien-tay" },
  "westerns": { name: "Miền Tây", slug: "mien-tay" },

  // Phim 18+
  "phim-18": { name: "Phim 18+", slug: "phim-18" },
  "18+": { name: "Phim 18+", slug: "phim-18" },
  "phim-18+": { name: "Phim 18+", slug: "phim-18" },
  "phim 18+": { name: "Phim 18+", slug: "phim-18" },
  "adult": { name: "Phim 18+", slug: "phim-18" },
  "erotic": { name: "Phim 18+", slug: "phim-18" },

  "hu-cau": { name: "Thần Thoại", slug: "than-thoai" },
};

// Bảng ánh xạ đa nguồn sang Quốc Gia Chuẩn
const COUNTRY_MAP: Record<string, TaxonomyItem> = {
  // Việt Nam
  "viet-nam": { name: "Việt Nam", slug: "viet-nam" },
  "vietnam": { name: "Việt Nam", slug: "viet-nam" },
  "vn": { name: "Việt Nam", slug: "viet-nam" },
  "viet nam": { name: "Việt Nam", slug: "viet-nam" },

  // Trung Quốc
  "trung-quoc": { name: "Trung Quốc", slug: "trung-quoc" },
  "trung quoc": { name: "Trung Quốc", slug: "trung-quoc" },
  "trung-quoc-dai-luc": { name: "Trung Quốc", slug: "trung-quoc" },
  "china": { name: "Trung Quốc", slug: "trung-quoc" },
  "cn": { name: "Trung Quốc", slug: "trung-quoc" },

  // Hàn Quốc
  "han-quoc": { name: "Hàn Quốc", slug: "han-quoc" },
  "han quoc": { name: "Hàn Quốc", slug: "han-quoc" },
  "korea": { name: "Hàn Quốc", slug: "han-quoc" },
  "south-korea": { name: "Hàn Quốc", slug: "han-quoc" },
  "kr": { name: "Hàn Quốc", slug: "han-quoc" },

  // Nhật Bản
  "nhat-ban": { name: "Nhật Bản", slug: "nhat-ban" },
  "nhat ban": { name: "Nhật Bản", slug: "nhat-ban" },
  "japan": { name: "Nhật Bản", slug: "nhat-ban" },
  "jp": { name: "Nhật Bản", slug: "nhat-ban" },

  // Thái Lan
  "thai-lan": { name: "Thái Lan", slug: "thai-lan" },
  "thai lan": { name: "Thái Lan", slug: "thai-lan" },
  "thailand": { name: "Thái Lan", slug: "thai-lan" },
  "th": { name: "Thái Lan", slug: "thai-lan" },

  // Âu Mỹ
  "au-my": { name: "Âu Mỹ", slug: "au-my" },
  "au my": { name: "Âu Mỹ", slug: "au-my" },
  // ISO 3166-1 alpha-2: MY is Malaysia. Do not confuse it with Vietnamese "Mỹ".
  "my": { name: "Malaysia", slug: "malaysia" },
  "us": { name: "Âu Mỹ", slug: "au-my" },
  "usa": { name: "Âu Mỹ", slug: "au-my" },
  "united-states": { name: "Âu Mỹ", slug: "au-my" },
  "united-states-of-america": { name: "Âu Mỹ", slug: "au-my" },

  // Hồng Kông
  "hong-kong": { name: "Hồng Kông", slug: "hong-kong" },
  "hong kong": { name: "Hồng Kông", slug: "hong-kong" },
  "hongkong": { name: "Hồng Kông", slug: "hong-kong" },
  "hk": { name: "Hồng Kông", slug: "hong-kong" },

  // Đài Loan
  "dai-loan": { name: "Đài Loan", slug: "dai-loan" },
  "dai loan": { name: "Đài Loan", slug: "dai-loan" },
  "taiwan": { name: "Đài Loan", slug: "dai-loan" },
  "tw": { name: "Đài Loan", slug: "dai-loan" },

  // Ấn Độ
  "an-do": { name: "Ấn Độ", slug: "an-do" },
  "an do": { name: "Ấn Độ", slug: "an-do" },
  "india": { name: "Ấn Độ", slug: "an-do" },
  "in": { name: "Ấn Độ", slug: "an-do" },

  // Anh
  "anh": { name: "Anh", slug: "anh" },
  "anh-quoc": { name: "Anh", slug: "anh" },
  "uk": { name: "Anh", slug: "anh" },
  "gb": { name: "Anh", slug: "anh" },
  "united-kingdom": { name: "Anh", slug: "anh" },
  "great-britain": { name: "Anh", slug: "anh" },
  "northern-ireland": { name: "Anh", slug: "anh" },

  // Pháp
  "phap": { name: "Pháp", slug: "phap" },
  "france": { name: "Pháp", slug: "phap" },
  "fr": { name: "Pháp", slug: "phap" },

  // Đức
  "duc": { name: "Đức", slug: "duc" },
  "germany": { name: "Đức", slug: "duc" },
  "de": { name: "Đức", slug: "duc" },

  // Tây Ban Nha
  "tay-ban-nha": { name: "Tây Ban Nha", slug: "tay-ban-nha" },
  "tay ban nha": { name: "Tây Ban Nha", slug: "tay-ban-nha" },
  "spain": { name: "Tây Ban Nha", slug: "tay-ban-nha" },
  "es": { name: "Tây Ban Nha", slug: "tay-ban-nha" },

  // Nga
  "nga": { name: "Nga", slug: "nga" },
  "russia": { name: "Nga", slug: "nga" },
  "ru": { name: "Nga", slug: "nga" },

  // Canada
  "canada": { name: "Canada", slug: "canada" },
  "ca": { name: "Canada", slug: "canada" },

  // Úc
  "uc": { name: "Úc", slug: "uc" },
  "australia": { name: "Úc", slug: "uc" },
  "au": { name: "Úc", slug: "uc" },

  // Ý
  "y": { name: "Ý", slug: "y" },
  "italy": { name: "Ý", slug: "y" },
  "it": { name: "Ý", slug: "y" },

  // Indonesia
  "indonesia": { name: "Indonesia", slug: "indonesia" },
  "id": { name: "Indonesia", slug: "indonesia" },

  // Philippines
  "philippines": { name: "Philippines", slug: "philippines" },
  "ph": { name: "Philippines", slug: "philippines" },

  // Malaysia
  "malaysia": { name: "Malaysia", slug: "malaysia" },
  "my-country": { name: "Malaysia", slug: "malaysia" },

  // Thổ Nhĩ Kỳ
  "tho-nhi-ky": { name: "Thổ Nhĩ Kỳ", slug: "tho-nhi-ky" },
  "turkey": { name: "Thổ Nhĩ Kỳ", slug: "tho-nhi-ky" },
  "tr": { name: "Thổ Nhĩ Kỳ", slug: "tho-nhi-ky" },

  // Brazil
  "brazil": { name: "Brazil", slug: "brazil" },
  "br": { name: "Brazil", slug: "brazil" },

  // Mexico
  "mexico": { name: "Mexico", slug: "mexico" },
  "mx": { name: "Mexico", slug: "mexico" },

  // Argentina
  "argentina": { name: "Argentina", slug: "argentina" },
  "ar": { name: "Argentina", slug: "argentina" },

  // Ba Lan
  "ba-lan": { name: "Ba Lan", slug: "ba-lan" },
  "poland": { name: "Ba Lan", slug: "ba-lan" },
  "pl": { name: "Ba Lan", slug: "ba-lan" },

  // Đan Mạch
  "dan-mach": { name: "Đan Mạch", slug: "dan-mach" },
  "denmark": { name: "Đan Mạch", slug: "dan-mach" },
  "dk": { name: "Đan Mạch", slug: "dan-mach" },

  // Thụy Điển
  "thuy-dien": { name: "Thụy Điển", slug: "thuy-dien" },
  "sweden": { name: "Thụy Điển", slug: "thuy-dien" },
  "se": { name: "Thụy Điển", slug: "thuy-dien" },

  // Thụy Sĩ
  "thuy-si": { name: "Thụy Sĩ", slug: "thuy-si" },
  "switzerland": { name: "Thụy Sĩ", slug: "thuy-si" },
  "ch": { name: "Thụy Sĩ", slug: "thuy-si" },

  // Hà Lan
  "ha-lan": { name: "Hà Lan", slug: "ha-lan" },
  "netherlands": { name: "Hà Lan", slug: "ha-lan" },
  "nl": { name: "Hà Lan", slug: "ha-lan" },

  // Na Uy
  "na-uy": { name: "Na Uy", slug: "na-uy" },
  "norway": { name: "Na Uy", slug: "na-uy" },
  "no": { name: "Na Uy", slug: "na-uy" },

  // Phần Lan
  "phan-lan": { name: "Phần Lan", slug: "phan-lan" },
  "finland": { name: "Phần Lan", slug: "phan-lan" },
  "fi": { name: "Phần Lan", slug: "phan-lan" },

  // Bỉ
  "bi": { name: "Bỉ", slug: "bi" },
  "belgium": { name: "Bỉ", slug: "bi" },
  "be": { name: "Bỉ", slug: "bi" },

  // Bồ Đào Nha
  "bo-dao-nha": { name: "Bồ Đào Nha", slug: "bo-dao-nha" },
  "portugal": { name: "Bồ Đào Nha", slug: "bo-dao-nha" },
  "pt": { name: "Bồ Đào Nha", slug: "bo-dao-nha" },

  // Colombia
  "colombia": { name: "Colombia", slug: "colombia" },
  "co": { name: "Colombia", slug: "colombia" },

  // Nam Phi
  "nam-phi": { name: "Nam Phi", slug: "nam-phi" },
  "south-africa": { name: "Nam Phi", slug: "nam-phi" },
  "za": { name: "Nam Phi", slug: "nam-phi" },
  "chau-phi": { name: "Nam Phi", slug: "nam-phi" },

  // Quốc gia khác
  "quoc-gia-khac": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "khac": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "other": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "uae": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "ukraine": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "ukraina": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "ie": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
  "ireland": { name: "Quốc Gia Khác", slug: "quoc-gia-khac" },
};

function normalizeKey(str: string): string {
  if (!str) return "";
  return removeAccents(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Kiểm tra xem tag có phải là rác không (Năm, Trạng thái, Loại phim...)
 */
function isGarbageCategory(str: string): boolean {
  const s = normalizeKey(str);
  if (!s) return true;

  // 1. Nếu là con số thuần túy (Năm: 1931, 1998, 2026...)
  if (/^\d{2,4}$/.test(s)) return true;

  // 2. Nếu là trạng thái phim
  if (
    [
      "dang-chieu",
      "hoan-tat",
      "tap-moi",
      "sap-chieu",
      "trailer",
      "full",
      "hd",
      "fhd",
      "cam",
    ].includes(s)
  ) {
    return true;
  }

  // 3. Nếu là loại phim / TV Shows (đã có menu riêng ở 'Thêm')
  if (
    [
      "phim-bo",
      "phim-le",
      "phim-chieu-rap",
      "chieu-rap",
      "series",
      "single",
      "movie",
      "tv-shows",
      "tv-show",
      "tvshows",
      "show",
      "reality-tv",
      "game-show",
      "truyen-hinh-thuc-te",
    ].includes(s)
  ) {
    return true;
  }

  return false;
}

/**
 * Chuẩn hóa 1 thể loại: Chỉ trả về TaxonomyItem nếu thuộc danh mục chuẩn, ngược lại null
 */
export function normalizeCategory(raw: { name?: string; slug?: string } | string): TaxonomyItem | null {
  const rawName = typeof raw === "string" ? raw : raw?.name || "";
  const rawSlug = typeof raw === "string" ? raw : raw?.slug || "";

  if (isGarbageCategory(rawSlug) || isGarbageCategory(rawName)) {
    return null;
  }

  // 1. Thử match qua slug
  const keySlug = normalizeKey(rawSlug);
  if (CATEGORY_MAP[keySlug]) return CATEGORY_MAP[keySlug];

  // 2. Thử match qua name
  const keyName = normalizeKey(rawName);
  if (CATEGORY_MAP[keyName]) return CATEGORY_MAP[keyName];

  // 3. Kiểm tra xem có phải tên quốc gia bị gửi nhầm vào category không
  if (COUNTRY_MAP[keySlug] || COUNTRY_MAP[keyName]) {
    // Bỏ qua không lưu vào category
    return null;
  }

  // Nếu không khớp danh mục chuẩn -> BỎ QUA (Không tự tạo slug rác)
  return null;
}

/**
 * Chuẩn hóa 1 quốc gia: Chỉ trả về TaxonomyItem nếu thuộc danh mục chuẩn
 */
export function normalizeCountry(raw: { name?: string; slug?: string } | string): TaxonomyItem | null {
  const rawName = typeof raw === "string" ? raw : raw?.name || "";
  const rawSlug = typeof raw === "string" ? raw : raw?.slug || "";

  // 1. Thử match qua slug
  const keySlug = normalizeKey(rawSlug);
  if (COUNTRY_MAP[keySlug]) return COUNTRY_MAP[keySlug];

  // 2. Thử match qua name
  const keyName = normalizeKey(rawName);
  if (COUNTRY_MAP[keyName]) return COUNTRY_MAP[keyName];

  // 3. Nếu là mã quốc gia lạ hoặc không nhận diện -> Map về "Quốc Gia Khác"
  if (rawName || rawSlug) {
    return { name: "Quốc Gia Khác", slug: "quoc-gia-khac" };
  }

  return null;
}

/**
 * Chuẩn hóa danh sách thể loại: Loại bỏ trùng lặp và tag rác
 */
export function normalizeCategories(list: any | any[]): TaxonomyItem[] {
  if (!list) return [];
  const validList = Array.isArray(list) ? list : [list];
  const map = new Map<string, TaxonomyItem>();

  for (const item of validList) {
    if (!item) continue;
    const normalized = normalizeCategory(item);
    if (normalized && normalized.slug && !map.has(normalized.slug)) {
      map.set(normalized.slug, normalized);
    }
  }

  return Array.from(map.values());
}

/**
 * Chuẩn hóa danh sách quốc gia: Loại bỏ trùng lặp
 */
export function normalizeCountries(list: any[]): TaxonomyItem[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, TaxonomyItem>();

  for (const item of list) {
    if (!item) continue;
    const normalized = normalizeCountry(item);
    if (normalized && normalized.slug && !map.has(normalized.slug)) {
      map.set(normalized.slug, normalized);
    }
  }

  return Array.from(map.values());
}
