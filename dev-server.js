// Local dev server. Serves static files and delegates /api/* to the same
// serverless handlers used on Vercel, so local behaviour matches production.
const http = require("http");
const fs = require("fs");
const path = require("path");

// --- Minimal .env loader (no dependency) -----------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

// Load the real API handlers (same files Vercel runs).
const complaintsHandler = require("./api/complaints");
const authHandler = require("./api/auth");

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response, url) {
  const requestedPath =
    url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(root, requestedPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(data);
  });
}

http
  .createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

    try {
      if (url.pathname.startsWith("/api/")) {
        // Parse the JSON body for write methods, mirroring @vercel/node.
        if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
          request.body = await readBody(request);
        }
        if (url.pathname === "/api/auth") {
          await authHandler(request, response);
          return;
        }
        if (url.pathname.startsWith("/api/complaints")) {
          await complaintsHandler(request, response);
          return;
        }
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      serveStatic(request, response, url);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
  })
  .listen(port, host, () => {
    console.log(`ServiceFlow running at http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
    console.log("For mobile testing, open this computer's LAN IP with the same port.");
  });
