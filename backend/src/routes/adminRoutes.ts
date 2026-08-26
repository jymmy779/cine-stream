import { Router } from "express";
import {
  importMovie,
  triggerInstantSync,
  getSyncFullStatus,
  toggleCronJob,
  startBulkSync,
  pauseBulkSyncHandler,
  mergeMoviesHandler,
  getSyncLogs,
  getSystemStats,
  getPendingImagesForSync,
  searchMoviesForRefresh,
  refreshSelectedMoviesHandler,
} from "../controllers/adminController.js";
import { clearApiMemoryCache } from "../controllers/movieController.js";

const router = Router();

router.get("/stats", getSystemStats);
router.post("/movies/import", importMovie);
router.post("/movies/merge", mergeMoviesHandler);
router.get("/movies/refresh/search", searchMoviesForRefresh);
router.post("/movies/refresh", refreshSelectedMoviesHandler);

router.get("/sync/images-queue", getPendingImagesForSync);
router.post("/sync/instant", triggerInstantSync);
router.get("/sync/status", getSyncFullStatus);
router.post("/sync/cron/toggle", toggleCronJob);
router.post("/sync/bulk/start", startBulkSync);
router.post("/sync/bulk/pause", pauseBulkSyncHandler);
router.get("/sync/logs", getSyncLogs);
router.post("/cache/clear", (req, res) => {
  clearApiMemoryCache();
  res.json({ status: true, message: "Cache cleared" });
});

export default router;
