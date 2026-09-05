const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const School = require('../models/School');
const User = require('../models/User');
const Student = require('../models/Student');

router.use(authenticate, authorize('super_admin'));

// Takwimu za jumla za mfumo mzima
router.get('/overview', async (req, res) => {
  const schools = await School.findAll();
  const users = await User.findAll();
  const students = await Student.findAll();

  res.json({
    totalSchools: schools.length,
    activeSchools: schools.filter((s) => s.status === 'active').length,
    suspendedSchools: schools.filter((s) => s.status === 'suspended').length,
    totalStudents: students.length,
    totalTeachers: users.filter((u) => u.role === 'teacher').length,
    totalParents: users.filter((u) => u.role === 'parent').length,
  });
});

// Ona shule zote na takwimu zake fupi
router.get('/schools', async (req, res) => {
  const schools = await School.findAll();
  const users = await User.findAll();
  const students = await Student.findAll();

  const enriched = schools.map((school) => {
    const headTeacher = users.find((u) => u.schoolId === school.id && u.role === 'head_teacher');
    return {
      ...school,
      headTeacherName: headTeacher ? headTeacher.fullName : 'Hakuna',
      headTeacherEmail: headTeacher ? headTeacher.email : '',
      studentsCount: students.filter((s) => s.schoolId === school.id).length,
      teachersCount: users.filter((u) => u.schoolId === school.id && u.role === 'teacher').length,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(enriched);
});

// Simamisha au washa shule tena
router.put('/schools/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'active' | 'suspended'
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status si sahihi.' });
    }
    await School.update({ status }, { where: { id: Number(req.params.id) } });
    res.json({ message: `Shule imekuwa ${status === 'active' ? 'active' : 'imesimamishwa'}.` });
  } catch (err) {
    console.error('School status error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

module.exports = router;
