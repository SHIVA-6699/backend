import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// Protected route - requires valid access token
router.get("/profile", authenticateToken, (req, res) => {
  res.json({
    message: "Profile accessed successfully",
    user: req.user
  });
});

// Update profile (protected)
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { name, address } = req.body;
    
    // Only allow updating name and address for security
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { name, address },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    res.json({
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile", error: error.message });
  }
});

// Get user stats (protected)
router.get("/stats", authenticateToken, (req, res) => {
  res.json({
    message: "User stats retrieved",
    stats: {
      userId: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phoneVerified: req.user.isPhoneVerified,
      emailVerified: req.user.isEmailVerified,
      memberSince: req.user.createdAt
    }
  });
});

export default router;
