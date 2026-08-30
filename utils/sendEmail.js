const nodemailer = require('nodemailer');
require('dotenv').config();

// Tunatumia mipangilio ya wazi (siyo shorthand 'service: gmail') na muda mrefu zaidi
// wa kusubiri, kwa sababu baadhi ya seva za bure (kama Render) zinachukua muda
// kuanzisha muunganiko wa SMTP mara ya kwanza.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true kwa port 465 (SSL)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 20000, // sekunde 20 badala ya default (mara nyingi sekunde 10 hazitoshi Render)
  greetingTimeout: 20000,
  socketTimeout: 20000,
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
