// netlify/functions/zoom-reminder.js
// Scheduled function — runs every 5 minutes via netlify.toml cron
// Finds meetings starting in ~15 min, creates Zoom link, emails both parties

const { google } = require('googleapis');
const https = require('https');

// ── Google Auth ───────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const MY_EMAIL    = process.env.GOOGLE_CALENDAR_ID;
const MY_NAME     = 'Elliot Nah';

// ── Zoom helpers ─────────────────────────────────────────────
async function getZoomAccessToken() {
  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  return new Promise((resolve, reject) => {
    const postData = `grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`;
    const options = {
      hostname: 'zoom.us',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).access_token); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function createZoomMeeting({ topic, startTime, duration = 30, accessToken }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      topic,
      type: 2, // scheduled
      start_time: startTime, // ISO string UTC
      duration,
      timezone: 'Asia/Singapore',
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        waiting_room: true,
        auto_recording: 'none',
      },
    });

    const options = {
      hostname: 'api.zoom.us',
      path: '/v2/users/me/meetings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Email helpers ─────────────────────────────────────────────
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

function zoomEmailHtml({ name, joinUrl, startTime, isHost }) {
  const greeting = isHost ? `Hi ${MY_NAME},` : `Hi ${name},`;
  const intro    = isHost
    ? `Your meeting with <b>${name}</b> starts in <b>15 minutes</b>. Here's your Zoom link:`
    : `Your meeting with <b>${MY_NAME}</b> starts in <b>15 minutes</b>. Here's your Zoom link:`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:'DM Sans',Arial,sans-serif;color:#f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0e0e0e;border:1px solid #2a2a2e;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#ff5722;padding:28px 36px;">
            <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.7);">Starting Soon</p>
            <h1 style="margin:6px 0 0;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff;">Your Zoom link is ready.</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 28px;font-size:15px;color:#6e6e73;line-height:1.6;">${greeting}<br>${intro}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${joinUrl}" style="display:inline-block;background:#ff5722;color:#fff;font-size:15px;font-weight:700;letter-spacing:.02em;padding:16px 40px;border-radius:100px;text-decoration:none;">
                  Join Zoom Meeting →
                </a>
              </td></tr>
            </table>
            <p style="margin:28px 0 0;font-size:12px;color:#6e6e73;text-align:center;line-height:1.6;">
              Or copy this link:<br>
              <a href="${joinUrl}" style="color:#ff8a65;word-break:break-all;">${joinUrl}</a>
            </p>
          </td>
        </tr>
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

// ── Main handler ──────────────────────────────────────────────
exports.handler = async () => {
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const gmail    = google.gmail({ version: 'v1', auth: oauth2Client });

    // Look for events starting between 14 and 16 minutes from now
    const now     = new Date();
    const winStart = new Date(now.getTime() + 14 * 60 * 1000);
    const winEnd   = new Date(now.getTime() + 16 * 60 * 1000);

    const eventsRes = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: winStart.toISOString(),
      timeMax: winEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = eventsRes.data.items || [];
    if (events.length === 0) {
      return { statusCode: 200, body: 'No upcoming meetings in window.' };
    }

    const zoomToken = await getZoomAccessToken();

    for (const evt of events) {
      // Only process events booked via the portfolio (has guestEmail in extendedProperties)
      const props     = evt.extendedProperties?.private || {};
      const guestEmail = props.guestEmail;
      const guestName  = props.guestName || 'Guest';
      const zoomSent   = props.zoomSent === 'true';

      if (!guestEmail || zoomSent) continue; // skip if already sent or not a portfolio booking

      // Create Zoom meeting
      const zoomMeeting = await createZoomMeeting({
        topic: evt.summary || `Meeting with ${guestName}`,
        startTime: evt.start.dateTime || evt.start.date,
        accessToken: zoomToken,
      });

      const joinUrl = zoomMeeting.join_url;
      if (!joinUrl) {
        console.error('Zoom meeting creation failed:', zoomMeeting);
        continue;
      }

      // Send Zoom link to GUEST
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: buildEmail({
            to: `${guestName} <${guestEmail}>`,
            subject: `Your Zoom link — meeting starts in 15 minutes`,
            html: zoomEmailHtml({ name: guestName, joinUrl, isHost: false }),
          }),
        },
      });

      // Send Zoom link to ELLIOT
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: buildEmail({
            to: `${MY_NAME} <${MY_EMAIL}>`,
            subject: `Your Zoom link — meeting with ${guestName} starts in 15 minutes`,
            html: zoomEmailHtml({ name: guestName, joinUrl, isHost: true }),
          }),
        },
      });

      // Mark event as zoom sent so we don't double-send
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: evt.id,
        requestBody: {
          extendedProperties: {
            private: { ...props, zoomSent: 'true', zoomUrl: joinUrl },
          },
        },
      });

      console.log(`Zoom sent for event ${evt.id} to ${guestEmail}`);
    }

    return { statusCode: 200, body: `Processed ${events.length} event(s).` };
  } catch (err) {
    console.error('zoom-reminder error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
