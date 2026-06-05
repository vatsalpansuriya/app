// Twilio SMS / WhatsApp notifications via the REST API (no SDK dependency).
// If Twilio env vars are not configured, messages are logged instead of sent,
// so the rest of the app works before credentials exist.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM; // SMS-capable number e.g. +1XXXXXXXXXX
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886
const APP_URL = process.env.APP_URL || "https://app-customer-name-phone-number-comp.vercel.app";

function isConfigured() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_FROM || TWILIO_WHATSAPP_FROM));
}

function buildMessage(complaint) {
  const link = `${APP_URL}/?track=${encodeURIComponent(complaint.id)}`;
  return (
    `ServiceFlow update for complaint ${complaint.id}\n` +
    `Product: ${complaint.product || "-"}\n` +
    `Status: ${complaint.status}\n` +
    `Track live: ${link}`
  );
}

// Normalises a phone number to E.164-ish (keeps a leading +, strips spaces).
function normalisePhone(phone) {
  if (!phone) return "";
  const trimmed = String(phone).trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

async function sendOne(to, from, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twilio ${res.status}: ${text}`);
  }
  return res.json();
}

// Sends the tracking message via SMS and/or WhatsApp. Never throws — returns
// a small result object describing what happened so the caller can keep going.
async function sendTrackingMessage(complaint) {
  const body = buildMessage(complaint);
  const phone = normalisePhone(complaint.phone);

  if (!isConfigured()) {
    console.log(`[notify:simulated] -> ${phone || "(no phone)"}\n${body}`);
    return { sent: false, simulated: true };
  }
  if (!phone) {
    console.warn(`[notify] complaint ${complaint.id} has no phone number; skipping.`);
    return { sent: false, reason: "no-phone" };
  }

  const results = { sent: true, channels: [] };
  if (TWILIO_FROM) {
    try {
      await sendOne(phone, TWILIO_FROM, body);
      results.channels.push("sms");
    } catch (err) {
      console.error(`[notify] SMS failed for ${complaint.id}:`, err.message);
    }
  }
  if (TWILIO_WHATSAPP_FROM) {
    try {
      await sendOne(`whatsapp:${phone}`, TWILIO_WHATSAPP_FROM, body);
      results.channels.push("whatsapp");
    } catch (err) {
      console.error(`[notify] WhatsApp failed for ${complaint.id}:`, err.message);
    }
  }
  results.sent = results.channels.length > 0;
  return results;
}

module.exports = { sendTrackingMessage, isConfigured };
