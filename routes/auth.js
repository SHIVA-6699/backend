import express from "express";
import { check, validationResult } from "express-validator";
import {
  signup,
  generateOTPController,
  verifyOTPController,
  login,
  refreshToken,
  logout
} from "../controllers/auth.js";

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Custom phone number validator
const isValidPhoneNumber = (value) => {
  // Must start with '+' followed by 10-15 digits, no spaces or special characters
  return /^\+\d{10,15}$/.test(value.replace(/\s/g, ""));
};

// Custom email validator
const isValidEmail = (value) => {
  return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value);
};

router.post(
  "/signup",
  [
    check("name").notEmpty().withMessage("Name is required").trim(),
    check("phone")
      .custom(isValidPhoneNumber)
      .withMessage(
        "Invalid phone number. Use format: +<country_code><number> (e.g., +917386898469)"
      )
      .customSanitizer((value) => value.replace(/\s/g, "")), // Remove spaces
    check("email")
      .custom(isValidEmail)
      .withMessage("Please enter a valid email address")
      .customSanitizer((value) => value.toLowerCase()),
    check("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    check("address").notEmpty().withMessage("Address is required").trim(),
  ],
  validate,
  signup
);

router.post(
  "/login",
  [
    check("password").notEmpty().withMessage("Password is required"),
    check("email")
      .optional()
      .custom(isValidEmail)
      .withMessage("Please enter a valid email address")
      .customSanitizer((value) => value.toLowerCase()),
    check("phone")
      .optional()
      .custom(isValidPhoneNumber)
      .withMessage(
        "Invalid phone number. Use format: +<country_code><number> (e.g., +917386898469)"
      )
      .customSanitizer((value) => value.replace(/\s/g, "")),
  ],
  validate,
  (req, res, next) => {
    // Custom validation to ensure either email or phone is provided
    if (!req.body.email && !req.body.phone) {
      return res.status(400).json({ 
        errors: [{ msg: "Either email or phone is required" }] 
      });
    }
    next();
  },
  login
);

router.post(
  "/refresh-token",
  [
    check("refreshToken").notEmpty().withMessage("Refresh token is required"),
  ],
  validate,
  refreshToken
);

router.post(
  "/logout",
  [
    check("refreshToken").notEmpty().withMessage("Refresh token is required"),
  ],
  validate,
  logout
);

router.post(
  "/otp/generate",
  [
    check("phone")
      .custom(isValidPhoneNumber)
      .withMessage(
        "Invalid phone number. Use format: +<country_code><number> (e.g., +917386898469)"
      )
      .customSanitizer((value) => value.replace(/\s/g, "")), // Remove spaces
  ],
  validate,
  generateOTPController
);

router.post(
  "/otp/verify",
  [
    check("phone")
      .custom(isValidPhoneNumber)
      .withMessage(
        "Invalid phone number. Use format: +<country_code><number> (e.g., +917386898469)"
      )
      .customSanitizer((value) => value.replace(/\s/g, "")), // Remove spaces
    check("otp")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
  ],
  validate,
  verifyOTPController
);

export default router;
