const { sendJson } = require("./_data");
const store = require("../lib/store");
const { getAuth } = require("../lib/auth");
const notify = require("../lib/notify");
const { uploadDataUrl } = require("../lib/storage");
const { runDelayEscalation } = require("../lib/escalate");

// Handles the whole /api/complaints surface in one function:
//   GET   /api/complaints        -> list (public)
//   POST  /api/complaints        -> create (public: customers submit)
//   PATCH /api/complaints/:id    -> update (dealer-only: requires Bearer token)
module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/^\/api\/complaints\/([^/]+)\/?$/);

    // Collection endpoint: /api/complaints
    if (!match) {
      if (req.method === "GET") {
        const complaints = await store.listComplaints();
        sendJson(res, 200, complaints);
        // Lazy 36h escalation, driven by the dealer dashboard's polling.
        runDelayEscalation(complaints).catch((e) => console.error(e.message));
        return;
      }
      if (req.method === "POST") {
        const body = { ...(req.body || {}) };
        const isImport = body._import === true;
        delete body._import;

        if (!isImport) {
          // Move base64 images to Supabase Storage (no-op without keys).
          if (body.billUrl) body.billUrl = await uploadDataUrl(body.billUrl, `${body.id}/bill`);
          if (body.productImageUrl) {
            body.productImageUrl = await uploadDataUrl(body.productImageUrl, `${body.id}/product`);
          }
          // Log the "received" confirmation as an outbound message.
          const text = notify.receivedText(body);
          body.messages = [{ dir: "out", text, at: Date.now() }];
        }

        const created = await store.createComplaint(body);
        sendJson(res, 201, created);

        if (!isImport) {
          notify.sendText(created.phone, notify.receivedText(created)).catch((e) =>
            console.error("notify error:", e.message),
          );
        }
        return;
      }
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    // Item endpoint: /api/complaints/:id  (dealer-protected)
    const id = decodeURIComponent(match[1]);
    if (req.method !== "PATCH") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    if (!getAuth(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const patch = req.body || {};
    const statusChanged = Object.prototype.hasOwnProperty.call(patch, "status");

    // On a status change, log the outbound update so it shows in the Inbox.
    if (statusChanged) {
      const current = (await store.listComplaints()).find((c) => c.id === id);
      const text = notify.statusText({ ...current, ...patch, id });
      const messages = Array.isArray(current && current.messages) ? current.messages : [];
      patch.messages = [...messages, { dir: "out", text, at: Date.now() }];
    }

    const updated = await store.updateComplaint(id, patch);
    if (!updated) {
      sendJson(res, 404, { error: "Complaint not found" });
      return;
    }

    if (statusChanged) {
      notify.sendText(updated.phone, notify.statusText(updated)).catch((err) =>
        console.error("notify error:", err && err.message),
      );
    }

    sendJson(res, 200, updated);
  } catch (error) {
    console.error("complaints handler error:", error);
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
