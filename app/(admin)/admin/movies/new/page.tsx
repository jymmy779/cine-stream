"use client";
import { useState, useTransition, useEffect } from "react";
import { addExclusiveMovie, previewTMDB } from "@/app/actions/adminMovies";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";

export default function NewMoviePage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Form states
    const [tmdbId, setTmdbId] = useState("");
    const [type, setType] = useState<"single" | "series">("single");
    const [slug, setSlug] = useState("");
    const [status, setStatus] = useState("draft");
    const [langTag, setLangTag] = useState("Vietsub Độc Quyền");
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewError, setPreviewError] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    
    // Auto-check PhimAPI states
    const [phimApiStatus, setPhimApiStatus] = useState<"checking" | "found" | "not_found" | "idle">("idle");
    const [phimApiData, setPhimApiData] = useState<any>(null);

    // Single Movie Details
    const [linkType, setLinkType] = useState<"m3u8" | "embed" | "both">("m3u8");

    // Starred Hero Slider states
    const [isStarred, setIsStarred] = useState(false);
    const [expiresDays, setExpiresDays] = useState<number | string>("");

    // Custom tag độc quyền
    const [subDocquyenManual, setSubDocquyenManual] = useState(true);

    useEffect(() => {
        if (!slug.trim()) {
            setPhimApiStatus("idle");
            setPhimApiData(null);
            return;
        }
        const timer = setTimeout(async () => {
            setPhimApiStatus("checking");
            try {
                const INTERNAL_API_URL = process.env.NEXT_PUBLIC_INTERNAL_API_URL || 'http://localhost:5000/api';
                const res = await fetch(`${INTERNAL_API_URL}/phim/${slug.trim()}`);
                const data = await res.json();
                if (data.status) {
                    setPhimApiStatus("found");
                    setPhimApiData(data);
                    const tmdbIdFromApi = data.data?.item?.tmdb?.id || data.movie?.tmdb?.id;
                    if (tmdbIdFromApi) {
                        setTmdbId(prev => prev ? prev : tmdbIdFromApi);
                    }
                } else {
                    setPhimApiStatus("not_found");
                    setPhimApiData(null);
                }
            } catch (error) {
                setPhimApiStatus("not_found");
                setPhimApiData(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [slug]);

    const handleFillFromPhimApi = () => {
        if (!phimApiData) return;
        const item = phimApiData.data?.item || phimApiData.movie;
        if (!item) return;

        if (item.type) {
            setType(item.type === 'series' || item.type === 'hoathinh' || item.type === 'tvshows' ? 'series' : 'single');
        }
        toast.success("Đã tự động lấy dữ liệu từ PhimAPI!");
    };

    const handlePreview = async (id: string) => {
        if (!id.trim()) { setPreviewError("Vui lòng nhập TMDB ID"); return; }
        setIsChecking(true); setPreviewError(""); setPreviewData(null);
        const res = await previewTMDB(id, type);
        setIsChecking(false);
        if (res.error) setPreviewError(res.error);
        else setPreviewData(res);
    };

    const handleSaveMovie = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries()) as Record<string, string>;
        
        startTransition(async () => {
            try {
                const res = await addExclusiveMovie(data);
                if (res.error) toast.error(res.error);
                else {
                    toast.success("Thêm phim độc quyền thành công!");
                    router.push("/admin/dashboard");
                }
            } catch (err: any) {
                toast.error(`Lỗi hệ thống: ${err.message || "Không thể kết nối đến server"}`);
            }
        });
    };

    return (
        <div className="bg-[#0F1115] min-h-screen text-white">
            <header className="bg-[#0F1115] border-b border-white/10 sticky top-0 z-10">
                <div className="container mx-auto px-4 h-16 flex items-center gap-4">
                    <Link href="/admin/movies" className="text-gray-400 hover:text-white transition flex items-center gap-2">
                        <i className="fa-solid fa-arrow-left"></i> Danh sách phim
                    </Link>
                    <span className="text-white font-medium border-l border-white/20 pl-4">Đăng Phim Độc Quyền</span>
                </div>
            </header>
            
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="bg-[#0F1115] p-6 md:p-8 rounded-2xl border border-white/10 shadow-2xl">
                    <div className="mb-6 pb-4 border-b border-white/10 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <span className="text-amber-400">👑</span> Thêm Phim Độc Quyền (CMS)
                            </h2>
                            <p className="text-xs text-white/50 mt-1">Phim lưu trên Supabase Cloud, hỗ trợ link streaming R2/B2/Embed độc quyền</p>
                        </div>
                        <span className="text-xs px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
                            Độc Quyền LoFilm
                        </span>
                    </div>

                    <form onSubmit={handleSaveMovie} className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-gray-400 text-sm mb-1.5 block">Loại phim</label>
                                <select name="type" value={type} onChange={(e) => setType(e.target.value as any)} className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10">
                                    <option value="single">Phim Lẻ</option>
                                    <option value="series">Phim Bộ</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm mb-1.5 block">
                                    TMDB ID {phimApiStatus === 'found' ? <span className="text-green-400 text-xs font-normal ml-2">(Tùy chọn)</span> : <span className="text-red-400 text-xs font-normal ml-2">(*) Bắt buộc</span>}
                                </label>
                                <div className="flex gap-2">
                                    <input name="tmdb_id" type="text" value={tmdbId} onChange={e => setTmdbId(e.target.value)} required={phimApiStatus !== 'found'} className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10" placeholder="Ví dụ: 1139087" />
                                    <button type="button" onClick={() => handlePreview(tmdbId)} disabled={isChecking} className="bg-[#D497FF] hover:bg-[#D497FF]/90 text-black px-5 rounded-lg transition shrink-0 font-medium">
                                        {isChecking ? <i className="fa-solid fa-spinner fa-spin"></i> : "Check"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {previewError && <div className="text-red-500 text-sm">{previewError}</div>}
                        {previewData && (
                            <div className="flex gap-4 bg-[#0F1115] p-4 rounded-xl items-center border border-green-500/30">
                                {previewData.poster && <img src={previewData.poster} alt={previewData.title} className="w-16 h-24 object-cover rounded-lg shadow-md" />}
                                <div>
                                    <div className="font-bold text-green-400 text-lg">{previewData.title}</div>
                                    <div className="text-sm text-gray-400 line-clamp-2 mt-1">{previewData.overview}</div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-gray-400 text-sm mb-1.5 block">Slug (URL Phim)</label>
                                <input name="slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} required className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10" placeholder="ten-phim-viet-lien-khong-dau" />
                                <div className="h-5 mt-1.5">
                                    {phimApiStatus === 'checking' && <div className="text-gray-400 text-xs flex items-center gap-1"><i className="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...</div>}
                                    {phimApiStatus === 'found' && <div className="text-green-400 text-xs flex items-center gap-1"><i className="fa-solid fa-check"></i> Đã có trên hệ thống</div>}
                                    {phimApiStatus === 'not_found' && <div className="text-amber-400 text-xs flex items-center gap-1"><i className="fa-solid fa-sparkles"></i> Phim mới (Dùng dữ liệu TMDB)</div>}
                                </div>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm mb-1.5 block">Trạng thái</label>
                                <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10">
                                    <option value="draft">Bản nháp</option>
                                    <option value="published">Công khai</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm mb-1.5 block">Tag ngôn ngữ</label>
                                <select name="lang_tag" value={langTag} onChange={(e) => setLangTag(e.target.value)} className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10">
                                    {subDocquyenManual ? (
                                        <>
                                            <option value="Vietsub Độc Quyền">Vietsub Độc Quyền</option>
                                            <option value="Song Ngữ Độc Quyền">Song Ngữ Độc Quyền</option>
                                            <option value="Lồng Tiếng Độc Quyền">Lồng Tiếng Độc Quyền</option>
                                            <option value="Thuyết Minh Độc Quyền">Thuyết Minh Độc Quyền</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Vietsub">Vietsub</option>
                                            <option value="Song Ngữ">Song Ngữ</option>
                                            <option value="Lồng Tiếng">Lồng Tiếng</option>
                                            <option value="Thuyết Minh">Thuyết Minh</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* Exclusive Tag Checkbox */}
                        <div className="bg-[#0F1115]/50 border border-purple-500/30 rounded-xl p-5 md:p-6">
                            <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                <div className="relative flex items-center justify-center w-6 h-6">
                                    <input 
                                        type="checkbox" 
                                        name="sub_docquyen" 
                                        checked={subDocquyenManual} 
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setSubDocquyenManual(checked);
                                            setLangTag(prev => checked ? `${prev.replace(" Độc Quyền", "")} Độc Quyền` : prev.replace(" Độc Quyền", ""));
                                        }} 
                                        className="appearance-none w-6 h-6 border-2 border-purple-500/50 rounded bg-transparent checked:bg-purple-600 transition-colors peer cursor-pointer" 
                                    />
                                    <i className="fa-solid fa-check absolute text-white text-xs opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></i>
                                </div>
                                <div className="flex-1">
                                    <span className="font-semibold text-purple-400 group-hover:text-purple-300 transition">👑 Đánh dấu là Phim Độc Quyền</span>
                                    <p className="text-sm text-gray-400 mt-0.5">Hiển thị badge "Độc Quyền" màu nổi bật ở góc trên poster phim</p>
                                </div>
                            </label>
                        </div>

                        {/* Starred UI */}
                        <div className="bg-[#0F1115]/50 border border-[#D497FF]/30 rounded-xl p-5 md:p-6">
                            <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                <div className="relative flex items-center justify-center w-6 h-6">
                                    <input 
                                        type="checkbox" 
                                        name="is_starred" 
                                        checked={isStarred} 
                                        onChange={(e) => setIsStarred(e.target.checked)} 
                                        className="appearance-none w-6 h-6 border-2 border-[#D497FF]/50 rounded bg-transparent checked:bg-amber-500 transition-colors peer cursor-pointer" 
                                    />
                                    <i className="fa-solid fa-check absolute text-[#0F1115] text-xs opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></i>
                                </div>
                                <div className="flex-1">
                                    <span className="font-semibold text-amber-400 group-hover:text-amber-300 transition">⭐ Đánh dấu ưu tiên lên Hero Slider</span>
                                    <p className="text-sm text-gray-400 mt-0.5">Phim sẽ được đặt lên vị trí đầu tiên ngoài trang chủ</p>
                                </div>
                            </label>

                            {isStarred && (
                                <div className="mt-4 ml-9 flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <div className="flex-1 max-w-xs">
                                        <label className="text-gray-400 text-sm mb-1.5 block">Thời gian hiển thị (Số ngày)</label>
                                        <input 
                                            name="expires_in_days" 
                                            type="number" 
                                            min="0"
                                            value={expiresDays} 
                                            onChange={(e) => setExpiresDays(e.target.value)} 
                                            className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-amber-500 border border-white/5" 
                                            placeholder="Để trống hoặc 0 nếu không giới hạn" 
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 md:w-1/2 mt-2 md:mt-6">
                                        Sau <span className="text-amber-400 font-bold">{expiresDays || 'vô hạn'}</span> ngày, hệ thống sẽ tự động gỡ phim khỏi Hero Slider.
                                    </p>
                                </div>
                            )}
                        </div>

                        {type === 'single' && (
                            <div className="border border-white/10 rounded-xl p-5 md:p-6 bg-[#0F1115]/50">
                                <h4 className="font-semibold mb-4 text-sm text-gray-300 uppercase tracking-wider">Thông tin Video (Phim Lẻ)</h4>
                                
                                <div className="bg-[#0F1115]/50 p-3 rounded-lg border border-white/5 mb-5">
                                    <label className="text-gray-300 text-sm font-medium mb-2 block">Nguồn Video (Server phát)</label>
                                    <div className="flex flex-wrap gap-4 text-sm">
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-white text-gray-400 transition">
                                            <input type="radio" name="linkTypeGroup" value="m3u8" checked={linkType === 'm3u8'} onChange={() => setLinkType('m3u8')} className="accent-blue-500 w-4 h-4" />
                                            Chỉ M3U8 (R2/B2)
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-white text-gray-400 transition">
                                            <input type="radio" name="linkTypeGroup" value="embed" checked={linkType === 'embed'} onChange={() => setLinkType('embed')} className="accent-blue-500 w-4 h-4" />
                                            Chỉ Embed (Loadvid)
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-white text-gray-400 transition">
                                            <input type="radio" name="linkTypeGroup" value="both" checked={linkType === 'both'} onChange={() => setLinkType('both')} className="accent-blue-500 w-4 h-4" />
                                            Dùng cả hai
                                        </label>
                                    </div>
                                </div>

                                <div className={`grid grid-cols-1 ${linkType === 'both' ? 'md:grid-cols-2' : ''} gap-5 mb-5`}>
                                    {(linkType === 'm3u8' || linkType === 'both') && (
                                        <div>
                                            <label className="text-gray-400 text-sm mb-1.5 block">Link M3U8 (Video Streaming - R2/B2)</label>
                                            <input name="link_m3u8" type="url" className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10" placeholder="https://pub-xxxx.r2.dev/phim-xxx/index.m3u8" />
                                        </div>
                                    )}
                                    {(linkType === 'embed' || linkType === 'both') && (
                                        <div>
                                            <label className="text-gray-400 text-sm mb-1.5 block">Link Embed (Dự phòng - Loadvid)</label>
                                            <input name="link_embed" type="url" className="w-full bg-[#0F1115] text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#D497FF] border border-white/10" placeholder="https://cdn.loadvid.com/..." />
                                        </div>
                                    )}
                                </div>

                                {linkType !== 'embed' && (
                                    <div>
                                        <label className="text-gray-400 text-sm mb-1.5 block">
                                            Phụ đề (Song Ngữ) — <span className="text-gray-500 italic">Tùy chọn</span>
                                        </label>
                                        <textarea
                                            name="subtitle_tracks"
                                            rows={4}
                                            className="w-full bg-[#0F1115] text-white rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#D497FF] placeholder:text-gray-600 border border-white/10"
                                            placeholder={`[\n  {"label": "Tiếng Việt", "src": "https://pub-xxxx.r2.dev/vi.vtt", "default": true},\n  {"label": "English", "src": "https://pub-xxxx.r2.dev/en.vtt"}\n]`}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-4 pt-6 border-t border-white/10">
                            <Link href="/admin/movies" className="px-5 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-medium transition">
                                Hủy bỏ
                            </Link>
                            <button type="submit" disabled={isPending} className="bg-[#D497FF] hover:bg-[#D497FF]/90 text-black px-6 py-2.5 rounded-lg font-bold transition flex items-center gap-2">
                                {isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-save"></i>}
                                Lưu Phim Độc Quyền
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
