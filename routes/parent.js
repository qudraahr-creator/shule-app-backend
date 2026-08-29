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

router.use(authenticate, authorize('parent'));

// Helper: hakikisha studentId anayeombwa ni WA HUYU MZAZI kabla ya kutoa taarifa yoyote
async function verifyOwnChild(studentId, parentId) {
  const student = await Student.findByPk(studentId);
  if (!student) {
    return { allowed: false, status: 404, error: 'Mwanafunzi hajapatikana.' };
  }
  if (student.parentId !== parentId) {
    return { allowed: false, status: 403, error: 'Huna ruhusa ya kuona taarifa za mwanafunzi huyu.' };
  }
  return { allowed: true, student };
}

// Tafuta mwanafunzi kwa jina/darasa (kwa ajili ya kujiunganisha na mtoto)
// USALAMA: taarifa zinazorudishwa ni chache kwa makusudi (jina, darasa, kama tayari ameunganishwa)
// na jina la utafutaji linahitaji angalau herufi 2 ili kuzuia "kuvuna" orodha nzima ya wanafunzi.
router.get('/search-students', async (req, res) => {
  try {
    const { name, className } = req.query;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Andika angalau herufi 2 za jina kutafuta.' });
    }

    let students = await Student.findAll();

    if (className) {
      students = students.filter((s) => s.className === className);
    }
    students = students.filter((s) => s.fullName.toLowerCase().includes(name.toLowerCase()));

    // Punguza matokeo (zuia enumeration kubwa)
    students = students.slice(0, 20);

    res.json(students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      className: s.className,
      linked: !!s.parentId,
    })));
  } catch (err) {
    console.error('Search students error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// Jiunganishe na mtoto wako
// USALAMA: sasa inahitaji Admission Number sahihi (siyo tu kubofya kwenye orodha),
// ili mzazi asiweze kujichagulia mwanafunzi bila kuwa na taarifa halisi kutoka shuleni.
router.post('/link-child', async (req, res) => {
  try {
    const { studentId, admissionNumber } = req.body;

    if (!admissionNumber) {
      return res.status(400).json({ error: 'Weka Namba ya Usajili (Admission Number) ya mtoto kuthibitisha.' });
    }

    const student = await Student.findByPk(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Mwanafunzi hajapatikana.' });
    }
    if (student.parentId) {
      return res.status(400).json({
        error: 'Mwanafunzi huyu tayari ameunganishwa na mzazi mwingine. Wasiliana na Mkuu wa Shule.',
      });
    }
    if (!student.admissionNumber || student.admissionNumber.trim().toLowerCase() !== admissionNumber.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Namba ya Usajili haikubaliani na mwanafunzi huyu.' });
    }

    await Student.update({ parentId: req.user.id }, { where: { id: studentId } });
    res.json({ message: 'Umeunganishwa na mtoto wako kikamilifu!' });
  } catch (err) {
    console.error('Link child error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// Ona watoto wote wa mzazi huyu
router.get('/children', async (req, res) => {
  const children = await Student.findAll({ where: { parentId: req.user.id } });
  res.json(children);
});

// Ona matokeo ya mtoto fulani
router.get('/children/:studentId/marks', async (req, res) => {
  const check = await verifyOwnChild(req.params.studentId, req.user.id);
  if (!check.allowed) return res.status(check.status).json({ error: check.error });

  const marks = await Marks.findAll({ where: { studentId: Number(req.params.studentId) } });
  res.json(marks);
});

// Ona mahudhurio ya mtoto
router.get('/children/:studentId/attendance', async (req, res) => {
  const check = await verifyOwnChild(req.params.studentId, req.user.id);
  if (!check.allowed) return res.status(check.status).json({ error: check.error });

  const records = await Attendance.findAll({ where: { studentId: Number(req.params.studentId) } });
  const total = records.length;
  const present = records.filter((r) => r.status === 'present').length;
  const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

  res.json({ records, percentage: `${percentage}%` });
});

// Ona ada ya mtoto
router.get('/children/:studentId/fees', async (req, res) => {
  const check = await verifyOwnChild(req.params.studentId, req.user.id);
  if (!check.allowed) return res.status(check.status).json({ error: check.error });

  const fees = await Fee.findAll({ where: { studentId: Number(req.params.studentId) } });
  res.json(fees);
});

// Ona homework kwa darasa la mtoto
router.get('/children/:studentId/homework', async (req, res) => {
  const check = await verifyOwnChild(req.params.studentId, req.user.id);
  if (!check.allowed) return res.status(check.status).json({ error: check.error });

  const homework = await Homework.findAll({ where: { className: check.student.className } });
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

// Omba ruhusa (sick leave / early pickup) kwa niaba ya mtoto
router.post('/leave-requests', async (req, res) => {
  try {
    const { studentId, type, reason, date } = req.body;
    if (!studentId || !type || !date) {
      return res.status(400).json({ error: 'Weka mtoto, aina ya ruhusa, na tarehe.' });
    }

    const check = await verifyOwnChild(studentId, req.user.id);
    if (!check.allowed) return res.status(check.status).json({ error: check.error });

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
    console.error('Leave request error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// Ona ombi zangu za ruhusa
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

module.exports = router;
