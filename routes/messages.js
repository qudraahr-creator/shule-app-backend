const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const ClassAssignment = require('../models/ClassAssignment');
const Message = require('../models/Message');
const sendPushNotification = require('../utils/sendPushNotification');

router.use(authenticate); // role yoyote iliyo-login inaweza kutumia hizi routes

// Sajili push token ya mtumiaji (baada ya login)
router.post('/push/register', async (req, res) => {
  try {
    const { pushToken } = req.body;
    await User.update({ pushToken }, { where: { id: req.user.id } });
    res.json({ message: 'Push token imesajiliwa.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ona watu ninaoweza kuwasiliana nao (kutegemea role)
router.get('/messages/contacts', async (req, res) => {
  try {
    const users = await User.findAll();
    let contacts = [];

    if (req.user.role === 'parent') {
      // Mzazi anaongea na walimu wa madarasa ya watoto wake
      const children = await Student.findAll({ where: { parentId: req.user.id } });
      const classNames = [...new Set(children.map((c) => c.className))];
      const assignments = await ClassAssignment.findAll();
      const teacherIds = assignments
        .filter((a) => classNames.includes(a.className))
        .map((a) => a.teacherId);
      contacts = users.filter((u) => teacherIds.includes(u.id));
    } else if (req.user.role === 'teacher') {
      // Mwalimu anaongea na wazazi wa wanafunzi wa darasa lake
      const myAssignments = await ClassAssignment.findAll({ where: { teacherId: req.user.id } });
      const myClassNames = myAssignments.map((a) => a.className);
      const students = await Student.findAll();
      const parentIds = [...new Set(
        students.filter((s) => myClassNames.includes(s.className) && s.parentId).map((s) => s.parentId)
      )];
      contacts = users.filter((u) => parentIds.includes(u.id));
    } else if (req.user.role === 'head_teacher') {
      // Mkuu anaweza kuongea na kila mtu
      contacts = users.filter((u) => u.id !== req.user.id);
    }

    res.json(contacts.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ona mazungumzo yote (conversations) yenye ujumbe wa mwisho
router.get('/messages/conversations', async (req, res) => {
  try {
    const allMessages = await Message.findAll();
    const myMessages = allMessages.filter(
      (m) => m.senderId === req.user.id || m.receiverId === req.user.id
    );

    const partnerIds = [...new Set(
      myMessages.map((m) => (m.senderId === req.user.id ? m.receiverId : m.senderId))
    )];

    const users = await User.findAll();
    const conversations = partnerIds.map((partnerId) => {
      const partner = users.find((u) => u.id === partnerId);
      const thread = myMessages
        .filter((m) => m.senderId === partnerId || m.receiverId === partnerId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const lastMessage = thread[0];
      const unreadCount = thread.filter((m) => m.receiverId === req.user.id && !m.read).length;

      return {
        partnerId,
        partnerName: partner ? partner.fullName : 'Haijulikani',
        partnerRole: partner ? partner.role : '',
        lastMessage: lastMessage ? lastMessage.content : '',
        lastMessageAt: lastMessage ? lastMessage.createdAt : null,
        unreadCount,
      };
    }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ona ujumbe wote kati yangu na mtu fulani
router.get('/messages/:partnerId', async (req, res) => {
  try {
    const partnerId = Number(req.params.partnerId);
    const allMessages = await Message.findAll();
    const thread = allMessages
      .filter(
        (m) =>
          (m.senderId === req.user.id && m.receiverId === partnerId) ||
          (m.senderId === partnerId && m.receiverId === req.user.id)
      )
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Weka alama "read" kwa ujumbe niliopokea
    await Message.update({ read: true }, { where: { senderId: partnerId, receiverId: req.user.id } });

    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tuma ujumbe mpya
router.post('/messages', async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content) {
      return res.status(400).json({ error: 'Weka mpokeaji na ujumbe.' });
    }

    const message = await Message.create({
      senderId: req.user.id,
      receiverId: Number(receiverId),
      content,
      read: false,
    });

    // Tuma push notification kwa mpokeaji
    const receiver = await User.findByPk(receiverId);
    const sender = await User.findByPk(req.user.id);
    if (receiver?.pushToken) {
      sendPushNotification(
        receiver.pushToken,
        `Ujumbe kutoka kwa ${sender.fullName}`,
        content,
        { type: 'message', senderId: req.user.id }
      );
    }

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
