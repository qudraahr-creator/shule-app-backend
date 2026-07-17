const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Fee = require('../models/Fee');
const Homework = require('../models/Homework');
const Announcement = require('../models/Announcement');

// Zuia routes zote hapa chini kwa role 'parent' pekee
router.use(authenticate, authorize('parent'));

// Ona watoto wote wa mzazi huyu
router.get('/children', async (req, res) => {
  const children = await Student.findAll({ where: { parentId: req.user.id } });
  res.json(children);
});

// Ona matokeo ya mtoto fulani
router.get('/children/:studentId/marks', async (req, res) => {
  const marks = await Marks.findAll({ where: { studentId: req.params.studentId } });
  res.json(marks);
});

// Ona mahudhurio ya mtoto
router.get('/children/:studentId/attendance', async (req, res) => {
  const records = await Attendance.findAll({ where: { studentId: req.params.studentId } });

  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

  res.json({ records, percentage: `${percentage}%` });
});

// Ona ada ya mtoto
router.get('/children/:studentId/fees', async (req, res) => {
  const fees = await Fee.findAll({ where: { studentId: req.params.studentId } });
  res.json(fees);
});

// Ona homework kwa darasa la mtoto
router.get('/children/:studentId/homework', async (req, res) => {
  const student = await Student.findByPk(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Mwanafunzi hajapatikana' });

  const homework = await Homework.findAll({ where: { className: student.className } });
  res.json(homework);
});

// Ona matangazo
router.get('/announcements', async (req, res) => {
  const announcements = await Announcement.findAll({
    where: { status: 'approved' },
    order: [['createdAt', 'DESC']],
  });
  res.json(announcements);
});

module.exports = router;
