const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Announcement = require('../models/Announcement');
const ClassAssignment = require('../models/ClassAssignment');
const School = require('../models/School');
const sendPushNotification = require('../utils/sendPushNotification');

router.use(authenticate, authorize('head_teacher', 'deputy_head_teacher'));

// Ona taarifa za shule yangu
router.get('/school', async (req, res) => {
  const school = await School.findByPk(req.user.schoolId);
  res.json(school);
});

router.post('/staff', async (req, res) => {
  try {
    if (req.user.role !== 'head_teacher') {
      return res.status(403).json({ error: 'Ni Mkuu wa Shule pekee anayeweza kuongeza wafanyakazi.' });
    }
    const { fullName, email, phone, password, role } = req.body;
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Jaza taarifa zote muhimu.' });
    }
    if (!['teacher', 'deputy_head_teacher'].includes(role)) {
      return res.status(400).json({ error: 'Role si sahihi. Chagua teacher au deputy_head_teacher.' });
    }
    if (password.length < 6 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Nywila iwe na angalau herufi 6, ichanganye herufi na namba.' });
    }
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email hii tayari imesajiliwa.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName, email, phone, password: hashedPassword, role, schoolId: req.user.schoolId,
    });

    res.status(201).json({
      message: 'Mfanyakazi ameongezwa kikamilifu!',
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Create staff error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// Ona watumiaji WA SHULE YANGU pekee
router.get('/users', async (req, res) => {
  const users = await User.findAll({
    where: { schoolId: req.user.schoolId },
    attributes: { exclude: ['password'] },
  });
  res.json(users);
});

router.delete('/users/:id', async (req, res) => {
  if (req.user.role !== 'head_teacher') {
    return res.status(403).json({ error: 'Ni Mkuu wa Shule pekee anayeweza kuondoa watumiaji.' });
  }
  // USALAMA: hakikisha mtumiaji anayefutwa ni wa shule hii hii
  const target = await User.findByPk(req.params.id);
  if (!target || target.schoolId !== req.user.schoolId) {
    return res.status(404).json({ error: 'Mtumiaji hajapatikana kwenye shule yako.' });
  }
  await User.destroy({ where: { id: Number(req.params.id) } });
  res.json({ message: 'Mtumiaji ameondolewa.' });
});

router.post('/students', async (req, res) => {
  try {
    const { fullName, className, admissionNumber, parentId } = req.body;
    const student = await Student.create({
      fullName, className, admissionNumber, parentId, schoolId: req.user.schoolId,
    });
    res.status(201).json(student);
  } catch (err) {
    console.error('Create student error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.get('/students', async (req, res) => {
  const students = await Student.findAll({ where: { schoolId: req.user.schoolId } });
  res.json(students);
});

router.get('/reports/overview', async (req, res) => {
  const users = await User.findAll({ where: { schoolId: req.user.schoolId } });
  const students = await Student.findAll({ where: { schoolId: req.user.schoolId } });
  const announcements = await Announcement.findAll({ where: { schoolId: req.user.schoolId } });

  res.json({
    totalStudents: students.length,
    totalTeachers: users.filter((u) => u.role === 'teacher').length,
    totalParents: users.filter((u) => u.role === 'parent').length,
    totalAnnouncements: announcements.length,
    pendingAnnouncements: announcements.filter((a) => a.status === 'pending').length,
  });
});

router.get('/reports/fees', async (req, res) => {
  const schoolStudentIds = (await Student.findAll({ where: { schoolId: req.user.schoolId } })).map((s) => s.id);
  const allFees = await Fee.findAll();
  const fees = allFees.filter((f) => schoolStudentIds.includes(f.studentId));

  const totalExpected = fees.reduce((sum, f) => sum + f.totalAmount, 0);
  const totalPaid = fees.reduce((sum, f) => sum + f.paidAmount, 0);
  const defaulters = fees.filter((f) => f.status !== 'paid');

  res.json({
    totalExpected, totalPaid, balance: totalExpected - totalPaid,
    defaultersCount: defaulters.length, defaulters,
  });
});

router.get('/announcements/pending', async (req, res) => {
  const pending = await Announcement.findAll({ where: { schoolId: req.user.schoolId, status: 'pending' } });
  res.json(pending);
});

router.put('/announcements/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const announcement = await Announcement.findByPk(req.params.id);
    if (!announcement || announcement.schoolId !== req.user.schoolId) {
      return res.status(404).json({ error: 'Tangazo halijapatikana.' });
    }

    await Announcement.update({ status }, { where: { id: Number(req.params.id) } });

    if (status === 'approved') {
      const users = await User.findAll({ where: { schoolId: req.user.schoolId } });
      let targetParents = users.filter((u) => u.role === 'parent');

      if (announcement.className) {
        const students = await Student.findAll({ where: { schoolId: req.user.schoolId, className: announcement.className } });
        const parentIds = students.map((s) => s.parentId);
        targetParents = targetParents.filter((p) => parentIds.includes(p.id));
      }

      targetParents.forEach((parent) => {
        if (parent.pushToken) {
          sendPushNotification(parent.pushToken, announcement.title, announcement.message, { type: 'announcement' });
        }
      });
    }

    res.json({ message: `Tangazo limekuwa ${status}.` });
  } catch (err) {
    console.error('Announcement status error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/announcements/broadcast', async (req, res) => {
  try {
    const { title, message } = req.body;
    const announcement = await Announcement.create({
      title, message, targetRole: 'all', status: 'approved',
      createdBy: req.user.id, schoolId: req.user.schoolId,
    });
    res.status(201).json(announcement);
  } catch (err) {
    console.error('Broadcast error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/class-assignments', async (req, res) => {
  try {
    const { className, teacherId } = req.body;
    if (!className || !teacherId) return res.status(400).json({ error: 'Weka darasa na mwalimu.' });

    const teacher = await User.findByPk(teacherId);
    if (!teacher || teacher.role !== 'teacher' || teacher.schoolId !== req.user.schoolId) {
      return res.status(400).json({ error: 'Mtumiaji huyu si mwalimu wa shule yako.' });
    }

    const existing = await ClassAssignment.findOne({ where: { className, schoolId: req.user.schoolId } });
    if (existing) {
      await ClassAssignment.update({ teacherId }, { where: { id: existing.id } });
      return res.json({ message: `Mwalimu wa ${className} amebadilishwa.` });
    }

    const assignment = await ClassAssignment.create({ className, teacherId, schoolId: req.user.schoolId });
    res.status(201).json(assignment);
  } catch (err) {
    console.error('Class assignment error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.get('/class-assignments', async (req, res) => {
  const assignments = await ClassAssignment.findAll({ where: { schoolId: req.user.schoolId } });
  const users = await User.findAll({ where: { schoolId: req.user.schoolId } });

  const enriched = assignments.map((a) => {
    const teacher = users.find((u) => u.id === a.teacherId);
    return { ...a, teacherName: teacher ? teacher.fullName : 'Haijulikani' };
  });
  res.json(enriched);
});

router.delete('/class-assignments/:id', async (req, res) => {
  const assignment = await ClassAssignment.findByPk(req.params.id);
  if (!assignment || assignment.schoolId !== req.user.schoolId) {
    return res.status(404).json({ error: 'Uteuzi haujapatikana.' });
  }
  await ClassAssignment.destroy({ where: { id: Number(req.params.id) } });
  res.json({ message: 'Uteuzi umeondolewa.' });
});

module.exports = router;
