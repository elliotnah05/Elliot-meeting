// netlify/functions/book.js
// Creates a Google Calendar event and sends Gmail confirmations to both parties

const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const CALENDAR_ID  = process.env.GOOGLE_CALENDAR_ID;
const MY_EMAIL     = process.env.GOOGLE_CALENDAR_ID; // same as calendar ID
const MY_NAME      = 'Elliot Nah';

const AGENDA_LABELS = {
  'Project Collaboration': 'Project Collaboration',
  'Portfolio Review':      'Portfolio Review',
  'Mentorship':            'Mentorship',
  'General Chat':          'General Chat',
  'Other':                 'Other',
};

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildEmail({ to, subject, html }) {
  const raw = [
    `To: ${to}`,
    `From: ${MY_NAME} <${MY_EMAIL}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');
  return toBase64Url(raw);
}

function formatDate(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-SG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function fmt12(t) {
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function confirmationEmailHtml({ name, date, time, agenda, note, isHost }) {
  const formattedDate = formatDate(date);
  const formattedTime = fmt12(time) + ' SGT (UTC+8)';
  const greeting = isHost
    ? `Hi ${MY_NAME},`
    : `Hi ${name},`;
  const intro = isHost
    ? `<b>${name}</b> has just booked a 30-minute Zoom call with you.`
    : `Your 30-minute Zoom call with <b>${MY_NAME}</b> is confirmed.`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:'DM Sans',Arial,sans-serif;color:#f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0e0e0e;border:1px solid #2a2a2e;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#ff5722;padding:28px 36px;">
            <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.7);">Meeting Confirmed</p>
            <h1 style="margin:6px 0 0;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff;">You're booked.</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 24px;font-size:15px;color:#6e6e73;line-height:1.6;">${greeting}<br>${intro}</p>
            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#181818;border:1px solid #2a2a2e;border-radius:6px;overflow:hidden;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;">
                      <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6e73;">Date</span>
                    </td>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;text-align:right;">
                      <span style="font-size:14px;color:#f5f5f7;">${formattedDate}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;">
                      <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6e73;">Time</span>
                    </td>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;text-align:right;">
                      <span style="font-size:14px;color:#f5f5f7;">${formattedTime}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;">
                      <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6e73;">Duration</span>
                    </td>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;text-align:right;">
                      <span style="font-size:14px;color:#f5f5f7;">30 minutes</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;">
                      <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6e73;">Agenda</span>
                    </td>
                    <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;text-align:right;">
                      <span style="font-size:14px;color:#f5f5f7;">${agenda}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6e73;">Format</span>
                    </td>
                    <td style="padding:10px 0;text-align:right;">
                      <span style="font-size:14px;color:#f5f5f7;">Zoom (link via email)</span>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
            ${note ? `<p style="margin:0 0 24px;font-size:14px;color:#6e6e73;line-height:1.6;"><b style="color:#f5f5f7;">Note:</b> ${note}</p>` : ''}
            <p style="margin:0;font-size:13px;color:#6e6e73;line-height:1.6;">
              A <b style="color:#ff5722;">Zoom link</b> will be sent to this email address <b>15 minutes before</b> the meeting starts. Keep an eye on your inbox!
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #2a2a2e;">
            <p style="margin:0;font-size:11px;color:#6e6e73;letter-spacing:.04em;">© ${new Date().getFullYear()} Elliot Nah · Singapore</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { name, email, agenda, note, date, time } = body;
  if (!name || !email || !agenda || !date || !time) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const gmail    = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build event start/end in SGT
    const startDT = new Date(`${date}T${time}:00+08:00`);
    const endDT   = new Date(startDT.getTime() + 30 * 60 * 1000);

    // ── 1. Create Google Calendar event ──────────────────────
    const eventRes = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `Meeting with ${name}`,
        description: `Agenda: ${agenda}${note ? `\n\nNote: ${note}` : ''}\n\nBooked via elliotnah05.netlify.app`,
        start: { dateTime: startDT.toISOString(), timeZone: 'Asia/Singapore' },
        end:   { dateTime: endDT.toISOString(),   timeZone: 'Asia/Singapore' },
        attendees: [
          { email: MY_EMAIL, displayName: MY_NAME },
          { email, displayName: name },
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email',  minutes: 30 },
            { method: 'popup',  minutes: 15 },
          ],
        },
        // Store guest email in extended properties so zoom-reminder can find it
        extendedProperties: {
          private: {
            guestEmail: email,
            guestName:  name,
            zoomSent:   'false',
          },
        },
      },
    });

    const eventId = eventRes.data.id;

    // ── 2. Send confirmation email to GUEST ──────────────────
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: buildEmail({
          to: `${name} <${email}>`,
          subject: `Meeting confirmed — ${formatDate(date)} at ${fmt12(time)} SGT`,
          html: confirmationEmailHtml({ name, date, time, agenda, note, isHost: false }),
        }),
      },
    });

    // ── 3. Send notification email to ELLIOT ─────────────────
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: buildEmail({
          to: `${MY_NAME} <${MY_EMAIL}>`,
          subject: `New booking: ${name} — ${formatDate(date)} at ${fmt12(time)} SGT`,
          html: confirmationEmailHtml({ name, date, time, agenda, note, isHost: true }),
        }),
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, eventId }),
    };
  } catch (err) {
    console.error('book error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Booking failed', detail: err.message }),
    };
  }
};
