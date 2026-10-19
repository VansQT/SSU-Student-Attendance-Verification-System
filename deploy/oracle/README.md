# Oracle Cloud Always Free deployment

This deployment uses a single Ubuntu VM with Docker Compose. Caddy supplies
HTTPS, and only Caddy exposes ports 80 and 443. The Node application and the
Python face-recognition worker run privately in the `attendance` container.

## Prerequisites

1. Create an Oracle Cloud Always Free Ubuntu VM. Use an Ampere A1 Flex shape
   with 2 OCPUs and 12 GB memory if capacity is available.
2. Assign a reserved public IPv4 address. In the Oracle cloud security list
   and the Ubuntu firewall, allow inbound TCP ports **80**, **443**, and
   **22** only. Do not open port 3000.
3. Point a DNS name you control (for example, `attendance.example.org`) to the
   VM's public IP. A real DNS name is required for HTTPS and browser camera /
   geolocation permissions.
4. Keep this GitHub repository private. The project intentionally excludes the
   local `data/` directory and all enrolled face records.

## On the VM

Connect using SSH, then run the following commands. Replace placeholders with
your own values; do not paste a password or token into chat.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

git clone https://github.com/VansQT/SSU-Student-Attendance-Verification-System.git
cd SSU-Student-Attendance-Verification-System
cp .env.production.example .env.production
nano .env.production
```

Set these values in `.env.production`:

```dotenv
APP_DOMAIN=attendance.example.org
INITIAL_ADMIN_USERNAME=your-admin-username
INITIAL_ADMIN_EMAIL=admin@example.org
INITIAL_ADMIN_PASSWORD=a-unique-password-of-at-least-12-characters
```

Then start the service:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f --tail=100
```

Open `https://APP_DOMAIN/api/health`. It must return `status: ok` before
opening the sign-in page. Create teacher and student accounts in the hosted
application; no local face enrollment data is copied to the VM.

## Updates and backups

```bash
git pull --ff-only
docker compose up --build -d
docker compose exec attendance sh -c 'cp /var/data/ssu_attendance.json /var/data/ssu_attendance.backup.json'
```

Store backup copies securely because they can contain student information and
biometric snapshots.
