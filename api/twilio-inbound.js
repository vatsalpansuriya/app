// Twilio inbound webhook (public). Configure your Twilio Messaging service /
// number to POST incoming SMS/WhatsApp here. Twilio sends
// application/x-www-form-urlencoded with From/Body. We attach the message to the
// customer's most-recent open complaint and reply with empty TwiML.
const store = require("../lib/store");

function normalisePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

module.exports = async function handler(req, res) {
  try {
    // @vercel/node parses urlencoded into req.body; dev-server sets it too.
    const body = req.body || {};
    const from = normalisePhone(String(body.From || "").replace(/^whatsapp:/i, ""));
    const text = String(body.Body || "").trim();

    if (from && text) {
      const complaints = await store.listComplaints();
      // Prefer the most recent open complaint for this phone, else most recent.
      const mine = complaints
        .filter((c) => normalisePhone(c.phone) === from)
        .sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt));
      const target =
        mine.find((c) => c.status !== "Solved" && c.status !== "Rejected") || mine[0];

      if (target) {
        const messages = Array.isArray(target.messages) ? target.messages : [];
        await store.updateComplaint(target.id, {
          messages: [...messages, { dir: "in", text, at: Date.now() }],
        });
        console.log(`[inbound] ${from} -> ${target.id}: ${text}`);
      } else {
        console.log(`[inbound] ${from} (no matching complaint): ${text}`);
      }
    }
  } catch (error) {
    console.error("inbound webhook error:", error.message);
  }

  // Always 200 with empty TwiML so Twilio doesn't retry.
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.end("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
};
