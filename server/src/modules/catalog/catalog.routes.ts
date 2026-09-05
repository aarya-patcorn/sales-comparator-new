import { Router } from "express";

import { requireRm } from "../../middleware/auth.js";
import {
  getAreas,
  getCompetitors,
  getKamdhenuProducts,
  getSubstrates,
  getTileTypes,
} from "./catalog.controller.js";

/**
 * Mounted at /api/catalog (blueprint §7). Read-only and RM-authenticated:
 * these were public in the old app (defect #4).
 */
export const catalogRouter: Router = Router();

catalogRouter.use(requireRm);

catalogRouter.get("/substrates", getSubstrates);
catalogRouter.get("/tile-types", getTileTypes);
catalogRouter.get("/areas", getAreas);
catalogRouter.get("/kamdhenu", getKamdhenuProducts);
catalogRouter.get("/competitors", getCompetitors);
