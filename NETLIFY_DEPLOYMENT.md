# Netlify frontend deployment

This deploys only the React/Vite frontend. Node, FastAPI, PostgreSQL/Supabase, and WebSocket signaling remain separately hosted.

Render deployment definitions for the Node API/WebSocket service and FastAPI service are in `render.yaml`. Netlify must not host either backend.

## Netlify settings

- Base directory: repository root (`.`)
- Build command: `pnpm --filter @workspace/farm2fork build`
- Publish directory: `artifacts/farm2fork/dist/public`
- Package manager: pnpm, using the committed `pnpm-lock.yaml`

Render Node service:

- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server build`
- Start: `pnpm --filter @workspace/api-server start`
- Health: `/api/healthz`
- Bind: `0.0.0.0` and Render-provided `PORT`

Render FastAPI service:

- Root directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health: `/health`

`netlify.toml` contains these settings and the Wouter SPA fallback.

## Public environment variables

Set these in Netlify for the deploy context:

- `VITE_API_BASE_URL`: public HTTPS origin of the Node API, for example `https://api.example.com`
- `VITE_WS_BASE_URL`: public WSS origin of the Node API, for example `wss://api.example.com` (optional; derived from the API URL when omitted)

Do not set database URLs, JWT secrets, Supabase service-role keys, TURN credentials, or private API keys as `VITE_*` variables.

For local development, leave both variables unset. Vite keeps the existing `/api` proxy to `http://127.0.0.1:3000`, and signaling uses the local frontend host fallback. For production, the API base must be an HTTPS origin and signaling must resolve to WSS.

The API base may include `/api`; the frontend normalizes it so paths are not duplicated.

For Render, set `FASTAPI_INTERNAL_URL` on the Node service to the FastAPI Render URL. Set `FRONTEND_ORIGINS` on both services to the exact Netlify origin. Set `DATABASE_URL` and `JWT_SECRET` only in Render service environment settings.

## Backend requirements

Configure the separately hosted Node and FastAPI services with the Netlify site origin in `FRONTEND_ORIGINS`, for example:

`FRONTEND_ORIGINS=https://your-site.netlify.app`

Keep localhost origins too when local testing is needed. The Node API must allow credentials for this exact origin, and the auth cookie must be configured for the deployed cross-site HTTPS architecture. The WebSocket endpoint remains `/ws/calls` on the Node API. ICE configuration remains authenticated at `/api/calls/ice-config`.

Important cookie requirement: the current Node implementation uses `SameSite=Lax`, which is suitable for local development but does not send the HttpOnly cookie on cross-site Netlify-to-API requests. For a separately hosted API, the backend auth cookie must use `SameSite=None; Secure` in production while retaining `HttpOnly` and `Path=/`. This backend change is required before cross-origin login and calling can work. Do not move the token to browser storage. Keep `FRONTEND_ORIGINS` restricted to exact Netlify/custom-domain origins and keep credentialed CORS enabled.

## Deploy and update

1. Connect the repository to Netlify.
2. Add the public environment variables above.
3. Deploy using the committed `netlify.toml`.
4. When the API host changes, update `VITE_API_BASE_URL` and, if used, `VITE_WS_BASE_URL`, then redeploy.
5. Add the final custom domain to the backend `FRONTEND_ORIGINS`; no frontend code change is required.

## Phone testing

Open the deployed HTTPS site on a phone and laptop, sign in with existing buyer and farmer accounts, and use a real buyer-owned order. The browser will request microphone permission only when the call starts. Test farmer acceptance, two-way audio, mute/unmute, and end-call behavior from separate authenticated sessions.

## Troubleshooting

- API calls returning CORS errors: verify the exact Netlify origin is in backend `FRONTEND_ORIGINS` and credentials are enabled.
- API requests going to Netlify: verify `VITE_API_BASE_URL` was set before the deploy.
- WebSocket failure: verify `VITE_WS_BASE_URL` is `wss://...` and the Node host serves `/ws/calls`.
- ICE configuration failure: verify authenticated access to `/api/calls/ice-config`; STUN remains the backend fallback when TURN is not configured.
- Microphone unavailable: use HTTPS, grant microphone permission, and check the browser/site device permissions.
- Calls fail on restrictive networks: configure TURN on the backend; TURN credentials must never be placed in frontend source or `VITE_*` variables.
