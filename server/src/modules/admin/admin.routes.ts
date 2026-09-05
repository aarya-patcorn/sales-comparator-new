import { Router } from "express";

import { requireAdmin } from "../../middleware/auth.js";
import { singleFileUpload } from "../../middleware/upload.js";
import { postCompetitorProduct } from "./competitorProducts.controller.js";
import {
  createCompetitor,
  deleteCompetitor,
  deleteCompetitorProduct,
  getCompetitorProduct,
  listCompetitorProducts,
  listCompetitors,
  setCompetitorProductStatus,
  setCompetitorStatus,
  updateCompetitor,
  updateCompetitorProduct,
} from "./competitors.controller.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  setProductStatus,
  updateProduct,
} from "./products.controller.js";
import {
  createAdminUser,
  createRmUser,
  deleteRmUser,
  getDashboard,
  listAdminUsers,
  listRmUsers,
  setAdminUserStatus,
  setRmUserStatus,
  updateRmUser,
} from "./users.controller.js";

/**
 * Mounted at /api/admin (blueprint §7/§8).
 * `/api/admin/auth/*` and `/api/admin/tds/*` are mounted separately in app.ts.
 */
export const adminRouter: Router = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/dashboard", getDashboard);

// RM users
adminRouter.get("/users", listRmUsers);
adminRouter.post("/users", createRmUser);
adminRouter.put("/users/:id", updateRmUser);
adminRouter.patch("/users/:id/status", setRmUserStatus);
adminRouter.delete("/users/:id", deleteRmUser);

// Administrator allow-list
adminRouter.get("/admins", listAdminUsers);
adminRouter.post("/admins", createAdminUser);
adminRouter.patch("/admins/:id/status", setAdminUserStatus);

// Kamdhenu products
adminRouter.get("/products", listProducts);
adminRouter.post("/products", createProduct);
adminRouter.get("/products/:id", getProduct);
adminRouter.put("/products/:id", updateProduct);
adminRouter.patch("/products/:id/status", setProductStatus);
adminRouter.delete("/products/:id", deleteProduct);

// Competitors
adminRouter.get("/competitors", listCompetitors);
adminRouter.post("/competitors", createCompetitor);
adminRouter.put("/competitors/:id", updateCompetitor);
adminRouter.patch("/competitors/:id/status", setCompetitorStatus);
adminRouter.delete("/competitors/:id", deleteCompetitor);

// Competitor products (create supports a TDS upload, blueprint §3a)
adminRouter.get("/competitor-products", listCompetitorProducts);
adminRouter.post("/competitor-products", singleFileUpload(), postCompetitorProduct);
adminRouter.get("/competitor-products/:id", getCompetitorProduct);
adminRouter.put("/competitor-products/:id", updateCompetitorProduct);
adminRouter.patch("/competitor-products/:id/status", setCompetitorProductStatus);
adminRouter.delete("/competitor-products/:id", deleteCompetitorProduct);
