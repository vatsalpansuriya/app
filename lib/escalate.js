// Lazy 36-hour delay escalation. Called (fire-and-forget) from GET /api/complaints;
// the dealer dashboard's polling drives it. The `delayNotified` flag makes it
// one-shot per complaint, so no cron is required.
const store = require("./store");
const notify = require("./notify");

const DELAY_LIMIT_MS = 36 * 60 * 60 * 1000;

function isDelayed(complaint) {
  if (!complaint || complaint.status === "Solved" || complaint.status === "Rejected") return false;
  return Date.now() - Number(complaint.submittedAt || 0) >= DELAY_LIMIT_MS;
}

let running = false;

async function runDelayEscalation(complaints) {
  if (running) return; // avoid overlapping runs within one warm instance
  running = true;
  try {
    const list = complaints || (await store.listComplaints());
    const due = list.filter((c) => isDelayed(c) && !c.delayNotified);
    for (const complaint of due) {
      const text = notify.delayText(complaint);
      const message = { dir: "out", text, at: Date.now() };
      const messages = Array.isArray(complaint.messages) ? complaint.messages : [];
      await store.updateComplaint(complaint.id, {
        delayNotified: true,
        messages: [...messages, message],
      });
      // Fire the actual sends without blocking the loop's persistence.
      notify.sendText(complaint.phone, text).catch((e) => console.error(e.message));
      notify.alertDealer(complaint).catch((e) => console.error(e.message));
      console.log(`[escalate] ${complaint.id} delayed >36h — alert sent.`);
    }
  } catch (err) {
    console.error("[escalate] error:", err.message);
  } finally {
    running = false;
  }
}

module.exports = { runDelayEscalation, isDelayed };
