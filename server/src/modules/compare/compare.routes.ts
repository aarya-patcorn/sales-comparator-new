import { Router } from "express";

import { requireRm } from "../../middleware/auth.js";
import { postCompare } from "./compare.controller.js";

/** Mounted at /api/compare (blueprint §7). */
export const compareRouter: Router = Router();

compareRouter.post("/", requireRm, postCompare);
