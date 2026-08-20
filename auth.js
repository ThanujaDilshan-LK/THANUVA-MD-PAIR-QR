// ---- auth.js ----
// In index.js: import authRouter from './auth.js'; app.use('/api', authRouter);
// Install first:  npm install nodemailer bcryptjs jsonwebtoken dotenv

import express from 'express';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, 'users.json');

const router = express.Router();

// ---- config (put these in a .env file, never commit real values) ----
// GMAIL_SENDER=thanujadilsahh2011@gmail.com     <- account that SENDS the OTP emails
// GMAIL_APP_PASSWORD=<16-char app password from Google Account > Security > App Passwords>
// JWT_SECRET=<any long random string>

const otpStore = new Map(); // { email: { code, expiresAt } } — use Redis/DB in production

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_SENDER,
    pass: process.env.GMAIL_APP_PASSWORD, // NOT your normal Gmail password — generate an App Password
  },
});

// ---- simple JSON file "database" of registered users ----
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// STEP A (first time only): sign up with name + email + password
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are all required.' });
  }
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ name, email, passwordHash, createdAt: new Date().toISOString() });
  saveUsers(users);
  res.json({ ok: true, message: 'Account created. You can now log in.' });
});

// STEP B (every time after): log in with email + password only, then email a 6-digit OTP
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'No account found with this email. Please sign up first.' });
  }
  const validPass = await bcrypt.compare(password, user.passwordHash);
  if (!validPass) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(user.email.toLowerCase(), { code, expiresAt: Date.now() + 5 * 60 * 1000 });

  await transporter.sendMail({
    from: process.env.GMAIL_SENDER,
    to: user.email,
    subject: 'THANUVA-MD — Your access code',
    text: `Hi ${user.name}, your access code is ${code}. It expires in 5 minutes.`,
  });

  res.json({ ok: true, message: 'OTP sent to your email.' });
});

// STEP C: verify OTP, issue a session token
router.post('/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }
  const entry = otpStore.get(email.toLowerCase());
  if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
    return res.status(401).json({ error: 'Invalid or expired code.' });
  }
  otpStore.delete(email.toLowerCase());

  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  const token = jwt.sign({ email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ ok: true, token, name: user.name });
});

// Middleware to protect dashboard/API routes with the issued token
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export default router;
