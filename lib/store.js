// Data layer for complaints.
// Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
// otherwise falls back to the in-memory store so the app still runs
// locally / in CI without a database.
const { getStore } = require("../api/_data");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = "complaints";

let supabase = null;
function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!supabase) {
    // Lazy require so the app runs even if the dependency isn't installed
    // in the in-memory fallback scenario.
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

function isDbEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// A DB row is { id, status, submitted_at, data }. The full complaint object
// lives in `data`; we surface id/status/submitted_at for ordering + filtering.
function rowToComplaint(row) {
  return { ...(row.data || {}), id: row.id, status: row.status, submittedAt: Number(row.submitted_at) };
}

function complaintToRow(complaint) {
  return {
    id: complaint.id,
    status: complaint.status,
    submitted_at: complaint.submittedAt,
    data: complaint,
  };
}

async function listComplaints() {
  const client = getClient();
  if (!client) {
    return getStore().complaints;
  }
  const { data, error } = await client
    .from(TABLE)
    .select("id,status,submitted_at,data")
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(`Supabase list failed: ${error.message}`);
  return (data || []).map(rowToComplaint);
}

async function createComplaint(complaint) {
  const client = getClient();
  if (!client) {
    getStore().complaints.unshift(complaint);
    return complaint;
  }
  const { error } = await client.from(TABLE).insert(complaintToRow(complaint));
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return complaint;
}

async function updateComplaint(id, patch) {
  const client = getClient();
  if (!client) {
    const complaint = getStore().complaints.find((item) => item.id === id);
    if (!complaint) return null;
    Object.assign(complaint, patch);
    return complaint;
  }
  // Read-merge-write so the jsonb `data` blob stays consistent.
  const { data: rows, error: readError } = await client
    .from(TABLE)
    .select("id,status,submitted_at,data")
    .eq("id", id)
    .limit(1);
  if (readError) throw new Error(`Supabase read failed: ${readError.message}`);
  if (!rows || rows.length === 0) return null;

  const merged = { ...rowToComplaint(rows[0]), ...patch };
  const { error: writeError } = await client
    .from(TABLE)
    .update(complaintToRow(merged))
    .eq("id", id);
  if (writeError) throw new Error(`Supabase update failed: ${writeError.message}`);
  return merged;
}

module.exports = { listComplaints, createComplaint, updateComplaint, isDbEnabled };
