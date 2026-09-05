import { Router } from "express";

import { requireRm } from "../../middleware/auth.js";
import { postRecommend } from "./recommend.controller.js";

/** Mounted at /api/recommend (blueprint §7). */
export const recommendRouter: Router = Router();

recommendRouter.post("/", requireRm, postRecommend);
