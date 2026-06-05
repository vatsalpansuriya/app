// Twilio SMS / WhatsApp notifications via the REST API (no SDK dependency).
// If Twilio env vars are not configured, messages are logged instead of sent,
// so the rest of the app works before credentials exist.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM; // SMS-capable number e.g. +1XXXXXXXXXX
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886
const DEALER_ALERT_PHONE = process.env.DEALER_ALERT_PHONE; // optional dealer copy
const APP_URL = process.env.APP_URL || "https://app-customer-name-phone-number-comp.vercel.app";

function isConfigured() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_FROM || TWILIO_WHATSAPP_FROM));
}

function trackingLink(complaint) {
  return `${APP_URL}/?track=${encodeURIComponent(complaint.id)}`;
}

// ---- Message text builders (sync, so callers can log them immediately) ----
function statusText(complaint) {
  return (
    `ServiceFlow update for ${complaint.id}\n` +
    `Product: ${complaint.product || "-"}\n` +
    `Status: ${complaint.status}\n` +
    `Track live: ${trackingLink(complaint)}`
  );
}

function receivedText(complaint) {
  return (
    `Hi ${complaint.name || "there"}, we received your complaint ${complaint.id} ` +
    `for ${complaint.product || "your product"}.\n` +
    `We'll keep you updated. Track live: ${trackingLink(complaint)}`
  );
}

function delayText(complaint) {
  return (
    `Update on ${complaint.id}: this is taking longer than expected (over 36h). ` +
    `Our team has been alerted and will prioritise it.\n` +
    `Track live: ${trackingLink(complaint)}`
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

// Core dispatch to a customer phone via SMS and/or WhatsApp. Never throws.
async function sendText(phoneRaw, body) {
  const phone = normalisePhone(phoneRaw);
  if (!isConfigured()) {
    console.log(`[notify:simulated] -> ${phone || "(no phone)"}\n${body}`);
    return { sent: false, simulated: true };
  }
  if (!phone) return { sent: false, reason: "no-phone" };

  const results = { sent: true, channels: [] };
  if (TWILIO_FROM) {
    try {
      await sendOne(phone, TWILIO_FROM, body);
      results.channels.push("sms");
    } catch (err) {
      console.error("[notify] SMS failed:", err.message);
    }
  }
  if (TWILIO_WHATSAPP_FROM) {
    try {
      await sendOne(`whatsapp:${phone}`, TWILIO_WHATSAPP_FROM, body);
      results.channels.push("whatsapp");
    } catch (err) {
      console.error("[notify] WhatsApp failed:", err.message);
    }
  }
  results.sent = results.channels.length > 0;
  return results;
}

// Dealer reply — prefer WhatsApp (the channel the customer wrote on), fall back to SMS.
async function sendWhatsappText(phoneRaw, body) {
  const phone = normalisePhone(phoneRaw);
  if (!isConfigured()) {
    console.log(`[reply:simulated] -> ${phone || "(no phone)"}\n${body}`);
    return { sent: false, simulated: true };
  }
  if (!phone) return { sent: false, reason: "no-phone" };
  try {
    if (TWILIO_WHATSAPP_FROM) {
      await sendOne(`whatsapp:${phone}`, TWILIO_WHATSAPP_FROM, body);
      return { sent: true, channels: ["whatsapp"] };
    }
    if (TWILIO_FROM) {
      await sendOne(phone, TWILIO_FROM, body);
      return { sent: true, channels: ["sms"] };
    }
  } catch (err) {
    console.error("[reply] failed:", err.message);
  }
  return { sent: false };
}

// Optional dealer copy when a complaint breaches the 36h SLA.
async function alertDealer(complaint) {
  if (!DEALER_ALERT_PHONE) return;
  await sendText(DEALER_ALERT_PHONE, `[Dealer alert] ${complaint.id} is delayed (>36h). ${trackingLink(complaint)}`);
}

module.exports = {
  isConfigured,
  statusText,
  receivedText,
  delayText,
  sendText,
  sendWhatsappText,
  alertDealer,
  // Back-compat convenience: send a status update and return the text.
  async sendTrackingMessage(complaint) {
    const body = statusText(complaint);
    await sendText(complaint.phone, body);
    return body;
  },
};
