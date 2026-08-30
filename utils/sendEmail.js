const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // mfano: shuleappmail@gmail.com
    pass: process.env.EMAIL_PASS, // Gmail App Password (herufi 16, bila nafasi)
  },
});

async function sendOtpEmail(toEmail, otp, fullName) {
  await transporter.sendMail({
    from: `"Shule App" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Msimbo wa Kubadilisha Nywila - Shule App',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#4338CA;">Shule App 🎓</h2>
        <p>Habari ${fullName || ''},</p>
        <p>Umeomba kubadilisha nywila yako. Tumia msimbo huu ndani ya dakika 10:</p>
        <div style="background:#EEF2FF; padding:16px; border-radius:8px; text-align:center; margin:16px 0;">
          <span style="font-size:28px; font-weight:bold; letter-spacing:6px; color:#4338CA;">${otp}</span>
        </div>
        <p style="color:#6B7280; font-size:13px;">Kama hukuomba hili, puuza ujumbe huu.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
