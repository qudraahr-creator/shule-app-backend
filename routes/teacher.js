const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Homework = require('../models/Homework');
const Announcement = require('../models/Announcement');
const ClassAssignment = require('../models/ClassAssignment');
const LeaveRequest = require('../models/LeaveRequest');

router.use(authenticate, authorize('teacher'));

// USALAMA: kila kitendo kinachohusu darasa fulani kinathibitisha kwanza
// kwamba huyu mwalimu ndiye ALIYETEULIWA rasmi kwa darasa hilo (na Mkuu wa Shule),
// kabla ya kumruhusu kuona au kubadilisha taarifa za wanafunzi wa darasa hilo.
async function verifyClassOwnership(className, teacherId) {
  const assignment = await ClassAssignment.findOne({ where: { className } });
  if (!assignment) {
    return { allowed: false, reason: 'Darasa hili halijapewa mwalimu bado. Mwombe Mkuu wa Shule akuteue.' };
  }
  if (assignment.teacherId !== teacherId) {
    return { allowed: false, reason: 'Wewe si mwalimu wa darasa hili.' };
  }
  return { allowed: true };
}

router.get('/my-classes', async (req, res) => {
  const assignments = await ClassAssignment.findAll({ where: { teacherId: req.user.id } });
  res.json(assignments.map((a) => a.className));
});

router.get('/class/:className/students', async (req, res) => {
  const check = await verifyClassOwnership(req.params.className, req.user.id);
  if (!check.allowed) return res.status(403).json({ error: check.reason });

  const students = await Student.findAll({ where: { className: req.params.className } });
  res.json(students);
});

router.post('/attendance', async (req, res) => {
  try {
    const { className, records } = req.body;
    const check = await verifyClassOwnership(className, req.user.id);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    // USALAMA: hakikisha kila studentId kwenye records ni wa darasa hili hili
    // (siyo tu kuamini data itakayotumwa na client)
    const classStudents = await Student.findAll({ where: { className } });
    const validStudentIds = classStudents.map((s) => s.id);
    const invalidRecord = records.find((r) => !validStudentIds.includes(Number(r.studentId)));
    if (invalidRecord) {
      return res.status(400).json({ error: 'Baadhi ya wanafunzi hawapo kwenye darasa hili.' });
    }

    const created = await Attendance.bulkCreate(records);
    res.status(201).json({ message: 'Mahudhurio yamesajiliwa.', created });
  } catch (err) {
    console.error('Attendance error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/marks', async (req, res) => {
  try {
    const { className, marks } = req.body;
    const check = await verifyClassOwnership(className, req.user.id);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const classStudents = await Student.findAll({ where: { className } });
    const validStudentIds = classStudents.map((s) => s.id);
    const invalidMark = marks.find((m) => !validStudentIds.includes(Number(m.studentId)));
    if (invalidMark) {
      return res.status(400).json({ error: 'Baadhi ya wanafunzi hawapo kwenye darasa hili.' });
    }

    const created = await Marks.bulkCreate(marks);
    res.status(201).json({ message: 'Alama zimewekwa.', created });
  } catch (err) {
    console.error('Marks error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/homework', async (req, res) => {
  try {
    const { title, description, className, subject, deadline } = req.body;
    const check = await verifyClassOwnership(className, req.user.id);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const homework = await Homework.create({
      title, description, className, subject, deadline,
      teacherId: req.user.id,
    });
    res.status(201).json(homework);
  } catch (err) {
    console.error('Homework error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, message, className } = req.body;

    if (className) {
      const check = await verifyClassOwnership(className, req.user.id);
      if (!check.allowed) return res.status(403).json({ error: check.reason });
    }

    const announcement = await Announcement.create({
      title, message, className,
      targetRole: 'parent',
      status: 'pending',
      createdBy: req.user.id,
    });
    res.status(201).json({ message: 'Tangazo limetumwa, linasubiri approval ya Mkuu wa Shule.', announcement });
  } catch (err) {
    console.error('Announcement error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

// ==== LEAVE REQUESTS - Mwalimu anaidhinisha kwa darasa lake tu ====

router.get('/leave-requests', async (req, res) => {
  try {
    const myAssignments = await ClassAssignment.findAll({ where: { teacherId: req.user.id } });
    const myClassNames = myAssignments.map((a) => a.className);

    const students = await Student.findAll();
    const myStudentIds = students
      .filter((s) => myClassNames.includes(s.className))
      .map((s) => s.id);

    const allRequests = await LeaveRequest.findAll();
    const relevantRequests = allRequests
      .filter((r) => myStudentIds.includes(r.studentId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const enriched = relevantRequests.map((r) => {
      const student = students.find((s) => s.id === r.studentId);
      return { ...r, studentName: student ? student.fullName : 'Haijulikani', className: student ? student.className : '' };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Leave requests error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.put('/leave-requests/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const leaveRequest = await LeaveRequest.findByPk(req.params.id);
    if (!leaveRequest) return res.status(404).json({ error: 'Ombi halijapatikana.' });

    // USALAMA: hakikisha ombi hili ni la mwanafunzi wa darasa analolisimamia huyu mwalimu
    const student = await Student.findByPk(leaveRequest.studentId);
    if (student) {
      const check = await verifyClassOwnership(student.className, req.user.id);
      if (!check.allowed) return res.status(403).json({ error: check.reason });
    }

    await LeaveRequest.update({ status }, { where: { id: Number(req.params.id) } });
    res.json({ message: `Ombi limekuwa ${status}.` });
  } catch (err) {
    console.error('Leave status error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

module.exports = router;
