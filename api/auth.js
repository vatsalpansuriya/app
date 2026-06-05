const { sendJson } = require("./_data");
const { checkPassword, signToken } = require("../lib/auth");

// POST /api/auth  { password }  ->  { token }  (dealer login)
module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const body = req.body || {};
  if (!checkPassword(body.password)) {
    sendJson(res, 401, { error: "Invalid password" });
    return;
  }
  sendJson(res, 200, { token: signToken("dealer") });
};
