#!/usr/bin/env node
/**
 * sync-images.mjs – Tải ảnh phim & diễn viên về Cloudflare R2 (JPG → WebP)
 *
 * Cách dùng:
 *   node scripts/sync-images.mjs                                    # Sync toàn bộ (phim + diễn viên)
 *   node scripts/sync-images.mjs --new-only                         # Chỉ upload ảnh chưa có trên R2
 *   node scripts/sync-images.mjs --movies-only                      # Chỉ sync ảnh phim
 *   node scripts/sync-images.mjs --actors-only                      # Chỉ sync ảnh diễn viên
 *   node scripts/sync-images.mjs --max-pages=15                     # Giới hạn 15 trang mỗi nguồn
 *   node scripts/sync-images.mjs --start-page=1 --max-pages=15      # Quét theo khoảng trang
 *   node scripts/sync-images.mjs --resume                           # Tiếp tục từ checkpoint (per-source)
 *   node scripts/sync-images.mjs --retry-failed                     # Retry ảnh bị lỗi từ lần trước
 *   node scripts/sync-images.mjs --page-concurrency=10              # Fetch 10 trang/lượt mỗi nguồn (default: 5)
 *   node scripts/sync-images.mjs --public-api-only                  # Bỏ qua SQLite/Backend, test 3 API công cộng
 *   node scripts/sync-images.mjs --source=database                  # Bắt buộc lấy danh sách từ SQLite
 *   node scripts/sync-images.mjs --source=public-apis               # Bắt buộc lấy danh sách từ 3 API công cộng
 *   node scripts/sync-images.mjs --export-queue=/tmp/movies.json    # Chỉ xuất queue JSON, không xử lý ảnh/R2
 *   node scripts/sync-images.mjs --input-file=movies.json           # Xử lý queue JSON đã xuất
 *   node scripts/sync-images.mjs --input-file=movies.json --image-source=kkphim # Chỉ xử lý phân vùng KKPhim
 *   node scripts/sync-images.mjs --input-file=movies.json --shard=0 --shard-count=3 # Xử lý 1/3 queue DB
 *   node scripts/sync-images.mjs --input-file=movies.json --dry-run # Kiểm tra queue, không gọi R2
 *
 * Full sync ~56k phim (3 nguồn, nhanh nhất):
 *   node scripts/sync-images.mjs --new-only --movies-only --page-concurrency=10
 *
 * Resume nếu bị ngắt giữa chừng:
 *   node scripts/sync-images.mjs --new-only --movies-only --page-concurrency=10 --resume
 *
 * Yêu cầu env vars (copy từ .env.local):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *   NEXT_PUBLIC_R2_PUBLIC_URL
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Load .env.local ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const rawArgs = process.argv.slice(2);
const queueExportRequested = rawArgs.some(a => a.startsWith('--export-queue='));
const dryRunRequested = rawArgs.includes('--dry-run');

try {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
    }
} catch {
    console.warn('[ENV] Không tìm thấy .env.local, dùng env hiện tại');
}

// ─── Config ────────────────────────────────────────────────────────────────────
const R2_ACCOUNT_ID      = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME     = process.env.R2_BUCKET_NAME || 'lofilm';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!queueExportRequested && !dryRunRequested && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)) {
    console.error('[ERROR] Thiếu R2 credentials. Kiểm tra .env.local');
    process.exit(1);
}

// ─── Khởi tạo Supabase ─────────────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.warn('[WARN] Thiếu cấu hình Supabase. Bỏ qua tính năng cào phim độc quyền.');
}

// ─── Parse CLI args ────────────────────────────────────────────────────────────
const args = rawArgs;
const moviesOnly        = args.includes('--movies-only');
const actorsOnly        = args.includes('--actors-only');
const newOnly           = args.includes('--new-only');
const retryFailed       = args.includes('--retry-failed');
const resumeMode        = args.includes('--resume');
const dryRun            = args.includes('--dry-run');

const sourceArg         = args.find(a => a.startsWith('--source='));
const sourceMode        = sourceArg ? sourceArg.split('=')[1] : 'auto';
if (!['auto', 'database', 'public-apis'].includes(sourceMode)) {
    console.error(`[ERROR] --source không hợp lệ: ${sourceMode}. Dùng auto, database hoặc public-apis.`);
    process.exit(1);
}

const inputFileArg      = args.find(a => a.startsWith('--input-file='));
const inputFilePath     = inputFileArg ? resolve(process.cwd(), inputFileArg.slice('--input-file='.length)) : null;
const exportQueueArg    = args.find(a => a.startsWith('--export-queue='));
const exportQueuePath   = exportQueueArg ? resolve(process.cwd(), exportQueueArg.slice('--export-queue='.length)) : null;
const publicApiOnly     = args.includes('--public-api-only') || sourceMode === 'public-apis';
const databaseOnly      = sourceMode === 'database';

const limitArg          = args.find(a => a.startsWith('--limit='));
const pageArg           = args.find(a => a.startsWith('--page='));
const maxPagesArg       = args.find(a => a.startsWith('--max-pages='));
const startPageArg      = args.find(a => a.startsWith('--start-page='));
const pageConcurrencyArg = args.find(a => a.startsWith('--page-concurrency='));
const imageSourceArg     = args.find(a => a.startsWith('--image-source='));
const imageSource        = imageSourceArg ? imageSourceArg.split('=')[1].toLowerCase() : null;
if (imageSource && !['kkphim', 'vsmov', 'nguonc'].includes(imageSource)) {
    console.error(`[ERROR] --image-source không hợp lệ: ${imageSource}. Dùng kkphim, vsmov hoặc nguonc.`);
    process.exit(1);
}
const shardArg           = args.find(a => a.startsWith('--shard='));
const shardCountArg      = args.find(a => a.startsWith('--shard-count='));
const shardIndex         = shardArg ? Number(shardArg.split('=')[1]) : null;
const shardCount         = shardCountArg ? Number(shardCountArg.split('=')[1]) : null;
if ((shardIndex !== null || shardCount !== null) && (
    !Number.isInteger(shardIndex) || !Number.isInteger(shardCount) ||
    shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount
)) {
    console.error('[ERROR] --shard và --shard-count không hợp lệ. Yêu cầu: 0 <= shard < shard-count.');
    process.exit(1);
}

// File Checkpoint & Failed Logs
const STATE_FILE  = resolve(__dirname, 'sync-state.json');
const FAILED_FILE = resolve(__dirname, 'failed-images.json');

// Đọc checkpoint cũ nếu có cờ --resume (hỗ trợ per-source resume)
let savedState = { lastPage: 1, sources: {} };
if (resumeMode && existsSync(STATE_FILE)) {
    try {
        savedState = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        if (!savedState.sources) savedState.sources = {};
        console.log('[Checkpoint] Khôi phục tiến trình:');
        for (const [src, pg] of Object.entries(savedState.sources)) {
            console.log(`  - ${src}: tiếp tục từ trang ${pg}`);
        }
    } catch {}
}

const LIMIT             = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
const SINGLE_PAGE       = pageArg ? parseInt(pageArg.split('=')[1]) : null;
const START_PAGE        = startPageArg ? parseInt(startPageArg.split('=')[1]) : (resumeMode ? (savedState.lastPage || 1) : (SINGLE_PAGE || 1));
const MAX_PAGES_LIMIT   = maxPagesArg ? parseInt(maxPagesArg.split('=')[1]) : (SINGLE_PAGE ? SINGLE_PAGE : 9999);
// Số trang fetch song song trong 1 nguồn (tăng để tăng tốc full sync, mặc định 5)
const PAGE_CONCURRENCY  = pageConcurrencyArg ? parseInt(pageConcurrencyArg.split('=')[1]) : 5;

// ─── TMDB keys (round-robin để tránh rate limit) ───────────────────────────────
const TMDB_KEYS = [
    'fb7bb23f03b6994dafc674c074d01761',
    'e55425032d3d0f371fc776f302e7c09b',
    '8301a21598f8b45668d5711a814f01f6',
    '8cf43ad9c085135b9479ad5cf6bbcbda',
    'da63548086e399ffc910fbc08526df05',
    '13e53ff644a8bd4ba37b3e1044ad24f3',
    '269890f657dddf4635473cf4cf456576',
    'a2f888b27315e62e471b2d587048f32e',
];
let tmdbKeyIndex = 0;
const getTmdbKey = () => TMDB_KEYS[tmdbKeyIndex++ % TMDB_KEYS.length];

// ─── R2 Client ─────────────────────────────────────────────────────────────────
const s3 = queueExportRequested || dryRunRequested
    ? null
    : new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Kiểm tra file đã có trên R2 chưa */
async function existsOnR2(key) {
    if (!s3) throw new Error('R2 client chưa được khởi tạo');
    try {
        const res = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
        // Đảm bảo file tồn tại VÀ kích thước > 1KB (nếu 0-byte hoặc bị lỗi sẽ tự động tải lại)
        return (res.ContentLength || 0) > 1024;
    } catch {
        return false;
    }
}

/** Download ảnh từ URL, trả về Buffer */
function buildWsrvUrl(url) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp`;
}

async function fetchImageBuffer(url, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        });
        if (!res.ok) {
            if (res.status === 429) {
                await sleep(3000);
            }
            throw new Error(`HTTP ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (!isValidImageBuffer(buffer)) {
            throw new Error('Response is not a valid image');
        }
        return buffer;
    } finally {
        clearTimeout(timer);
    }
}

// Try the source first. If its WAF blocks the GitHub runner, let wsrv.nl fetch it.
async function downloadImage(url, timeout = 15000) {
    try {
        return await fetchImageBuffer(url, timeout);
    } catch (directError) {
        if (url.startsWith('https://wsrv.nl/') || url.startsWith('http://wsrv.nl/')) {
            throw directError;
        }

        try {
            return await fetchImageBuffer(buildWsrvUrl(url), Math.max(timeout, 30000));
        } catch (proxyError) {
            throw new Error(`Direct: ${directError.message}; wsrv.nl: ${proxyError.message}`);
        }
    }
}

/** Kiểm tra buffer có phải là dữ liệu ảnh hợp lệ không (tránh parse file HTML lỗi 404/500/Cloudflare) */
function isValidImageBuffer(buf) {
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 64) return false;
    const prefix = buf.subarray(0, 40).toString('utf8').trim().toLowerCase();
    if (prefix.startsWith('<!doctype') || prefix.startsWith('<html') || prefix.startsWith('<?xml') || prefix.startsWith('<svg') || prefix.startsWith('<script') || prefix.startsWith('{"')) {
        return false;
    }
    return true;
}

async function selectCorrectlyOrientedBuffer(buffer, expectedOrientation, alternateUrl) {
    const metadata = await sharp(buffer, { failOnError: false }).metadata();
    const isExpected = expectedOrientation === 'portrait'
        ? metadata.height >= metadata.width
        : metadata.width >= metadata.height;

    if (isExpected || !alternateUrl) return buffer;

    try {
        const alternateBuffer = await downloadImage(alternateUrl);
        const alternateMetadata = await sharp(alternateBuffer, { failOnError: false }).metadata();
        const alternateIsExpected = expectedOrientation === 'portrait'
            ? alternateMetadata.height >= alternateMetadata.width
            : alternateMetadata.width >= alternateMetadata.height;

        return alternateIsExpected ? alternateBuffer : buffer;
    } catch {
        return buffer;
    }
}

/** Convert buffer → WebP rồi upload lên R2 */
async function convertAndUpload(srcBuffer, r2Key, width, quality = 80) {
    if (!s3) throw new Error('R2 client chưa được khởi tạo');
    if (!isValidImageBuffer(srcBuffer)) {
        throw new Error('Dữ liệu tải về không phải là file ảnh (HTML/Corrupt content)');
    }

    const webpBuffer = await sharp(srcBuffer, { failOnError: false })
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, effort: 5, smartSubsample: true })
        .toBuffer();

    await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: webpBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable', // cache 1 năm
    }));

    return webpBuffer.length;
}

/** Normalize URL ảnh từ phimapi / nguonc / ophim / netflix / tmdb (relative → absolute) */
function normalizeImgUrl(url) {
    if (!url) return null;
    let t = url.trim();
    if (!t || t === "null" || t === "undefined" || t === "N/A" || t === "none") return null;

    if (t.startsWith("//")) {
        t = `https:${t}`;
    }

    if (t.includes("phimimg.com/https://phimimg.com/")) {
        t = t.replace(/https:\/\/phimimg\.com\/https:\/\/phimimg\.com\//g, "https://phimimg.com/");
    }
    if (t.includes("phimimg.com/public/images/")) {
        t = t.replace("phimimg.com/public/images/", "phim.nguonc.com/public/images/");
    }

    if (!t.startsWith("http://") && !t.startsWith("https://")) {
        if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+\//.test(t)) {
            t = `https://${t}`;
        }
    }

    if (t.startsWith("http://") || t.startsWith("https://")) {
        return t;
    }

    const ophimIdx = t.indexOf("ophim");
    if (ophimIdx !== -1 && !t.includes(".")) {
        return `https://img.ophim.live/${t.slice(ophimIdx)}`;
    }

    const dnmIdx = t.indexOf("dnm/");
    if (dnmIdx !== -1) {
        return `https://occ-0-8407-116.1.nflxso.net/${t.slice(dnmIdx)}`;
    }

    const tmdbIdx = t.indexOf("t/p/");
    if (tmdbIdx !== -1) {
        return `https://image.tmdb.org/${t.slice(tmdbIdx)}`;
    }

    const publicIdx = t.indexOf("public/images/");
    if (publicIdx !== -1) {
        return `https://phim.nguonc.com/${t.slice(publicIdx)}`;
    }

    const uploadsIdx = t.indexOf("uploads/");
    if (uploadsIdx !== -1) {
        return `https://phimimg.com/${t.slice(uploadsIdx)}`;
    }

    const uploadIdx = t.indexOf("upload/");
    if (uploadIdx !== -1) {
        return `https://phimimg.com/${t.slice(uploadIdx)}`;
    }

    return `https://phimimg.com/${t.replace(/^\//, '')}`;
}

/** Retry wrapper */
async function withRetry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (err.message && err.message.includes('không phải là file ảnh')) {
                throw err; // Không cần retry nếu server trả HTML
            }
            if (i === retries - 1) throw err;
            await sleep(delay * (i + 1));
        }
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Stats & Log List ─────────────────────────────────────────────────────────
const stats = {
    movies:  { total: 0, uploaded: 0, skipped: 0, failed: 0 },
    actors:  { total: 0, uploaded: 0, skipped: 0, failed: 0 },
};
let syncStartTime = Date.now();

const failedItems = [];

function saveFailedLog(item) {
    failedItems.push(item);
    try {
        writeFileSync(FAILED_FILE, JSON.stringify(failedItems, null, 2));
    } catch {}
}

function saveCheckpoint(page, sourceProgress = {}) {
    try {
        const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
        const merged = {
            ...state,
            lastPage: page,
            sources: { ...(state.sources || {}), ...sourceProgress },
            updatedAt: new Date().toISOString(),
        };
        writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
    } catch {}
}

/** Ước tính thời gian còn lại dựa trên tốc độ hiện tại */
function etaString(done, total) {
    if (done <= 0) return '...';
    const elapsed = (Date.now() - syncStartTime) / 1000;
    const rate = done / elapsed; // items/s
    const remaining = (total - done) / rate;
    if (remaining < 60) return `${Math.round(remaining)}s`;
    if (remaining < 3600) return `${Math.round(remaining / 60)}m`;
    return `${(remaining / 3600).toFixed(1)}h`;
}

// ─── Process 1 phim: poster + thumb ───────────────────────────────────────────
async function processMovieImages(movie, idx, total) {
    try {
        if (!movie || !movie.slug) return;
        const slug = String(movie.slug);
        const sourceMovie = await fetchSourceMovieImages(movie);
        const { poster_url, thumb_url } = sourceMovie;

        const posterKey = `images/movies/${slug}-poster.webp`;
        const thumbKey  = `images/movies/${slug}-thumb.webp`;

        let posterDone = false, thumbDone = false;

        // --- POSTER ---
        try {
            if (newOnly && await existsOnR2(posterKey)) {
                posterDone = true;
                stats.movies.skipped++;
            } else {
                const url = normalizeImgUrl(poster_url);
                if (url) {
                    await withRetry(async () => {
                        const downloaded = await downloadImage(url);
                        const buf = await selectCorrectlyOrientedBuffer(
                            downloaded,
                            'portrait',
                            normalizeImgUrl(thumb_url),
                        );
                        await convertAndUpload(buf, posterKey, 400, 80);
                        stats.movies.uploaded++;
                        posterDone = true;
                    });
                }
            }
        } catch (err) {
            stats.movies.failed++;
            saveFailedLog({ type: 'poster', slug, url: poster_url, key: posterKey, error: err.message });
            console.error(`  ✗ poster [${slug}]: ${err.message}`);
        }

        // --- THUMB ---
        try {
            if (newOnly && await existsOnR2(thumbKey)) {
                thumbDone = true;
                stats.movies.skipped++;
            } else {
                const url = normalizeImgUrl(thumb_url || poster_url);
                if (url) {
                    await withRetry(async () => {
                        const downloaded = await downloadImage(url);
                        const buf = await selectCorrectlyOrientedBuffer(
                            downloaded,
                            'landscape',
                            normalizeImgUrl(poster_url),
                        );
                        await convertAndUpload(buf, thumbKey, 1920, 84);
                        stats.movies.uploaded++;
                        thumbDone = true;
                    });
                }
            }
        } catch (err) {
            stats.movies.failed++;
            saveFailedLog({ type: 'thumb', slug, url: thumb_url || poster_url, key: thumbKey, error: err.message });
            console.error(`  ✗ thumb  [${slug}]: ${err.message}`);
        }

        const pct = Math.round((idx / total) * 100);
        const pIcon = posterDone ? '✓' : '✗';
        const tIcon = thumbDone  ? '✓' : '✗';
        const displaySlug = slug ? slug.slice(0, 28).padEnd(28) : 'unknown';
        const eta = etaString(stats.movies.uploaded + stats.movies.skipped, total * 2);
        process.stdout.write(`\r[${idx}/${total}] ${pct}% | ↑${stats.movies.uploaded} skip${stats.movies.skipped} ✗${stats.movies.failed} | ETA:${eta} | ${displaySlug}`);
    } catch (outerErr) {
        stats.movies.failed++;
        console.error(`\n  ✗ Bỏ qua phim lỗi không xác định [${movie?.slug || idx}]:`, outerErr.message);
    }
}

/**
 * Lấy ảnh detail bằng slug riêng của nguồn nhưng vẫn upload theo slug chuẩn của DB.
 * NguonC dùng URL trong queue DB vì API detail chặn IP GitHub Actions; bộ kiểm tra
 * kích thước ở processMovieImages sẽ tự chọn đúng ảnh dọc/ngang dù hai field bị đảo.
 */
async function fetchSourceMovieImages(movie) {
    if (!imageSource) return movie;

    const sourceSlug = movie.source_slug || movie.source_slugs?.[imageSource];
    if (!sourceSlug) throw new Error(`Phim ${movie.slug} không có source_slug cho ${imageSource}`);
    if (imageSource === 'nguonc') return movie;

    const configs = {
        kkphim: {
            url: `https://phimapi.com/v1/api/phim/${encodeURIComponent(sourceSlug)}`,
            read: data => data?.movie || data?.data?.item || data?.item,
            reverse: false,
        },
        vsmov: {
            url: `https://vsmov.com/api/phim/${encodeURIComponent(sourceSlug)}`,
            read: data => data?.movie || data?.data?.movie || data?.data?.item,
            reverse: true,
        },
    };
    const config = configs[imageSource];
    const response = await withRetry(async () => {
        const res = await fetch(config.url, {
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }, 3, 1000);

    const detail = config.read(response);
    if (!detail) throw new Error(`${imageSource} không trả dữ liệu detail cho ${sourceSlug}`);
    const rawPoster = typeof detail.poster_url === 'string' ? detail.poster_url.trim() : '';
    const rawThumb = typeof detail.thumb_url === 'string' ? detail.thumb_url.trim() : '';

    return {
        ...movie,
        poster_url: config.reverse ? (rawThumb || rawPoster) : (rawPoster || rawThumb),
        thumb_url: config.reverse ? (rawPoster || rawThumb) : (rawThumb || rawPoster),
    };
}

// ─── Process ảnh diễn viên cho 1 phim ─────────────────────────────────────────
const processedActors = new Set(); // tránh upload cùng 1 người nhiều lần

async function processActorImages(movie) {
    // API list chỉ trả thông tin cơ bản, cần fetch detail để lấy tmdb.id
    let tmdb = movie.tmdb;
    if (!tmdb?.id && movie.slug) {
        try {
            const res = await fetch(`https://phimapi.com/phim/${movie.slug}`, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                tmdb = data?.movie?.tmdb;
            }
        } catch {
            return; // Không lấy được detail → bỏ qua
        }
        await sleep(200); // tránh spam phimapi
    }

    if (!tmdb?.id) return;

    const tmdbType = tmdb.type === 'movie' ? 'movie' : 'tv';
    const apiKey = getTmdbKey();

    let cast = [];
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/${tmdbType}/${tmdb.id}/credits?api_key=${apiKey}&language=vi-VN`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
            const data = await res.json();
            cast = (data.cast || []).filter(a => a.profile_path);
        }
    } catch {
        // Bỏ qua nếu credits lỗi
    }

    // --- Sync Movie ClearLogo sang R2 (images/logos/{slug}.webp) ---
    const logoKey = `images/logos/${movie.slug}.webp`;
    try {
        if (!(newOnly && await existsOnR2(logoKey))) {
            const logoRes = await fetch(
                `https://api.themoviedb.org/3/${tmdbType}/${tmdb.id}/images?api_key=${apiKey}&include_image_language=vi,en,null`,
                { signal: AbortSignal.timeout(8000) }
            );
            if (logoRes.ok) {
                const logoData = await logoRes.json();
                const logos = logoData.logos || [];
                if (logos.length > 0) {
                    const viLogo = logos.find(l => l.iso_639_1 === 'vi');
                    const enLogo = logos.find(l => l.iso_639_1 === 'en');
                    const chosen = viLogo || enLogo || logos[0];
                    if (chosen?.file_path) {
                        const imgUrl = `https://image.tmdb.org/t/p/w500${chosen.file_path}`;
                        await withRetry(async () => {
                            const buf = await downloadImage(imgUrl);
                            await convertAndUpload(buf, logoKey, 600, 90);
                        });
                    }
                }
            }
        }
    } catch {
        // Logo là tùy chọn
    }

    for (const actor of cast) {
        const actorKey = `images/actors/${actor.id}.webp`;
        if (processedActors.has(actor.id)) continue;
        processedActors.add(actor.id);
        stats.actors.total++;

        try {
            if (newOnly && await existsOnR2(actorKey)) {
                stats.actors.skipped++;
                continue;
            }
            const imgUrl = `https://image.tmdb.org/t/p/w185${actor.profile_path}`;
            await withRetry(async () => {
                const buf = await downloadImage(imgUrl);
                await convertAndUpload(buf, actorKey, 200, 80);
                stats.actors.uploaded++;
            });
        } catch (err) {
            stats.actors.failed++;
            const imgUrl = `https://image.tmdb.org/t/p/w185${actor.profile_path}`;
            saveFailedLog({ type: 'actor', actorId: actor.id, url: imgUrl, key: actorKey, error: err.message });
        }
    }
}

// ─── Fetch danh sách phim từ Database SQLite hoặc API ───────────────────────
async function fetchAllMovies() {
    if (inputFilePath) {
        if (!existsSync(inputFilePath)) {
            throw new Error(`Không tìm thấy queue input: ${inputFilePath}`);
        }

        const parsed = JSON.parse(readFileSync(inputFilePath, 'utf8'));
        const inputItems = Array.isArray(parsed) ? parsed : parsed?.items;
        if (!Array.isArray(inputItems)) {
            throw new Error('Queue input không hợp lệ: cần JSON array hoặc object có trường items.');
        }

        const validItems = inputItems.filter(item => item && typeof item.slug === 'string' && item.slug.trim());
        const sourceItems = imageSource
            ? validItems.filter(item => item.image_source === imageSource && (item.source_slug || item.source_slugs?.[imageSource]))
            : validItems;
        const shardedItems = shardIndex === null
            ? sourceItems
            : sourceItems.filter((_, index) => index % shardCount === shardIndex);
        const limitedItems = LIMIT === Infinity ? shardedItems : shardedItems.slice(0, LIMIT);
        const shardLabel = shardIndex === null ? '' : ` thuộc shard ${shardIndex + 1}/${shardCount}`;
        console.log(`📦 [Queue Input] Đã tải ${limitedItems.length}/${shardedItems.length} phim${imageSource ? ` thuộc ${imageSource}` : ''}${shardLabel} từ ${inputFilePath}`);
        return limitedItems;
    }

    // 1. ƯU TIÊN: Đọc trực tiếp từ SQLite Database (Chứa đầy đủ 55.000+ phim của cả 3 nguồn: KKPhim, Ophim, NguonC)
    if (publicApiOnly) {
        console.log('[Nguồn dữ liệu] --public-api-only: bỏ qua SQLite và Backend API.');
    }

    try {
        let PrismaClient;
        try {
            PrismaClient = (await import('../../backend/node_modules/@prisma/client/index.js')).PrismaClient;
        } catch {
            try {
                PrismaClient = (await import('../backend/node_modules/@prisma/client/index.js')).PrismaClient;
            } catch {
                try {
                    PrismaClient = (await import('@prisma/client')).PrismaClient;
                } catch {}
            }
        }

        if (PrismaClient && !publicApiOnly) {
            console.log('⚡ [Database] Kết nối SQLite Database thành công!');
            const prisma = new PrismaClient();
            const totalInDb = await prisma.movie.count();
            console.log(`⚡ [Database] Đang tải ${totalInDb} phim từ Database (KKPhim + Ophim + NguonC)...`);

            const dbMovies = await prisma.movie.findMany({
                select: {
                    slug: true,
                    name: true,
                    poster_url: true,
                    thumb_url: true,
                    tmdb_id: true,
                    tmdb_type: true,
                    episodes: {
                        select: { server_name: true, source_slug: true },
                    },
                },
                take: LIMIT === Infinity ? undefined : LIMIT,
                orderBy: { updated_at: 'desc' }
            });

            await prisma.$disconnect();
            console.log(`✅ [Database] Đã tải thành công ${dbMovies.length} phim từ Database.`);

            return dbMovies.map(m => {
                const sourceSlugs = {};
                for (const server of m.episodes) {
                    if (!server.source_slug) continue;
                    if (/\sKK$/i.test(server.server_name)) sourceSlugs.kkphim ||= server.source_slug;
                    if (/\sVS$/i.test(server.server_name)) sourceSlugs.vsmov ||= server.source_slug;
                    if (/\sNC$/i.test(server.server_name)) sourceSlugs.nguonc ||= server.source_slug;
                }

                // Phân vùng loại trừ nhau để ba runner không ghi đồng thời cùng R2 key.
                const selectedSource = sourceSlugs.kkphim
                    ? 'kkphim'
                    : sourceSlugs.vsmov
                        ? 'vsmov'
                        : sourceSlugs.nguonc
                            ? 'nguonc'
                            : null;

                return {
                    name: m.name,
                    slug: m.slug,
                    poster_url: m.poster_url,
                    thumb_url: m.thumb_url,
                    tmdb: { id: m.tmdb_id || '', type: m.tmdb_type || 'movie' },
                    image_source: selectedSource,
                    source_slug: selectedSource ? sourceSlugs[selectedSource] : null,
                    source_slugs: sourceSlugs,
                };
            });
        }
    } catch (dbErr) {
        console.warn('⚠️ [Database] Không thể đọc trực tiếp từ DB, chuyển sang quét API:', dbErr.message);
        if (databaseOnly) {
            throw new Error(`Không thể xuất queue từ Database: ${dbErr.message}`);
        }
    }

    if (databaseOnly) {
        throw new Error('Không tìm thấy Prisma Client để đọc SQLite Database.');
    }

    // 2. DỰ PHÒNG 1: Fetch từ Backend API riêng (Nếu có cấu hình BACKEND_API_URL)
    const backendApiUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_INTERNAL_API_URL;
    const syncSecret = process.env.SYNC_SECRET_KEY || process.env.ADMIN_PASSWORD || 'admin123';
    const hoursArg = args.find(a => a.startsWith('--hours='));
    const filterHours = hoursArg ? parseInt(hoursArg.split('=')[1]) : (args.includes('--all') ? 0 : 0);
    
    if (!publicApiOnly && backendApiUrl && !backendApiUrl.includes('127.0.0.1') && !backendApiUrl.includes('localhost')) {
        console.log(`🌐 [Backend API] Đang lấy danh sách phim từ máy chủ nội bộ: ${backendApiUrl} (Lọc: ${filterHours > 0 ? `${filterHours} giờ qua` : 'Toàn bộ Database'})...`);
        const allMovies = [];
        let page = START_PAGE;
        const maxPage = MAX_PAGES_LIMIT;

        while (page <= maxPage) {
            try {
                const hoursQuery = filterHours > 0 ? `&hours=${filterHours}` : '';
                const endpoint = `${backendApiUrl.replace(/\/$/, '')}/admin/sync/images-queue?page=${page}&limit=50${hoursQuery}`;
                const res = await fetch(endpoint, {
                    headers: { 'x-sync-secret': syncSecret },
                    signal: AbortSignal.timeout(15000),
                });
                
                if (!res.ok) {
                    console.warn(`  ⚠️ Backend API trả về HTTP ${res.status}, bỏ qua...`);
                    break;
                }

                const json = await res.json();
                const items = json?.data?.items || [];
                if (!items.length) break;

                allMovies.push(...items.map(m => ({
                    name: m.name,
                    slug: m.slug,
                    poster_url: m.poster_url,
                    thumb_url: m.thumb_url,
                    tmdb: { id: m.tmdb_id || '', type: m.tmdb_type || 'movie' }
                })));

                saveCheckpoint(page);
                const totalPages = json?.data?.totalPages || 1;
                console.log(`  [Backend] Trang ${page}/${totalPages}: ${items.length} phim (tổng: ${allMovies.length})`);

                if (page >= totalPages || page >= maxPage) break;
                if (allMovies.length >= LIMIT) break;

                page++;
                await sleep(300);
            } catch (err) {
                console.warn(`  ⚠️ Lỗi fetch Backend API trang ${page}: ${err.message}. Chuyển sang fallback...`);
                break;
            }
        }

        if (allMovies.length > 0) {
            console.log(`✅ [Backend API] Lấy thành công ${allMovies.length} phim từ Database nội bộ.`);
            return allMovies.slice(0, LIMIT === Infinity ? undefined : LIMIT);
        }
    }

    // 3. DỰ PHÒNG 2: Quét song song từ cả 3 nguồn API công cộng
    //    - KKPhim  : phimapi.com
    //    - VSMov   : phimapi.vsmov.pro
    //    - NguonC  : phim.nguonc.com
    const SOURCES = [
        {
            name: 'KKPhim',
            timeoutMs: 30000,
            retries: 3,
            delayMs: 200,
            getUrl: (p) => `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${p}&limit=24`,
            parseItems: (data) => data?.items || data?.data?.items || [],
            parseTotalPages: (data) => data?.pagination?.totalPages || data?.data?.params?.pagination?.totalPage,
            mapMovie: (m) => ({
                name: m.name,
                slug: m.slug,
                poster_url: m.poster_url,
                thumb_url: m.thumb_url,
                tmdb: m.tmdb || { id: '', type: 'movie' },
            }),
        },
        {
            name: 'VSMov',
            timeoutMs: 30000,
            retries: 3,
            delayMs: 200,
            getUrl: (p) => `https://vsmov.com/api/danh-sach/phim-moi-cap-nhat?page=${p}&limit=24`,
            parseItems: (data) => data?.items || data?.data?.items || [],
            parseTotalPages: (data) => data?.pagination?.totalPages || data?.data?.params?.pagination?.totalPage,
            mapMovie: (m) => {
                // VSMov bị ngược: poster_url là ảnh ngang (16:9), thumb_url là ảnh đứng (2:3)
                const rawPoster = (typeof m.poster_url === 'string' ? m.poster_url : m.poster_url?.url || '').trim();
                const rawThumb  = (typeof m.thumb_url  === 'string' ? m.thumb_url  : m.thumb_url?.url  || '').trim();
                return {
                    name: m.name,
                    slug: m.slug,
                    poster_url: rawThumb  || rawPoster,  // ảnh đứng 2:3
                    thumb_url:  rawPoster || rawThumb,   // ảnh ngang 16:9
                    tmdb: m.tmdb || { id: '', type: 'movie' },
                };
            },
        },
        {
            name: 'NguonC',
            // NguonC thường phản hồi chậm hơn hai nguồn còn lại.
            timeoutMs: 60000,
            retries: 5,
            delayMs: 1000,
            getUrl: (p) => `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${p}`,
            // NguonC dùng Cloudflare WAF - cần Referer để không bị 403
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://phim.nguonc.com/',
                'Origin': 'https://phim.nguonc.com',
            },
            parseItems: (data) => data?.items || data?.data?.items || [],
            parseTotalPages: (data) => data?.paginate?.total_page || data?.pagination?.totalPages,
            mapMovie: (m) => {
                // NguonC bị ngược: thumb_url là ảnh đứng (2:3), poster_url là ảnh ngang (16:9)
                const rawThumb  = (typeof m.thumb_url  === 'string' ? m.thumb_url  : m.thumb_url?.url  || '').trim();
                const rawPoster = (typeof m.poster_url === 'string' ? m.poster_url : m.poster_url?.url || '').trim();
                return {
                    name: m.name,
                    slug: m.slug,
                    poster_url: rawThumb  || rawPoster,  // ảnh đứng 2:3
                    thumb_url:  rawPoster || rawThumb,   // ảnh ngang 16:9
                    tmdb: m.tmdb || { id: '', type: 'movie' },
                };
            },
        },
    ];

    console.log(`[API] Fetch song song 3 nguồn (page-concurrency=${PAGE_CONCURRENCY} trang/lượt)...`);

    const API_HEADERS = {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    };

    /** Fetch một trang, retry cả timeout, HTTP lỗi và JSON/schema không hợp lệ. */
    async function fetchSourcePage(source, page) {
        let lastError;

        for (let attempt = 1; attempt <= source.retries; attempt++) {
            try {
                const res = await fetch(source.getUrl(page), {
                    headers: source.headers || API_HEADERS,
                    signal: AbortSignal.timeout(source.timeoutMs),
                });

                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
                }

                const data = await res.json();
                const items = source.parseItems(data);
                if (!Array.isArray(items)) {
                    throw new Error(`response không có mảng items (status=${data?.status ?? 'unknown'})`);
                }

                return { data, items: items.map(source.mapMovie) };
            } catch (err) {
                lastError = err;
                if (attempt < source.retries) {
                    const waitMs = source.delayMs * attempt;
                    console.warn(`  [${source.name}] Trang ${page} lỗi lần ${attempt}/${source.retries}: ${err.message}. Retry sau ${waitMs}ms...`);
                    await sleep(waitMs);
                }
            }
        }

        throw new Error(`trang ${page} thất bại sau ${source.retries} lần: ${lastError?.message || 'unknown error'}`);
    }

    /**
     * Fetch tất cả trang từ 1 nguồn với concurrency cao.
     * Thay vì fetch tuần tự (1 trang → chờ → 1 trang), fetch PAGE_CONCURRENCY trang cùng lúc.
     * Tốc độ tăng ~PAGE_CONCURRENCY lần so với sequential.
     */
    async function fetchFromSource(source) {
        const movies = [];
        // Resume per-source nếu có checkpoint
        let sourceStart = resumeMode && savedState.sources?.[source.name]
            ? savedState.sources[source.name]
            : START_PAGE;

        // Bước 1: Luôn đọc metadata từ trang 1 để không tin checkpoint/tổng trang cũ.
        let metadataPage;
        let actualTotalPages;
        try {
            metadataPage = await fetchSourcePage(source, 1);
            actualTotalPages = Number(source.parseTotalPages(metadataPage.data));
            if (!Number.isInteger(actualTotalPages) || actualTotalPages < 1) {
                throw new Error(`không đọc được tổng số trang từ response: ${JSON.stringify(metadataPage.data).slice(0, 240)}`);
            }
        } catch (err) {
            console.warn(`  [${source.name}] Không lấy được trang đầu: ${err.message}`);
            return movies;
        }

        // Checkpoint lớn hơn tổng trang thường là checkpoint lỗi từ lần quét 9999 cũ.
        if (sourceStart > actualTotalPages) {
            console.warn(`  [${source.name}] Checkpoint ${sourceStart} vượt tổng ${actualTotalPages}, quét lại từ trang 1.`);
            sourceStart = 1;
        }

        const totalPages = Math.min(actualTotalPages, MAX_PAGES_LIMIT);
        if (sourceStart > totalPages) {
            console.log(`  [${source.name}] Không còn trang nào trong phạm vi đã chọn (${sourceStart}-${totalPages}).`);
            return movies;
        }

        try {
            const firstPage = sourceStart === 1
                ? metadataPage
                : await fetchSourcePage(source, sourceStart);
            movies.push(...firstPage.items);
        } catch (err) {
            console.warn(`  [${source.name}] Không lấy được trang bắt đầu ${sourceStart}: ${err.message}`);
            return movies;
        }

        console.log(`  [${source.name}] Tổng: ${totalPages} trang | Bắt đầu từ trang ${sourceStart} | Trang đầu: ${movies.length} phim`);

        // Bước 2: Fetch tất cả trang còn lại với concurrency
        let page = sourceStart + 1;
        while (page <= totalPages && movies.length < LIMIT) {
            // Tạo batch các trang sẽ fetch cùng lúc
            const batch = [];
            for (let i = 0; i < PAGE_CONCURRENCY && page + i <= totalPages; i++) {
                batch.push(page + i);
            }

            const results = await Promise.allSettled(batch.map(p => fetchSourcePage(source, p)));

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value.items.length) {
                    movies.push(...r.value.items);
                }
            }

            const firstFailedIndex = results.findIndex(r => r.status === 'rejected');
            if (firstFailedIndex !== -1) {
                const failedPage = batch[firstFailedIndex];
                const reason = results[firstFailedIndex].reason?.message || 'unknown error';
                saveCheckpoint(failedPage, { [source.name]: failedPage });
                console.warn(`  [${source.name}] Dừng tại trang ${failedPage} để tránh bỏ sót dữ liệu: ${reason}`);
                return movies.slice(0, LIMIT === Infinity ? undefined : LIMIT);
            }

            page += PAGE_CONCURRENCY;
            // Checkpoint per-source mỗi 50 trang
            if (page % 50 < PAGE_CONCURRENCY) {
                saveCheckpoint(page, { [source.name]: page });
                process.stdout.write(`  [${source.name}] Trang ${Math.min(page, totalPages)}/${totalPages} | ${movies.length} phim\n`);
            }

            // Delay nhỏ giữa các batch để tránh rate limit
            await sleep(source.delayMs);
        }

        // Lưu checkpoint hoàn thành cho source này
        saveCheckpoint(totalPages, { [source.name]: totalPages });
        console.log(`  ✅ [${source.name}] Hoàn thành: ${movies.length} phim từ ${totalPages} trang`);
        return movies;
    }

    // Fetch cả 3 nguồn song song nhau
    const [kkResult, vsResult, ncResult] = await Promise.allSettled([
        fetchFromSource(SOURCES[0]),
        fetchFromSource(SOURCES[1]),
        fetchFromSource(SOURCES[2]),
    ]);

    // Merge + dedup theo slug
    const mergedMap = new Map();
    for (const result of [kkResult, vsResult, ncResult]) {
        if (result.status !== 'fulfilled') continue;
        for (const m of result.value) {
            if (!m.slug) continue;
            if (!mergedMap.has(m.slug)) {
                mergedMap.set(m.slug, m);
            } else {
                const existing = mergedMap.get(m.slug);
                if (!existing.poster_url && m.poster_url) existing.poster_url = m.poster_url;
                if (!existing.thumb_url && m.thumb_url) existing.thumb_url = m.thumb_url;
                if (!existing.tmdb?.id && m.tmdb?.id) existing.tmdb = m.tmdb;
            }
        }
    }

    const kkCount = kkResult.status === 'fulfilled' ? kkResult.value.length : 0;
    const vsCount = vsResult.status === 'fulfilled' ? vsResult.value.length : 0;
    const ncCount = ncResult.status === 'fulfilled' ? ncResult.value.length : 0;
    console.log(`\n✅ [Tổng hợp] KKPhim: ${kkCount} | VSMov: ${vsCount} | NguonC: ${ncCount} | Unique (sau dedup): ${mergedMap.size} phim`);

    const allMovies = Array.from(mergedMap.values());
    return allMovies.slice(0, LIMIT === Infinity ? undefined : LIMIT);
}

// ─── Fetch danh sách phim từ Supabase ─────────────────────────────────────────
async function fetchExclusiveMovies() {
    if (!supabase) return [];
    console.log('[supabase] Đang fetch danh sách phim độc quyền...');
    try {
        // Fetch all exclusive movies.
        // We select tmdb_id, slug, poster_url, thumb_url, and name.
        const { data, error } = await supabase
            .from('exclusive_movies')
            .select('slug, name, tmdb_id, poster_url, thumb_url');
        
        if (error) {
            console.error('[ERROR] Supabase fetch failed:', error.message);
            return [];
        }

        if (!data) return [];
        console.log(`  Tìm thấy ${data.length} phim độc quyền.`);
        
        // Map to PhimAPI format
        return data.map(item => ({
            name: item.name,
            slug: item.slug,
            poster_url: item.poster_url,
            thumb_url: item.thumb_url,
            tmdb: { id: item.tmdb_id || '' }
        }));
    } catch (err) {
        console.error('[ERROR] Supabase fetch error:', err.message);
        return [];
    }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  LoFilm Image Sync → Cloudflare R2');
    console.log(`  Mode: ${retryFailed ? 'RETRY FAILED LOGS' : actorsOnly ? 'actors-only' : moviesOnly ? 'movies-only' : 'movies + actors'}`);
    console.log(`  New-only: ${newOnly}`);
    console.log(`  Resume: ${resumeMode}`);
    console.log(`  Public API only: ${publicApiOnly}`);
    console.log(`  Source: ${inputFilePath ? 'queue-file' : sourceMode}`);
    console.log(`  Image source: ${imageSource || 'all'}`);
    console.log(`  Queue shard: ${shardIndex === null ? 'all' : `${shardIndex + 1}/${shardCount}`}`);
    console.log(`  Export queue: ${exportQueuePath || 'false'}`);
    console.log(`  Dry-run: ${dryRun}`);
    console.log(`  Limit: ${LIMIT === Infinity ? 'unlimited' : LIMIT} phim`);
    console.log('═══════════════════════════════════════════════════════\n');

    // KỊCH BẢN CHỈ SYNC LẠI CÁC ẢNH BỊ LỖI
    if (retryFailed) {
        if (!existsSync(FAILED_FILE)) {
            console.log('🎉 Không tìm thấy file failed-images.json (Không có ảnh nào bị lỗi trước đó)!');
            return;
        }
        try {
            const list = JSON.parse(readFileSync(FAILED_FILE, 'utf8'));
            if (!list.length) {
                console.log('🎉 Danh sách ảnh lỗi trống (100% ảnh đã sync thành công)!');
                return;
            }
            console.log(`[Retry Failed] Đang thử tải lại ${list.length} ảnh bị lỗi...`);
            const remainingFailed = [];
            let fixedCount = 0;

            for (const item of list) {
                try {
                    const url = normalizeImgUrl(item.url);
                    if (url) {
                        const buf = await downloadImage(url);
                        await convertAndUpload(
                            buf,
                            item.key,
                            item.type === 'poster' ? 400 : 1920,
                            item.type === 'poster' ? 80 : 84,
                        );
                        fixedCount++;
                        console.log(`  ✅ Fixed: ${item.key}`);
                    }
                } catch (err) {
                    console.error(`  ❌ Failed again: ${item.key}`, err.message);
                    remainingFailed.push(item);
                }
                await sleep(300);
            }
            writeFileSync(FAILED_FILE, JSON.stringify(remainingFailed, null, 2));
            console.log(`\n[Hoàn tất Retry] Đã sửa được: ${fixedCount}/${list.length} ảnh. Còn lại: ${remainingFailed.length} lỗi.`);
            return;
        } catch (err) {
            console.error('Lỗi khi đọc file failed-images.json:', err.message);
            return;
        }
    }

    const exclusiveMovies = inputFilePath ? [] : await fetchExclusiveMovies();
    const phimApiMovies = await fetchAllMovies();
    
    // Merge exclusive movies FIRST so they get prioritized/synced first, then PhimAPI movies.
    // Avoid duplicates by slug if they exist in both.
    const mergedMoviesMap = new Map();
    for (const m of phimApiMovies) {
        mergedMoviesMap.set(m.slug, m);
    }
    for (const m of exclusiveMovies) {
        mergedMoviesMap.set(m.slug, m); // Overwrite with exclusive if duplicate
    }
    const movies = Array.from(mergedMoviesMap.values());

    if (exportQueuePath) {
        const queuePayload = {
            version: 1,
            generated_at: new Date().toISOString(),
            source: sourceMode,
            count: movies.length,
            items: movies,
        };
        writeFileSync(exportQueuePath, JSON.stringify(queuePayload));
        console.log(`\n✅ [Queue Export] Đã ghi ${movies.length} phim vào ${exportQueuePath}`);
        return;
    }

    if (dryRun) {
        console.log(`\n✅ [Dry Run] Queue hợp lệ với ${movies.length} phim. Không gọi R2 hoặc tải ảnh.`);
        console.log(`[Dry Run] Mẫu slug: ${movies.slice(0, 3).map(movie => movie.slug).join(', ') || '(trống)'}`);
        return;
    }

    stats.movies.total = movies.length * 2; // poster + thumb

    syncStartTime = Date.now();
    const BATCH_SIZE = imageSource === 'nguonc' ? 2 : (newOnly ? 20 : 10);
    console.log(`\n[Bắt đầu] ${movies.length} phim | page-concurrency=${PAGE_CONCURRENCY} | batch=${BATCH_SIZE}\n`);

    // NguonC tải ảnh trực tiếp từ CDN nên giữ batch thấp để tránh burst request.
    for (let i = 0; i < movies.length; i += BATCH_SIZE) {
        const batch = movies.slice(i, i + BATCH_SIZE);

        // Sync ảnh phim
        if (!actorsOnly) {
            await Promise.all(
                batch.map((movie, j) => processMovieImages(movie, i + j + 1, movies.length))
            );
        }

        // Sync ảnh diễn viên (sau khi xong phim trong batch, delay để tránh rate limit TMDB)
        if (!moviesOnly) {
            for (const movie of batch) {
                await processActorImages(movie);
                await sleep(250); // ~4 req/s, an toàn với TMDB free
            }
            if (actorsOnly) {
                const currentCount = Math.min(i + BATCH_SIZE, movies.length);
                const pct = Math.round((currentCount / movies.length) * 100);
                console.log(`[Actors] Đã xử lý ${currentCount}/${movies.length} phim (${pct}%) | Upload mới: ${stats.actors.uploaded} | Đã có trên R2: ${stats.actors.skipped}`);
            }
        }

        // Delay giữa các batch
        if (i + BATCH_SIZE < movies.length) {
            await sleep(imageSource === 'nguonc' ? 1000 : 500);
        }
    }

    // ─── Summary ───────────────────────────────────────────────────────────────
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  KẾT QUẢ SYNC');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Ảnh phim:`);
    console.log(`    ✓ Uploaded : ${stats.movies.uploaded}`);
    console.log(`    → Skipped  : ${stats.movies.skipped}`);
    console.log(`    ✗ Failed   : ${stats.movies.failed}`);
    console.log(`  Ảnh diễn viên:`);
    console.log(`    ✓ Uploaded : ${stats.actors.uploaded}`);
    console.log(`    → Skipped  : ${stats.actors.skipped}`);
    console.log(`    ✗ Failed   : ${stats.actors.failed}`);
    console.log('═══════════════════════════════════════════════════════\n');
}

process.on('unhandledRejection', (reason) => {
    console.error('\n[UnhandledRejection Warning]:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('\n[UncaughtException Warning]:', err?.message || err);
});

main().catch(err => {
    console.error('\n[FATAL]', err);
    process.exit(1);
});
