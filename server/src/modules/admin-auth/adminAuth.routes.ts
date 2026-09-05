import { Router } from "express";

import { requireAdmin } from "../../middleware/auth.js";
import { googleLogin, logout, me } from "./adminAuth.controller.js";

/** Mounted at /api/admin/auth (blueprint §7). */
export const adminAuthRouter: Router = Router();

adminAuthRouter.post("/google", googleLogin);
adminAuthRouter.post("/logout", logout);
adminAuthRouter.get("/me", requireAdmin, me);
