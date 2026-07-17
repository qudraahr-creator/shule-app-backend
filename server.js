require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const parentRoutes = require('./routes/parent');
const teacherRoutes = require('./routes/teacher');
const headTeacherRoutes = require('./routes/headteacher');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Karibu kwenye Shule App API 🎓' });
});

app.use('/api/auth', authRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/head', headTeacherRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Database (lowdb) iko tayari: database.json`);
  console.log(`🚀 Server inaendesha kwenye port ${PORT}`);
});
