const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Homework = require('../models/Homework');
const Announcement = require('../models/Announcement');

router.use(authenticate, authorize('teacher'));

// Ona wanafunzi wa darasa fulani
router.get('/class/:className/students', async (req, res) => {
  const students = await Student.findAll({ where: { className: req.params.className } });
  res.json(students);
});

// Sajili mahudhurio (bulk kwa darasa zima)
// Mfano wa body: { records: [{ studentId: 1, date: '2026-07-17', status: 'present' }, ...] }
router.post('/attendance', async (req, res) => {
  try {
    const { records } = req.body;
    const created = await Attendance.bulkCreate(records);
    res.status(201).json({ message: 'Mahudhurio yamesajiliwa.', created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Weka alama (bulk)
// Mfano wa body: { marks: [{ studentId: 1, subject: 'Hisabati', score: 78, term: 'Term 2 2026' }, ...] }
router.post('/marks', async (req, res) => {
  try {
    const { marks } = req.body;
    const created = await Marks.bulkCreate(marks);
    res.status(201).json({ message: 'Alama zimewekwa.', created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Weka homework/assignment
router.post('/homework', async (req, res) => {
  try {
    const { title, description, className, subject, deadline } = req.body;
    const homework = await Homework.create({
      title, description, className, subject, deadline,
      teacherId: req.user.id,
    });
    res.status(201).json(homework);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tuma tangazo kwa darasa maalum (inasubiri approval ya Mkuu)
router.post('/announcements', async (req, res) => {
  try {
    const { title, message, className } = req.body;
    const announcement = await Announcement.create({
      title, message, className,
      targetRole: 'parent',
      status: 'pending', // Mkuu ndiye ata-approve
      createdBy: req.user.id,
    });
    res.status(201).json({ message: 'Tangazo limetumwa, linasubiri approval ya Mkuu wa Shule.', announcement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
