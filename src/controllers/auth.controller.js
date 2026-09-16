import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import StudentProfile from "../models/StudentProfile.js";
import EmployerProfile from "../models/EmployerProfile.js";
import { signToken } from "../utils/jwt.js";
import { sendEmail } from "../utils/email.js";

export async function register(req, res) {
  const { role, name, email, password, companyName, companyDescription } = req.body;

  if (!role || !name || !email || !password) {
    return res.status(400).json({ error: "role, name, email, password are required" });
  }
  if (!["student", "employer"].includes(role)) {
    return res.status(400).json({ error: "role must be student or employer" });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  if (role === "student" && !req.file) {
    return res.status(400).json({ error: "Resume (PDF or DOCX, max 5MB) is required" });
  }
  if (role === "employer" && !companyName) {
    return res.status(400).json({ error: "companyName is required for employers" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verificationToken = crypto.randomBytes(24).toString("hex");

  const user = await User.create({
    role,
    name,
    email: email.toLowerCase(),
    passwordHash,
    status: role === "student" ? "active" : "pending",
    verificationToken,
  });

  if (role === "student") {
    await StudentProfile.create({
      userId: user._id,
      resumeUrl: `/uploads/${req.file.filename}`,
    });
  } else {
    await EmployerProfile.create({
      userId: user._id,
      companyName,
      companyDescription,
    });
  }

  await sendEmail({
    to: user.email,
    subject: "Verify your PlaceMe account",
    text: `Welcome ${user.name}, verify here: ${process.env.CLIENT_URL}/verify/${verificationToken}`,
  });

  if (role === "employer") {
    // TODO: notify admins of a new employer pending approval
    console.log(`[admin notify] new employer pending approval: ${user.email}`);
  }

  return res.status(201).json({ id: user._id, status: user.status });
}

export async function verifyEmail(req, res) {
  const { token } = req.params;
  const user = await User.findOne({ verificationToken: token });
  if (!user) return res.status(400).json({ error: "Invalid or expired verification token" });

  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save();

  return res.json({ message: "Email verified" });
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  if (user.status === "rejected") {
    return res.status(403).json({ error: "Account was rejected" });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: { id: user._id, role: user.role, name: user.name, email: user.email, status: user.status },
  });
}
