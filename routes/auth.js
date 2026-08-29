const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const User = require('../models/User');

// Zuia majaribio mengi ya login/register kutoka IP moja (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // dakika 15
  max: 10, // majaribio 10 tu kwa dakika 15 kwa kila IP
  message: { error: 'Majaribio mengi sana. Tafadhali subiri kidogo kabla ya kujaribu tena.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// SAJILI MTUMIAJI MPYA
// USALAMA: Usajili wa umma unaruhusu 'parent' PEKEE.
// 'teacher' na 'deputy_head_teacher' huundwa na Mkuu wa Shule (ona routes/headteacher.js -> /staff).
// 'head_teacher' inaruhusiwa tu mara moja (bootstrap) kama hakuna head_teacher yeyote bado kwenye mfumo.
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { fullName, email, phone, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Tafadhali jaza taarifa zote muhimu.' });
    }

    if (password.length < 6 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Nywila iwe na angalau herufi 6, ichanganye herufi na namba.' });
    }

    let finalRole = role;

    if (role === 'parent') {
      finalRole = 'parent';
    } else if (role === 'head_teacher') {
      const existingHeadTeacher = await User.findOne({ where: { role: 'head_teacher' } });
      if (existingHeadTeacher) {
        return res.status(403).json({
          error: 'Tayari kuna Mkuu wa Shule aliyesajiliwa. Wasiliana naye kupata akaunti ya Mwalimu au Makamu.',
        });
      }
      finalRole = 'head_teacher';
    } else {
      // 'teacher', 'deputy_head_teacher', au role yoyote isiyo ruhusiwa hadharani
      return res.status(403).json({
        error: 'Aina hii ya akaunti haiwezi kujisajili moja kwa moja. Wasiliana na Mkuu wa Shule.',
      });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email hii tayari imesajiliwa.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      phone,
      password: hashedPassword,
      role: finalRole,
    });

    res.status(201).json({
      message: 'Umesajiliwa kikamilifu!',
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server. Jaribu tena baadaye.' });
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

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Umeingia kikamilifu!',
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server. Jaribu tena baadaye.' });
  }
});

module.exports = router;
