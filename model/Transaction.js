import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ["deposit", "withdrawal", "transfer"] },
    amountPence: { type: Number, required: true, min: 1 },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reference: { type: String, trim: true, maxlength: 100, default: "" },
  },
  { timestamps: true }
);

transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ recipient: 1, createdAt: -1 });

export default mongoose.model("Transaction", transactionSchema);
