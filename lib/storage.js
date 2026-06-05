// Uploads base64 data-URL images to a public Supabase Storage bucket so rows
// stay small. Falls back to returning the data URL unchanged when Supabase
// isn't configured, so the app works without a backend.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "complaint-images";

let client = null;
function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!client) {
    const { createClient } = require("@supabase/supabase-js");
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

// dataUrl -> public URL (or the original value if not an uploadable data URL /
// Supabase is off). `path` is a folder/name prefix, e.g. "CMP-1045/bill".
async function uploadDataUrl(dataUrl, path) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return dataUrl;
  const supabase = getClient();
  if (!supabase) return dataUrl;

  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return dataUrl; // not base64 (e.g. utf8 svg) — keep as-is
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = EXT[contentType] || "bin";
  const key = `${path}.${ext}`.replace(/[^a-zA-Z0-9._/-]/g, "_");

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, buffer, { contentType, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    return data.publicUrl || dataUrl;
  } catch (err) {
    console.error("[storage] upload failed, keeping data URL:", err.message);
    return dataUrl;
  }
}

module.exports = { uploadDataUrl };
