# PM2 Operations Runbook

This runbook documents how to operate the LinZhi services under PM2. The
configuration is defined in `ecosystem.config.js` and supervises the
API (`linzhi-api`) and the Next.js frontend (`linzhi-web`).

## Prerequisites
- Node.js 18+
- PM2 v5+
- The repository checked out to a writable location

## Bootstrapping the Process Manager
```bash
pm2 start ecosystem.config.js
pm2 save
```

The ecosystem file launches:
- **linzhi-api** – Express API bound to `127.0.0.1:8000`
- **linzhi-web** – Next.js server bound to `127.0.0.1:3000`

## Day-to-day Operations

### Listing Status
```bash
pm2 ls
```
Only `linzhi-api` and `linzhi-web` should be listed as `online`.

### Restarting Services
```bash
pm2 restart linzhi-api
pm2 restart linzhi-web
```
Restart both together with:
```bash
pm2 restart all
```

### Starting and Stopping
```bash
pm2 stop linzhi-api
pm2 stop linzhi-web
pm2 start linzhi-api
pm2 start linzhi-web
```
To stop everything:
```bash
pm2 stop all
```

### Viewing Logs
```bash
pm2 logs linzhi-api
pm2 logs linzhi-web
```
Log files are stored under `~/.pm2/logs/` with `out` and `error` suffixes per
process.

## Verification Script
Run `bash scripts/tools/pm2_verify.sh` to assert that:
1. Only the two managed apps are online.
2. Ports `8000` and `3000` are listening with Node.js processes.
3. `http://127.0.0.1:8000/readyz` and `http://127.0.0.1:3000/` respond with `200`.

## Common Pitfalls
- **Port conflicts**: Ensure no other process binds to `3000` or `8000` before
  starting PM2. Use `ss -ltnp` to diagnose conflicts.
- **Stale processes**: After modifying the ecosystem configuration, run
  `pm2 delete all` before restarting to avoid legacy processes lingering.
- **Environment variables**: The ecosystem sets `NODE_ENV=production` for both
  apps. Override per-process with `pm2 start ... --env KEY=value` if necessary.
- **Persistence**: After any configuration change, run `pm2 save` so that
  restarts (e.g., via `pm2 resurrect`) restore the current state.

## Troubleshooting Checklist
1. Run the verification script.
2. Inspect logs via `pm2 logs <app>`.
3. Check systemd or cron restarts to ensure PM2 itself is being kept alive.
4. Confirm database and Redis dependencies if readiness checks fail.

