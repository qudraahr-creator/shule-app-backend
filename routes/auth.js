const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const User = require('../models/User');
const School = require('../models/School');
const { sendOtpEmail } = require('../utils/sendEmail');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Majaribio mengi sana. Tafadhali subiri kidogo kabla ya kujaribu tena.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function validatePasswordStrength(password) {
  if (password.length < 6) return 'Nywila lazima iwe na angalau herufi 6.';
  if (!/[a-zA-Z]/.test(password)) return 'Nywila lazima iwe na angalau herufi moja (a-z).';
  if (!/[0-9]/.test(password)) return 'Nywila lazima iwe na angalau namba moja (0-9).';
  return null;
}

// SAJILI MTUMIAJI MPYA
// USALAMA + MULTI-SCHOOL:
// - 'parent': anahitaji schoolCode ya shule ambayo tayari ipo mfumoni.
// - 'head_teacher': anaunda SHULE MPYA (schoolName + schoolCode ya kipekee) na kuwa Mkuu wake.
// - 'teacher'/'deputy_head_teacher': HAWAWEZI kujisajili humu - huundwa na Mkuu wa Shule (/head/staff).
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { fullName, email, phone, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Tafadhali jaza taarifa zote muhimu.' });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email hii tayari imesajiliwa.' });
    }

    let schoolId = null;

    if (role === 'parent') {
      const { schoolCode } = req.body;
      if (!schoolCode) {
        return res.status(400).json({ error: 'Weka Msimbo wa Shule (School Code) uliopewa na shule.' });
      }
      const school = await School.findOne({ where: { code: schoolCode.trim().toUpperCase() } });
      if (!school) {
        return res.status(400).json({ error: 'Msimbo wa Shule si sahihi.' });
      }
      if (school.status === 'suspended') {
        return res.status(403).json({ error: 'Shule hii imesimamishwa kwa sasa. Wasiliana na uongozi.' });
      }
      schoolId = school.id;
    } else if (role === 'head_teacher') {
      const { schoolName, schoolCode } = req.body;
      if (!schoolName || !schoolCode) {
        return res.status(400).json({ error: 'Weka jina la shule na Msimbo wa Shule (schoolCode) wa kipekee.' });
      }
      const normalizedCode = schoolCode.trim().toUpperCase();
      const existingSchool = await School.findOne({ where: { code: normalizedCode } });
      if (existingSchool) {
        return res.status(400).json({ error: 'Msimbo huu wa shule tayari unatumika. Chagua mwingine.' });
      }
      const school = await School.create({
        name: schoolName,
        code: normalizedCode,
        status: 'active',
      });
      schoolId = school.id;
    } else if (role === 'super_admin') {
      const existingSuperAdmin = await User.findOne({ where: { role: 'super_admin' } });
      if (existingSuperAdmin) {
        return res.status(403).json({ error: 'Tayari kuna Super Admin aliyesajiliwa.' });
      }
      schoolId = null; // Super Admin hana shule maalum - anaona zote
    } else {
      return res.status(403).json({
        error: 'Aina hii ya akaunti haiwezi kujisajili moja kwa moja. Wasiliana na Mkuu wa Shule.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName, email, phone, password: hashedPassword, role, schoolId,
    });

    res.status(201).json({
      message: role === 'head_teacher'
        ? 'Shule na akaunti yako vimeundwa kikamilifu!'
        : 'Umesajiliwa kikamilifu!',
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, schoolId: user.schoolId },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// LOGIN
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Weka email na password.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Email au password si sahihi.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Email au password si sahihi.' });
    }

    // Kama mtumiaji ana shule (siyo super_admin), hakikisha shule haijasimamishwa
    if (user.schoolId) {
      const school = await School.findByPk(user.schoolId);
      if (school && school.status === 'suspended') {
        return res.status(403).json({ error: 'Shule yako imesimamishwa kwa sasa. Wasiliana na msimamizi.' });
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email, schoolId: user.schoolId || null },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Umeingia kikamilifu!',
      token,
      user: {
        id: user.id, fullName: user.fullName, email: user.email,
        role: user.role, schoolId: user.schoolId || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// ==== FORGOT PASSWORD ====

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Weka barua pepe.' });

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.json({ message: 'Kama email hii ipo kwenye mfumo wetu, msimbo umetumwa.' });
    }

    const otp = generateOtp();
    const otpExpiry = Date.now() + 10 * 60 * 1000;
    await User.update({ resetOtp: otp, resetOtpExpiry: otpExpiry }, { where: { id: user.id } });

    try {
      await sendOtpEmail(user.email, otp, user.fullName);
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
      return res.status(500).json({ error: 'Imeshindwa kutuma barua pepe. Jaribu tena baadaye.' });
    }

    res.json({ message: 'Kama email hii ipo kwenye mfumo wetu, msimbo umetumwa.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Jaza taarifa zote.' });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await User.findOne({ where: { email } });
    if (!user || !user.resetOtp) {
      return res.status(400).json({ error: 'Ombi la kubadilisha nywila halipo au limeisha muda.' });
    }
    if (Date.now() > user.resetOtpExpiry) {
      return res.status(400).json({ error: 'Msimbo umeisha muda. Omba msimbo mpya.' });
    }
    if (user.resetOtp !== otp) {
      return res.status(400).json({ error: 'Msimbo si sahihi.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.update(
      { password: hashedPassword, resetOtp: null, resetOtpExpiry: null },
      { where: { id: user.id } }
    );

    res.json({ message: 'Nywila imebadilishwa kikamilifu! Sasa unaweza kuingia.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

module.exports = router;
