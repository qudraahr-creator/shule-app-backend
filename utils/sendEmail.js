require('dotenv').config();

// Tunatumia Brevo (HTTPS API) kutuma barua pepe, kwa sababu Render (free tier)
// inazuia miunganiko ya SMTP kutoka nje. HTTPS haizuiliwi.
async function sendOtpEmail(toEmail, otp, fullName) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Shule App', email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: fullName || '' }],
      subject: 'Msimbo wa Kubadilisha Nywila - Shule App',
      htmlContent: `
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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

module.exports = { sendOtpEmail };
