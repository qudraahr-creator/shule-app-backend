// Tuma push notification kwa mtumiaji mmoja kupitia Expo Push API
async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken) return; // mtumiaji hajasajili push token bado

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
  } catch (err) {
    console.log('Imeshindwa kutuma push notification:', err.message);
  }
}

module.exports = sendPushNotification;
