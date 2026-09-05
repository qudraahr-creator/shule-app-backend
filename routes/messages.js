const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const ClassAssignment = require('../models/ClassAssignment');
const Message = require('../models/Message');
const sendPushNotification = require('../utils/sendPushNotification');

router.use(authenticate);

router.post('/push/register', async (req, res) => {
  try {
    const { pushToken } = req.body;
    await User.update({ pushToken }, { where: { id: req.user.id } });
    res.json({ message: 'Push token imesajiliwa.' });
  } catch (err) {
    console.error('Push register error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.get('/messages/contacts', async (req, res) => {
  try {
    const users = await User.findAll({ where: { schoolId: req.user.schoolId } });
    let contacts = [];

    if (req.user.role === 'parent') {
      const children = await Student.findAll({ where: { parentId: req.user.id, schoolId: req.user.schoolId } });
      const classNames = [...new Set(children.map((c) => c.className))];
      const assignments = await ClassAssignment.findAll({ where: { schoolId: req.user.schoolId } });
      const teacherIds = assignments.filter((a) => classNames.includes(a.className)).map((a) => a.teacherId);
      contacts = users.filter((u) => teacherIds.includes(u.id));
    } else if (req.user.role === 'teacher') {
      const myAssignments = await ClassAssignment.findAll({ where: { teacherId: req.user.id, schoolId: req.user.schoolId } });
      const myClassNames = myAssignments.map((a) => a.className);
      const students = await Student.findAll({ where: { schoolId: req.user.schoolId } });
      const parentIds = [...new Set(
        students.filter((s) => myClassNames.includes(s.className) && s.parentId).map((s) => s.parentId)
      )];
      contacts = users.filter((u) => parentIds.includes(u.id));
    } else if (req.user.role === 'head_teacher' || req.user.role === 'deputy_head_teacher') {
      contacts = users.filter((u) => u.id !== req.user.id);
    }

    res.json(contacts.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role })));
  } catch (err) {
    console.error('Contacts error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.get('/messages/conversations', async (req, res) => {
  try {
    const allMessages = await Message.findAll();
    const myMessages = allMessages.filter((m) => m.senderId === req.user.id || m.receiverId === req.user.id);
    const partnerIds = [...new Set(myMessages.map((m) => (m.senderId === req.user.id ? m.receiverId : m.senderId)))];

    const users = await User.findAll({ where: { schoolId: req.user.schoolId } });
    const conversations = partnerIds
      .filter((partnerId) => users.some((u) => u.id === partnerId)) // USALAMA: partner lazima awe wa shule hii hii
      .map((partnerId) => {
        const partner = users.find((u) => u.id === partnerId);
        const thread = myMessages
          .filter((m) => m.senderId === partnerId || m.receiverId === partnerId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const lastMessage = thread[0];
        const unreadCount = thread.filter((m) => m.receiverId === req.user.id && !m.read).length;
        return {
          partnerId, partnerName: partner.fullName, partnerRole: partner.role,
          lastMessage: lastMessage ? lastMessage.content : '',
          lastMessageAt: lastMessage ? lastMessage.createdAt : null,
          unreadCount,
        };
      }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json(conversations);
  } catch (err) {
    console.error('Conversations error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.get('/messages/:partnerId', async (req, res) => {
  try {
    const partnerId = Number(req.params.partnerId);

    // USALAMA: partner lazima awe wa shule hii hii
    const partner = await User.findByPk(partnerId);
    if (!partner || partner.schoolId !== req.user.schoolId) {
      return res.status(403).json({ error: 'Huwezi kuongea na mtumiaji huyu.' });
    }

    const allMessages = await Message.findAll();
    const thread = allMessages
      .filter((m) =>
        (m.senderId === req.user.id && m.receiverId === partnerId) ||
        (m.senderId === partnerId && m.receiverId === req.user.id))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    await Message.update({ read: true }, { where: { senderId: partnerId, receiverId: req.user.id } });
    res.json(thread);
  } catch (err) {
    console.error('Thread error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content) return res.status(400).json({ error: 'Weka mpokeaji na ujumbe.' });

    const receiver = await User.findByPk(receiverId);
    if (!receiver || receiver.schoolId !== req.user.schoolId) {
      return res.status(403).json({ error: 'Huwezi kutuma ujumbe kwa mtumiaji huyu.' });
    }

    const message = await Message.create({ senderId: req.user.id, receiverId: Number(receiverId), content, read: false });

    const sender = await User.findByPk(req.user.id);
    if (receiver.pushToken) {
      sendPushNotification(receiver.pushToken, `Ujumbe kutoka kwa ${sender.fullName}`, content, { type: 'message', senderId: req.user.id });
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err.message);
    res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
  }
});

module.exports = router;
