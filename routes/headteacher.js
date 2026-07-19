const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Announcement = require('../models/Announcement');

const ClassAssignment = require('../models/ClassAssignment');

router.use(authenticate, authorize('head_teacher'));

// Teua mwalimu wa darasa (mwalimu mmoja tu kwa kila darasa)
router.post('/class-assignments', async (req, res) => {
  try {
    const { className, teacherId } = req.body;
    if (!className || !teacherId) {
      return res.status(400).json({ error: 'Weka darasa na mwalimu.' });
    }

    // Hakikisha teacherId ni mwalimu halisi
    const teacher = await User.findByPk(teacherId);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(400).json({ error: 'Mtumiaji huyu si mwalimu.' });
    }

    // Kama darasa hili tayari lina mwalimu, badilisha (siyo kuongeza mpya)
    const existing = await ClassAssignment.findOne({ where: { className } });
    if (existing) {
      await ClassAssignment.update({ teacherId }, { where: { className } });
      return res.json({ message: `Mwalimu wa ${className} amebadilishwa.` });
    }

    const assignment = await ClassAssignment.create({ className, teacherId });
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ona uteuzi wote wa walimu wa madarasa
router.get('/class-assignments', async (req, res) => {
  const assignments = await ClassAssignment.findAll();
  const users = await User.findAll();

  const enriched = assignments.map((a) => {
    const teacher = users.find((u) => u.id === a.teacherId);
    return { ...a, teacherName: teacher ? teacher.fullName : 'Haijulikani' };
  });

  res.json(enriched);
});

// Ondoa uteuzi wa mwalimu wa darasa
router.delete('/class-assignments/:id', async (req, res) => {
  await ClassAssignment.destroy({ where: { id: Number(req.params.id) } });
  res.json({ message: 'Uteuzi umeondolewa.' });
});

// Ona watumiaji wote (walimu/wazazi)
router.get('/users', async (req, res) => {
  const users = await User.findAll({ attributes: { exclude: ['password'] } });
  res.json(users);
});

// Ondoa mtumiaji
router.delete('/users/:id', async (req, res) => {
  await User.destroy({ where: { id: req.params.id } });
  res.json({ message: 'Mtumiaji ameondolewa.' });
});

// Ongeza mwanafunzi (admission)
router.post('/students', async (req, res) => {
  try {
    const { fullName, className, admissionNumber, parentId } = req.body;
    const student = await Student.create({ fullName, className, admissionNumber, parentId });
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ona wanafunzi wote (kwa ajili ya Simamia Wanafunzi)
router.get('/students', async (req, res) => {
  const students = await Student.findAll();
  res.json(students);
});

// Takwimu za jumla za shule (kwa ajili ya Analytics)
router.get('/reports/overview', async (req, res) => {
  const users = await User.findAll();
  const students = await Student.findAll();
  const announcements = await Announcement.findAll();

  const teachersCount = users.filter((u) => u.role === 'teacher').length;
  const parentsCount = users.filter((u) => u.role === 'parent').length;
  const pendingAnnouncements = announcements.filter((a) => a.status === 'pending').length;

  res.json({
    totalStudents: students.length,
    totalTeachers: teachersCount,
    totalParents: parentsCount,
    totalAnnouncements: announcements.length,
    pendingAnnouncements,
  });
});

// Ripoti ya ada - jumla ya madeni na malipo
router.get('/reports/fees', async (req, res) => {
  const fees = await Fee.findAll();
  const totalExpected = fees.reduce((sum, f) => sum + f.totalAmount, 0);
  const totalPaid = fees.reduce((sum, f) => sum + f.paidAmount, 0);
  const defaulters = fees.filter(f => f.status !== 'paid');

  res.json({
    totalExpected,
    totalPaid,
    balance: totalExpected - totalPaid,
    defaultersCount: defaulters.length,
    defaulters,
  });
});

// Ona matangazo yanayosubiri approval
router.get('/announcements/pending', async (req, res) => {
  const pending = await Announcement.findAll({ where: { status: 'pending' } });
  res.json(pending);
});

// Approve au reject tangazo
router.put('/announcements/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'approved' au 'rejected'
    await Announcement.update({ status }, { where: { id: req.params.id } });
    res.json({ message: `Tangazo limekuwa ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tuma tangazo kwa shule nzima moja kwa moja
router.post('/announcements/broadcast', async (req, res) => {
  try {
    const { title, message } = req.body;
    const announcement = await Announcement.create({
      title, message,
      targetRole: 'all',
      status: 'approved',
      createdBy: req.user.id,
    });
    res.status(201).json(announcement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
