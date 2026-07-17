const jwt = require('jsonwebtoken');
require('dotenv').config();

// Hakiki kama mtumiaji ame-login (ana token sahihi)
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Huna ruhusa. Tafadhali login kwanza.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token si sahihi au imeisha muda.' });
  }
}

// Hakiki kama mtumiaji ana role sahihi (parent/teacher/head_teacher)
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Huna ruhusa ya kufanya kitendo hiki.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
