import { Router } from "express";
import {
  forgotPasswordCtrl,
  loginCtrl,
  logoutCtrl,
  meCtrl,
  refreshCtrl,
  resendVerificationCtrl,
  resetPasswordCtrl,
  signUpCtrl,
  verifyEmailCtrl,
} from "../controllers/authController.js";
import { authMiddleware } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signUpSchema,
} from "../schema/userSchema.js";

const authRoutes: Router = Router();

authRoutes.post("/signup", validate(signUpSchema), signUpCtrl);
authRoutes.post("/login", validate(loginSchema), loginCtrl);
authRoutes.get("/verify-email", verifyEmailCtrl);
authRoutes.post(
  "/resend-verification",
  validate(resendVerificationSchema),
  resendVerificationCtrl,
);
authRoutes.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  forgotPasswordCtrl,
);
authRoutes.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPasswordCtrl,
);
authRoutes.post("/refresh", refreshCtrl);
authRoutes.post("/logout", logoutCtrl);
authRoutes.get("/me", authMiddleware, meCtrl);

export default authRoutes;
