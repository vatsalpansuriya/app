const { sendJson } = require("./_data");
const store = require("../lib/store");
const { getAuth } = require("../lib/auth");
const { sendWhatsappText } = require("../lib/notify");

// POST /api/reply  { id, text }  (dealer-only) — sends a WhatsApp/SMS reply to
// the customer and logs it on the complaint's conversation.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!getAuth(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  try {
    const { id, text } = req.body || {};
    if (!id || !text || !String(text).trim()) {
      sendJson(res, 400, { error: "id and text are required" });
      return;
    }
    const complaint = (await store.listComplaints()).find((c) => c.id === id);
    if (!complaint) {
      sendJson(res, 404, { error: "Complaint not found" });
      return;
    }
    const messages = Array.isArray(complaint.messages) ? complaint.messages : [];
    const message = { dir: "out", text: String(text).trim(), at: Date.now() };
    const updated = await store.updateComplaint(id, { messages: [...messages, message] });

    sendWhatsappText(complaint.phone, message.text).catch((e) =>
      console.error("reply send error:", e.message),
    );
    sendJson(res, 200, updated);
  } catch (error) {
    console.error("reply handler error:", error.message);
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
