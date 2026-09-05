import { Router } from "express";

import { requireRm } from "../../middleware/auth.js";
import { login, logout, me } from "./auth.controller.js";

/** Mounted at /api/auth (blueprint §7). */
export const authRouter: Router = Router();

authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireRm, me);
