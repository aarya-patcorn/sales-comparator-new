import { Router } from "express";

import { requireAdmin } from "../../middleware/auth.js";
import { singleFileUpload } from "../../middleware/upload.js";
import { postExtract } from "./tdsExtract.controller.js";

/** Mounted at /api/admin/tds (blueprint §7). */
export const tdsExtractRouter: Router = Router();

tdsExtractRouter.post(
  "/extract",
  requireAdmin,
  singleFileUpload(),
  postExtract,
);
