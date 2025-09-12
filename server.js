import express from "express";
import cors from "cors";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import adminRoutes from './routes/admin.js'
import userRoutes from './routes/users.js'
import { initializeAdmin } from './utils/initAdmin.js';
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
dotenv.config();

// Connect to MongoDB
connectDB().then(() => {
  // Initialize admin user after database connection
  initializeAdmin();
});

// Middleware
app.use(cors({
  origin: [
    'https://infraxpertv1.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true
}));
app.use(express.json());

// Routes
app.get("/",(req,res)=>{
  res.send("Hello World");
});
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
const httpsPort = process.env.HTTPS_PORT || 5443;

// Try to start HTTPS server if certificates exist
const sslOptions = {
  key: process.env.SSL_KEY_PATH ? fs.readFileSync(process.env.SSL_KEY_PATH) : null,
  cert: process.env.SSL_CERT_PATH ? fs.readFileSync(process.env.SSL_CERT_PATH) : null
};

if (sslOptions.key && sslOptions.cert) {
  // Start HTTPS server
  https.createServer(sslOptions, app).listen(httpsPort, () => {
    console.log(`HTTPS Server running on port ${httpsPort}`);
  });
  
  // Also start HTTP server for fallback
  app.listen(port, () => {
    console.log(`HTTP Server running on port ${port}`);
  });
} else {
  // Start HTTP server only
  app.listen(port, () => {
    console.log(`HTTP Server running on port ${port}`);
    console.log('Note: HTTPS not configured. Set SSL_KEY_PATH and SSL_CERT_PATH environment variables to enable HTTPS.');
  });
}
