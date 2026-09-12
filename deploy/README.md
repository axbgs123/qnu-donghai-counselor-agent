# ECS deployment

The ECS host runs the built vinext Worker locally through Wrangler/Miniflare.
Nginx exposes the application on port 80, while the application and Qdrant only
listen on the loopback interface.

Persistent paths:

- `/var/lib/qz-zhifu/wrangler`: D1 and R2 local state
- `/var/lib/qdrant`: Qdrant collection data
- `/opt/qz-zhifu/shared/.env.production`: server-only environment settings
- `/var/log/qz-zhifu`: application logs
- `/var/backups/qz-zhifu`: daily D1 backups, retained for seven days

The `qz-zhifu.service` unit restarts the application after failures and server
reboots. `qz-zhifu-ocr.service` provides the streaming upload path used by
MinerU OCR so large scanned PDFs bypass the Worker request-size limit. Deploy a
new build by replacing `/opt/qz-zhifu/current`, installing the locked
dependencies, and restarting both services. Add `MINERU_TOKEN=...` to the
production environment file to enable precision OCR for PDFs above 10 MB or 20
pages; without a token the free flash mode remains available.

`qz-zhifu-backup.timer` runs an online SQLite backup every day at 03:30 and
deletes backup files older than seven days.
