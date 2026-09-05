require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const parentRoutes = require('./routes/parent');
const teacherRoutes = require('./routes/teacher');
const headTeacherRoutes = require('./routes/headteacher');
const messagesRoutes = require('./routes/messages');
const superAdminRoutes = require('./routes/superadmin');

const app = express();

// MUHIMU: Render inatumia reverse proxy, tunahitaji kuiambia Express iamini
// header ya X-Forwarded-For ili express-rate-limit ipate IP sahihi ya mtumiaji.
app.set('trust proxy', 1);

app.use(helmet()); // usalama wa msingi wa HTTP headers
app.use(cors()); // TODO: kabla ya production halisi, punguza 'origin' kwa domain maalum

// Rate limiting ya jumla kwa API nzima (dhidi ya matumizi mabaya/DoS)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Karibu kwenye Shule App API 🎓' });
});

app.use('/api/auth', authRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/head', headTeacherRoutes);
app.use('/api/super', superAdminRoutes);
app.use('/api', messagesRoutes);

// Generic error handler ya mwisho (haitoi error details kwa mtumiaji)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Hitilafu ya ndani ya server.' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('✅ Database (lowdb) iko tayari: database.json');
  console.log(`🚀 Server inaendesha kwenye port ${PORT}`);
});
