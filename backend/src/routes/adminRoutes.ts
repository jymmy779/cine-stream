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
} from "../controllers/adminController.js";

const router = Router();

router.post("/movies/import", importMovie);
router.post("/movies/merge", mergeMoviesHandler);

router.post("/sync/instant", triggerInstantSync);
router.get("/sync/status", getSyncFullStatus);
router.post("/sync/cron/toggle", toggleCronJob);
router.post("/sync/bulk/start", startBulkSync);
router.post("/sync/bulk/pause", pauseBulkSyncHandler);
router.get("/sync/logs", getSyncLogs);

export default router;
