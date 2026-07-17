import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createProductSchema,
  updateProductSchema,
} from "../schema/productSchema.js";
import {
  createProductCtrl,
  deleteProductCtrl,
  getProductByIdCtrl,
  listProductsCtrl,
  searchProductsCtrl,
  updateProductCtrl,
} from "../controllers/productsController.js";
import { adminMiddleware } from "../middlewares/admin.js";
import { singleImage } from "../middlewares/photoUpload.js";

const productsRoutes: Router = Router();

productsRoutes
  .route("/")
  .all(authMiddleware, adminMiddleware)
  .post(singleImage("image"), validate(createProductSchema), createProductCtrl)
  .get(listProductsCtrl);

productsRoutes.get("/search", searchProductsCtrl);

productsRoutes.get("/:id", getProductByIdCtrl);

productsRoutes
  .route("/:id")
  .all(authMiddleware, adminMiddleware)
  .put(singleImage("image"), validate(updateProductSchema), updateProductCtrl)
  .delete(deleteProductCtrl);

export default productsRoutes;
