import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import {
  capturePayPalPaymentCtrl,
  retryPayPalPaymentCtrl,
} from "../controllers/paymentsController.js";

const paymentsRoutes: Router = Router();

paymentsRoutes.use(authMiddleware);

paymentsRoutes.post("/paypal/:id/capture", capturePayPalPaymentCtrl);
paymentsRoutes.post("/paypal/:id/retry", retryPayPalPaymentCtrl);

export default paymentsRoutes;
