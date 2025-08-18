import User from "../models/User.js";
import OTP from "../models/OTP.js";
import { sendOTP, verifyOTP } from "../utils/engagelab.js";
import bcrypt from "bcryptjs";
import { generateTokens, verifyRefreshToken } from "../utils/jwt.js";

const signup = async (req, res, next) => {
  try {
    const { name, phone, email, password, address } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ phone: phone.replace(/\s/g, "") }, { email: email.toLowerCase() }],
    });
    
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Phone or email already exists" });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = new User({ 
      name, 
      phone: phone.replace(/\s/g, ""), 
      email: email.toLowerCase(), 
      password: hashedPassword,
      address 
    });
    
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;
    
    res.status(201).json({ 
      message: "User created successfully", 
      user: userResponse,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
};

const generateOTPController = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const sanitizedPhone = phone.replace(/\s/g, ""); // Ensure no spaces
    const user = await User.findOne({ phone: sanitizedPhone });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { messageId, sendChannel } = await sendOTP(sanitizedPhone);
    // Store messageId in OTP model for verification
    const otpDoc = new OTP({
      phone: sanitizedPhone,
      otp: "engagelab-managed",
      type: "signup",
      messageId,
    });
    await otpDoc.save();
    res.status(200).json({ message: "OTP sent", messageId, sendChannel });
  } catch (error) {
    next(error);
  }
};

const verifyOTPController = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const sanitizedPhone = phone.replace(/\s/g, ""); // Ensure no spaces
    const otpDoc = await OTP.findOne({
      phone: sanitizedPhone,
      type: "signup",
      isUsed: false,
    });
    if (!otpDoc) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    const verified = await verifyOTP(otpDoc.messageId, otp);
    if (!verified) {
      return res.status(400).json({ message: "OTP verification failed" });
    }
    otpDoc.isUsed = true;
    await otpDoc.save();
    const user = await User.findOneAndUpdate(
      { phone: sanitizedPhone },
      { isPhoneVerified: true },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "OTP verified", user });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({ message: "Email or phone is required" });
    }
    
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    // Find user by email or phone
    let user;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    } else {
      user = await User.findOne({ phone: phone.replace(/\s/g, "") });
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ message: "Account is deactivated" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;
    
    res.status(200).json({ 
      message: "Login successful", 
      user: userResponse,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    
    if (!token) {
      return res.status(401).json({ message: "Refresh token is required" });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    // Update refresh token
    user.refreshToken = newRefreshToken;
    await user.save();
    
    res.status(200).json({ 
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    // Find user and remove refresh token
    const user = await User.findOneAndUpdate(
      { refreshToken: token },
      { refreshToken: null },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ message: "Invalid refresh token" });
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

export { signup, generateOTPController, verifyOTPController , login, refreshToken, logout};
