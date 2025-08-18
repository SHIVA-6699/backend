import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true, // Set to 'engagelab-managed' since Engagelab generates OTP
    },
    type: {
      type: String,
      enum: ["signup"],
      default: "signup",
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    messageId: {
      type: String, // Store Engagelab message_id
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 300,
    },
  },
  { timestamps: true }
);

export default mongoose.model("OTP", otpSchema);
