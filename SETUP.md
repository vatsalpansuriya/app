# ServiceFlow — Setup Guide

ServiceFlow is a vanilla HTML/CSS/JS app with Vercel serverless functions. It
persists complaints in **Supabase**, gates the Dealer Dashboard behind a single
**dealer password**, and sends **Twilio SMS/WhatsApp** tracking links when a
dealer changes a complaint's status.

Everything degrades gracefully: with no Supabase keys it uses an in-memory demo
store, and with no Twilio keys it logs messages instead of sending them.

---

## 1. Install & run locally

```bash
npm install
cp .env.example .env   # then edit .env (PowerShell: copy .env.example .env)
npm run dev            # http://localhost:4173
```

`dev-server.js` auto-loads `.env` and runs the same handlers Vercel uses.

---

## 2. Supabase (database)

1. Create a free project at https://supabase.com.
2. In **Settings → API**, copy the **Project URL** and the **`service_role`**
   key into `.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   (The service-role key is secret and used only by the server.)
3. In **SQL Editor**, run:

```sql
create table if not exists complaints (
  id            text primary key,
  status        text,
  submitted_at  int8,
  data          jsonb not null,
  created_at    timestamptz default now()
);

-- Service-role access bypasses RLS, but enabling it is good hygiene:
alter table complaints enable row level security;
```

Complaint images are stored as base64 data URLs inside `data`. For large volumes
you can later move them to Supabase Storage and keep only URLs in `data`.

---

## 3. Dealer login

- `DEALER_PASSWORD` — the password dealers type to unlock the dashboard.
- `AUTH_SECRET` — any long random string used to sign session tokens.

If unset, dev defaults are used (`serviceflow-dev` / an insecure secret) — fine
for local testing, but **always set real values in production**.

The Dealer Dashboard is hidden until login. `PATCH /api/complaints/:id`
(status changes) requires a valid token; customer submissions stay public.

---

## 4. Twilio SMS / WhatsApp (optional)

1. Create an account at https://twilio.com and copy the **Account SID** and
   **Auth Token** into `.env`.
2. Set `TWILIO_FROM` to an SMS-capable Twilio number, and/or
   `TWILIO_WHATSAPP_FROM` to your WhatsApp sender (the sandbox value
   `whatsapp:+14155238886` works to start).
3. Set `APP_URL` to your deployed URL so tracking links resolve.

When a dealer changes a complaint's status, the customer receives a message with
a live tracking link: `${APP_URL}/?track=<complaint-id>`. Without Twilio keys,
the message is logged to the server console instead of sent.

---

## 5. Deploy to Vercel

Set the same variables on Vercel (Project → Settings → Environment Variables, or
via CLI), then deploy:

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add DEALER_PASSWORD production
vercel env add AUTH_SECRET production
vercel env add TWILIO_ACCOUNT_SID production
vercel env add TWILIO_AUTH_TOKEN production
vercel env add TWILIO_FROM production
vercel env add TWILIO_WHATSAPP_FROM production
vercel env add APP_URL production

vercel --prod
```

(Repeat for the `preview`/`development` environments as needed.)
