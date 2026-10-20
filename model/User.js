import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullname: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    passwordHash: { type: String, select: false, required() { return !this.googleAuth; } },
    googleAuth: { type: Boolean, default: false },
    profileImage: { type: String, default: "" },
    accountNumber: { type: String, required: true, unique: true, immutable: true },
    balancePence: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
