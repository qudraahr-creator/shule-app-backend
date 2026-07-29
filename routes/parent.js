const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Fee = require('../models/Fee');
const Homework = require('../models/Homework');
const Announcement = require('../models/Announcement');
const LeaveRequest = require('../models/LeaveRequest');

// Zuia routes zote hapa chini kwa role 'parent' pekee
router.use(authenticate, authorize('parent'));

// Omba ruhusa (sick leave / early pickup) kwa niaba ya mtoto
router.post('/leave-requests', async (req, res) => {
  try {
    const { studentId, type, reason, date } = req.body;
    if (!studentId || !type || !date) {
      return res.status(400).json({ error: 'Weka mtoto, aina ya ruhusa, na tarehe.' });
    }

    const student = await Student.findByPk(studentId);
    if (!student || student.parentId !== req.user.id) {
      return res.status(403).json({ error: 'Huyu si mtoto wako.' });
    }

    const leaveRequest = await LeaveRequest.create({
      studentId: Number(studentId),
      parentId: req.user.id,
      type,
      reason,
      date,
      status: 'pending',
    });

    res.status(201).json(leaveRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ona ombi zangu za ruhusa (kwa watoto wangu wote)
router.get('/leave-requests', async (req, res) => {
  const children = await Student.findAll({ where: { parentId: req.user.id } });
  const childIds = children.map((c) => c.id);

  const allRequests = await LeaveRequest.findAll();
  const myRequests = allRequests
    .filter((r) => childIds.includes(r.studentId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const enriched = myRequests.map((r) => {
    const student = children.find((c) => c.id === r.studentId);
    return { ...r, studentName: student ? student.fullName : 'Haijulikani' };
  });

  res.json(enriched);
});

// Tafuta mwanafunzi kwa jina/darasa (kwa ajili ya kujiunganisha na mtoto)
router.get('/search-students', async (req, res) => {
  try {
    const { name, className } = req.query;
    let students = await Student.findAll();

    if (className) {
      students = students.filter((s) => s.className === className);
    }
    if (name) {
      students = students.filter((s) => s.fullName.toLowerCase().includes(name.toLowerCase()));
    }

    res.json(students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      className: s.className,
      admissionNumber: s.admissionNumber,
      linked: !!s.parentId,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Jiunganishe na mtoto wako (endapo bado hajaunganishwa na mzazi yeyote)
router.post('/link-child', async (req, res) => {
  try {
    const { studentId } = req.body;
    const student = await Student.findByPk(studentId);

    if (!student) {
      return res.status(404).json({ error: 'Mwanafunzi hajapatikana.' });
    }
    if (student.parentId) {
      return res.status(400).json({
        error: 'Mwanafunzi huyu tayari ameunganishwa na mzazi mwingine. Wasiliana na Mkuu wa Shule.',
      });
    }

    await Student.update({ parentId: req.user.id }, { where: { id: studentId } });
    res.json({ message: 'Umeunganishwa na mtoto wako kikamilifu!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
