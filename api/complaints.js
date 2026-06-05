const { sendJson } = require("./_data");
const store = require("../lib/store");
const { getAuth } = require("../lib/auth");
const { sendTrackingMessage } = require("../lib/notify");

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
        return;
      }
      if (req.method === "POST") {
        const body = req.body || {};
        const created = await store.createComplaint(body);
        sendJson(res, 201, created);
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
    const updated = await store.updateComplaint(id, patch);
    if (!updated) {
      sendJson(res, 404, { error: "Complaint not found" });
      return;
    }

    // Notify the customer when the dealer changes the status. Never block the
    // response on the message send.
    if (Object.prototype.hasOwnProperty.call(patch, "status")) {
      sendTrackingMessage(updated).catch((err) =>
        console.error("notify error:", err && err.message)
      );
    }

    sendJson(res, 200, updated);
  } catch (error) {
    console.error("complaints handler error:", error);
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
