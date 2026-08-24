# SANKET — AI-Powered Digital Doctor for Computers

SANKET is a self-healing system health platform for Windows. A Java agent running on the monitored machine collects real hardware telemetry every 60 seconds and sends it to a Node.js/Express backend backed by MongoDB Atlas. A React dashboard displays live metrics, AI-enhanced diagnostics, predictive health scoring, storage intelligence, and safe (approval-gated) self-repair.

---

## Architecture

```
Browser (React / Vite — port 4173 dev)
     ↕  HTTP
Node.js Backend (Express — port 5000)
     ↕  MongoDB driver
MongoDB Atlas
     ↑  HTTP  X-Agent-Token
Java Agent (OSHI / JNA — reads real Windows hardware)
     ↓
Real Windows Hardware
```

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20 LTS + | `node -v` |
| npm | 9+ | `npm -v` |
| Java JDK | 21+ (tested on 26) | `java -version` |
| Apache Maven | 3.9+ | `mvn -version` |
| MongoDB Atlas | Free tier or above | cloud.mongodb.com |

---

## 1. Configure the backend

```powershell
cd backend
copy .env.example .env
```

Edit `backend\.env`:

```env
PORT=5000

# Your MongoDB Atlas connection string (from Atlas → Connect → Drivers)
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=<AppName>

# Shared secret — must match between backend and agent
AGENT_API_TOKEN=<strong-random-secret>

# Gemini AI (optional — SANKET works without it via local rule-based diagnosis)
AI_PROVIDER=gemini
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-3.6-flash

# CORS for the frontend
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
```

**Never commit `.env`.** It is in `.gitignore`.

### DNS note

If your DNS server does not support SRV record lookups (common in corporate networks), the backend automatically falls back to direct shard host connections for Atlas cluster `0djgdar`. For a different Atlas cluster you must set `MONGODB_URI` to the direct `mongodb://` connection string.

---

## 2. Start the backend

```powershell
cd backend
npm install
npm start
```

Expected output:
```
[MongoDB] Connected: ac-xxx.mongodb.net/test
========================================
SANKET Backend  v0.1.0
Listening on    http://localhost:5000
Health check    http://localhost:5000/api/health
...
```

Verify: `curl http://localhost:5000/api/health`

---

## 3. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:4173`

---

## 4. Build the Java agent

```powershell
cd agent
mvn clean package -DskipTests
```

Output JAR: `agent\target\sanket-agent-jar-with-dependencies.jar`

On Windows with a non-default Maven path:

```powershell
& "C:\Program Files (x86)\apache\apache-maven-3.9.16\bin\mvn.cmd" clean package -DskipTests
```

---

## 5. Start the Java agent

Run from the `agent\` directory so it can resolve `backend\.env` via relative path:

```powershell
cd agent
java --enable-native-access=ALL-UNNAMED -jar target\sanket-agent-jar-with-dependencies.jar
```

The `--enable-native-access=ALL-UNNAMED` flag is required on Java 16+ for OSHI/JNA to read hardware sensors.

Expected output:
```
SANKET Agent v0.1.0
Backend URL: http://localhost:5000
Starting SANKET Agent monitoring loop...
Registering device: YOURHOSTNAME
Device registered successfully! Device ID: <id>
[...] Heartbeat OK
[...] Metrics sent successfully
Heartbeat every 30s, metrics every 60s.
```

---

## 6. Startup order

```
1. MongoDB Atlas (must be reachable)
2. Backend (npm start)
3. Frontend (npm run dev)
4. Java Agent (java ... -jar ...)
```

---

## Features

| Feature | Status | Notes |
|---------|--------|-------|
| Device registration | ✅ | Serial-based, idempotent |
| Heartbeat (30s) | ✅ | Online/offline state, repair dispatch |
| Metrics (60s) | ✅ | CPU, RAM, storage, network — real OSHI data |
| Device DNA | ✅ | Baseline after 30 samples (~30 min); shows deviation vs current |
| Predictive Health | ✅ | Linear trend, confidence, repeated-issue detection |
| AI Diagnosis | ✅ | Gemini `gemini-3.6-flash`; falls back to local rule-based |
| Local Diagnosis | ✅ | CPU/memory/disk threshold rules — always runs |
| Storage Intelligence | ✅ | Real drive usage; deep scan on request |
| Safe Self-Healing | ✅ | Explicit approval required; two whitelisted operations |
| Repair: DNS flush | ✅ | `ipconfig /flushdns` |
| Repair: Temp files | ✅ | Files > 24h; skips locked/system directories |
| Repair history | ✅ | Full audit trail in MongoDB |

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | none | Backend + DB status |
| POST | `/api/device/register` | X-Agent-Token | Register/update device |
| POST | `/api/device/heartbeat` | X-Agent-Token | Heartbeat + repair dispatch |
| POST | `/api/device/metrics` | X-Agent-Token | Metric ingestion |
| GET | `/api/device` | none | Latest device + metrics + DNA |
| GET | `/api/device/:id` | none | Device by ID |
| GET | `/api/device/:id/metrics` | none | Metric history |
| GET | `/api/diagnosis?deviceId=` | none | Run diagnosis (AI + local) |
| GET | `/api/diagnosis/history?deviceId=` | none | Diagnosis history |
| GET | `/api/prediction?deviceId=` | none | Predictive health |
| POST | `/api/prediction/forecast` | none | Multi-hour forecast |
| GET | `/api/storage?deviceId=` | none | Storage metrics + deep scan |
| POST | `/api/storage/request-scan` | none | Queue deep scan |
| GET | `/api/healing?deviceId=` | none | Available repairs + history |
| POST | `/api/healing/request` | none | Request a repair |
| POST | `/api/healing/approve` | none | Approve a repair |
| POST | `/api/healing/result` | X-Agent-Token | Agent posts repair result |

---

## Troubleshooting

### Backend fails to connect to MongoDB
- Check `MONGODB_URI` in `backend\.env`
- Ensure your Atlas cluster's Network Access whitelist includes your current IP
- For SRV DNS failures, the backend retries with direct shard hosts automatically (for cluster `0djgdar`)

### Agent says "AGENT_API_TOKEN is not configured"
- Ensure `backend\.env` exists and contains `AGENT_API_TOKEN=<value>`
- Run the agent from the `agent\` directory

### Port 5000 already in use
```powershell
netstat -ano | findstr :5000
taskkill /PID <pid> /F
```

### AI diagnosis shows "unavailable"
- Check `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.6-flash` in `backend\.env`
- Local rule-based diagnosis always runs regardless of AI availability

### Device DNA shows "learning" for a long time
- Default: 30 samples at 60s interval = ~30 minutes
- Speed up by setting `METRICS_INTERVAL_SECONDS=15` in agent environment

### Temp file repair fails with "Access Denied"
- The agent skips system-locked directories (SupportAssist, etc.) and continues
- Files it cannot access are counted as "skipped", not failures
- Rebuild the agent from source if running an old JAR

---

## Security

- `AGENT_API_TOKEN` must be changed from the default `dev-token-change-in-production`
- `backend\.env` is gitignored — never commit it
- All agent API endpoints require the `X-Agent-Token` header
- Repair operations are whitelisted — unknown types are rejected
- Every repair requires frontend approval before the agent executes it
- AI API keys are never returned in any API response
