// netlify/functions/get-slots.js
// Returns booked time slots for a given date by checking Google Calendar

const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID; // elliotnah05@gmail.com
const SGT_OFFSET = 8 * 60; // UTC+8 in minutes

// All possible slots (SGT times)
const ALL_SLOTS = [
  '10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30',
  '16:00','16:30'
];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { date } = event.queryStringParameters || {};
  if (!date) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'date param required (YYYY-MM-DD)' }) };
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Build day start/end in SGT → UTC
    const dayStartSGT = new Date(`${date}T00:00:00+08:00`);
    const dayEndSGT   = new Date(`${date}T23:59:59+08:00`);

    // Fetch busy blocks via freebusy
    const freebusyRes = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStartSGT.toISOString(),
        timeMax: dayEndSGT.toISOString(),
        timeZone: 'Asia/Singapore',
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busyBlocks = freebusyRes.data.calendars[CALENDAR_ID]?.busy || [];

    // Figure out which slots overlap with any busy block
    const booked = ALL_SLOTS.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const slotStart = new Date(`${date}T${slot}:00+08:00`);
      const slotEnd   = new Date(slotStart.getTime() + 30 * 60 * 1000);

      return busyBlocks.some(block => {
        const blockStart = new Date(block.start);
        const blockEnd   = new Date(block.end);
        // Overlap if slot starts before block ends AND slot ends after block starts
        return slotStart < blockEnd && slotEnd > blockStart;
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ date, booked }),
    };
  } catch (err) {
    console.error('get-slots error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch availability', detail: err.message }),
    };
  }
};
