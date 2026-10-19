# Public-cloud deployment

This project is packaged for a single Docker web service. The Express API,
React client, and the private Python face-recognition worker run together;
only port 3000 is exposed. Face records are kept on the host's persistent
disk and are not included in the Docker image.

## Before first deployment

1. Create a private source repository. Do not commit `.env` files or `data/`.
2. Create a Docker web service from this repository (the included
   `render.yaml` is a Render blueprint).
3. Attach a persistent disk at `/var/data` and run exactly one application
   instance. The current JSON store is single-instance storage, not a shared
   database.
4. Set all three `INITIAL_ADMIN_*` values as secrets. The password must be
   unique and at least 12 characters. Leave `APP_URL` empty when the React
   client and API use this same public URL; set it only for a separate trusted
   frontend origin.
5. Deploy, open `/api/health`, and sign in with the bootstrap administrator.
   Create teachers, rosters, and student accounts in the app afterwards.

## Data safety

The local `data/ssu_attendance.json` may contain face snapshots and biometric
reference data. It is deliberately excluded from deployment. Do not upload it
or copy it to a public host unless the school has approved the transfer,
retention policy, access controls, and applicable student consent process.

Use HTTPS and restrict administrator access. For multiple application
instances or long-term institutional use, migrate the JSON store and
in-memory login tokens to a managed database before scaling the service.
