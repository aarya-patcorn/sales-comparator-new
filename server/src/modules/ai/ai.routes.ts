import { Router } from "express";

import { requireRm } from "../../middleware/auth.js";
import { postPitch, postRecommendationText } from "./ai.controller.js";

/** Mounted at /api/pitch (blueprint §7). */
export const pitchRouter: Router = Router();
pitchRouter.post("/", requireRm, postPitch);

/** Mounted at /api/recommendation-text (blueprint §7). */
export const recommendationTextRouter: Router = Router();
recommendationTextRouter.post("/", requireRm, postRecommendationText);
