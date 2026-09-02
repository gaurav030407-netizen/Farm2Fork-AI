---
name: Supabase Auth workflow secrets
description: Supabase Auth services need URL and anon-key configuration in each runtime that starts the app.
---

The Supabase project URL and anon key must be available to both the FastAPI workflow and the Vite process that builds the browser bundle. The frontend may receive only the URL and anon key; database and service-role credentials remain backend-only.

**Why:** The project snapshot can list stale or missing secret state, and a backend that imports settings eagerly will fail before serving even health endpoints when Auth configuration is absent.

**How to apply:** Check secret existence before restarting Auth services. Keep the Vite config’s public aliases limited to SUPABASE_URL and SUPABASE_ANON_KEY, and verify startup logs after secret changes.