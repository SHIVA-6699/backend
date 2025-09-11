import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import adminRoutes from './routes/admin.js'
import userRoutes from './routes/users.js'
import { initializeAdmin } from './utils/initAdmin.js';
import dotenv from "dotenv";
const app = express();
dotenv.config();

// Connect to MongoDB
connectDB().then(() => {
  // Initialize admin user after database connection
  initializeAdmin();
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);

// Basic Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start Server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
