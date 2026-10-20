import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import admin from "firebase-admin";
import "dotenv/config";
import User from "./model/User.js";
import Transaction from "./model/Transaction.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,72}$/;

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(",").map((origin) => origin.trim())
    : false,
}));

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const publicUser = (user) => ({
  id: user._id,
  fullname: user.fullname,
  username: user.username,
  email: user.email,
  accountNumber: user.accountNumber,
  balancePence: user.balancePence,
  balance: (user.balancePence / 100).toFixed(2),
});

const signToken = (user) =>
  jwt.sign({ id: user._id.toString() }, process.env.SECRET_ACCESS_KEY, {
    expiresIn: JWT_EXPIRES_IN,
  });

const authResponse = (user) => ({ accessToken: signToken(user), user: publicUser(user) });

const authenticate = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "A Bearer access token is required" });
  }
  try {
    const payload = jwt.verify(token, process.env.SECRET_ACCESS_KEY);
    req.userId = payload.id;
    return next();
  } catch {
    return res.status(401).json({ error: "Access token is invalid or expired" });
  }
};

const createUniqueUsername = async (email, session) => {
  const base = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) || "user";
  let username = base;
  while (await User.exists({ username }).session(session || null)) {
    username = `${base.slice(0, 14)}${crypto.randomBytes(3).toString("hex")}`;
  }
  return username;
};

const createAccountNumber = async (session) => {
  let accountNumber;
  do {
    accountNumber = crypto.randomInt(10_000_000, 100_000_000).toString();
  } while (await User.exists({ accountNumber }).session(session || null));
  return accountNumber;
};

const amountToPence = (amount) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
  const pence = Math.round(numericAmount * 100);
  return Number.isSafeInteger(pence) ? pence : null;
};

const firebaseAuth = (() => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    const credential = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(credential) });
    return admin.auth();
  } catch (error) {
    console.error("Firebase configuration is invalid:", error.message);
    return null;
  }
})();

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.post("/signup", asyncHandler(async (req, res) => {
  const fullname = String(req.body.fullname || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (fullname.length < 3) return res.status(400).json({ error: "Full name must contain at least 3 characters" });
  if (!emailRegex.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ error: "Password must be 8-72 characters and include uppercase, lowercase and a number" });
  }

  const [username, accountNumber, passwordHash] = await Promise.all([
    createUniqueUsername(email), createAccountNumber(), bcrypt.hash(password, 12),
  ]);
  try {
    const user = await User.create({ fullname, email, passwordHash, username, accountNumber });
    return res.status(201).json(authResponse(user));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with that email already exists" });
    throw error;
  }
}));

app.post("/signin", asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }
  return res.json(authResponse(user));
}));

app.post("/google-auth", asyncHandler(async (req, res) => {
  if (!firebaseAuth) return res.status(503).json({ error: "Google authentication is not configured" });
  const idToken = req.body.idToken;
  if (!idToken) return res.status(400).json({ error: "A Firebase ID token is required" });
  const decoded = await firebaseAuth.verifyIdToken(idToken);
  const email = normalizeEmail(decoded.email);
  if (!email) return res.status(400).json({ error: "The Google account has no verified email" });

  let user = await User.findOne({ email });
  if (user && !user.googleAuth) return res.status(409).json({ error: "This email uses password login" });
  if (!user) {
    user = await User.create({
      fullname: decoded.name || email.split("@")[0],
      email,
      username: await createUniqueUsername(email),
      accountNumber: await createAccountNumber(),
      googleAuth: true,
      profileImage: decoded.picture || "",
    });
  }
  return res.json(authResponse(user));
}));

app.get("/account", authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: "Account not found" });
  return res.json(publicUser(user));
}));

app.post("/account/deposit", authenticate, asyncHandler(async (req, res) => {
  const amountPence = amountToPence(req.body.amount);
  if (!amountPence) return res.status(400).json({ error: "Enter a valid positive amount" });
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      user = await User.findByIdAndUpdate(
        req.userId,
        { $inc: { balancePence: amountPence } },
        { new: true, session }
      );
      if (!user) throw Object.assign(new Error("Account not found"), { status: 404 });
      await Transaction.create(
        [{ type: "deposit", amountPence, recipient: user._id, reference: req.body.reference || "Deposit" }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  return res.status(201).json({ message: "Deposit recorded", account: publicUser(user) });
}));

app.post("/account/withdraw", authenticate, asyncHandler(async (req, res) => {
  const amountPence = amountToPence(req.body.amount);
  if (!amountPence) return res.status(400).json({ error: "Enter a valid positive amount" });
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      user = await User.findOneAndUpdate(
        { _id: req.userId, balancePence: { $gte: amountPence } },
        { $inc: { balancePence: -amountPence } },
        { new: true, session }
      );
      if (!user) throw Object.assign(new Error("Insufficient funds or account not found"), { status: 400 });
      await Transaction.create(
        [{ type: "withdrawal", amountPence, sender: user._id, reference: req.body.reference || "Withdrawal" }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  return res.status(201).json({ message: "Withdrawal recorded", account: publicUser(user) });
}));

app.post("/account/transfer", authenticate, asyncHandler(async (req, res) => {
  const amountPence = amountToPence(req.body.amount);
  const recipientAccountNumber = String(req.body.recipientAccountNumber || "").trim();
  const reference = String(req.body.reference || "Transfer").trim().slice(0, 100);
  if (!amountPence) return res.status(400).json({ error: "Enter a valid positive amount" });

  const session = await mongoose.startSession();
  let transaction;
  try {
    await session.withTransaction(async () => {
      const recipient = await User.findOne({ accountNumber: recipientAccountNumber }).session(session);
      if (!recipient) throw Object.assign(new Error("Recipient account not found"), { status: 404 });
      if (recipient._id.toString() === req.userId) throw Object.assign(new Error("You cannot transfer to your own account"), { status: 400 });

      const sender = await User.findOneAndUpdate(
        { _id: req.userId, balancePence: { $gte: amountPence } },
        { $inc: { balancePence: -amountPence } },
        { new: true, session }
      );
      if (!sender) throw Object.assign(new Error("Insufficient funds"), { status: 400 });
      await User.updateOne({ _id: recipient._id }, { $inc: { balancePence: amountPence } }, { session });
      [transaction] = await Transaction.create(
        [{ type: "transfer", amountPence, sender: sender._id, recipient: recipient._id, reference }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  return res.status(201).json({ message: "Transfer completed", transactionId: transaction._id });
}));

app.get("/transactions", authenticate, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const transactions = await Transaction.find({ $or: [{ sender: req.userId }, { recipient: req.userId }] })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("sender recipient", "fullname accountNumber");
  return res.json({ transactions });
}));

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(error.status || 500).json({ error: error.status ? error.message : "An unexpected error occurred" });
});

const start = async () => {
  if (!process.env.DATABASE_URL || !process.env.SECRET_ACCESS_KEY) {
    throw new Error("DATABASE_URL and SECRET_ACCESS_KEY must be configured");
  }
  await mongoose.connect(process.env.DATABASE_URL, { autoIndex: true });
  app.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () => {
  console.log("Banking API started");
});
};

start().catch((error) => {
  console.error("Application failed to start:", error.message);
  process.exit(1);
});

export default app;
