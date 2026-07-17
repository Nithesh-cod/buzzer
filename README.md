# 🎯 Outlier Hunt — Buzzer & Scoring App

Real-time buzzer for the Outlier Hunt game. Same login page for everyone —
the **username decides the role**:

| Username           | Role         | Can do                                                        |
|--------------------|--------------|---------------------------------------------------------------|
| `admin12112`       | Admin        | Lock/unlock buzzer, see buzz order, see point table, reset    |
| `pointbreak12112`  | Point Maker  | Give 1 or 2 points to any team                                 |
| *(any other name)* | Team/Student | One big buzzer (works only when unlocked)                     |

**Fairness:** the *server* stamps the order the instant each press arrives, so
"who was first" is decided centrally — not by each phone's clock. Tested with
100 teams buzzing at once: 100 distinct positions, zero ties.

---

## Run it locally (best for an event — no internet needed)

1. Install [Node.js](https://nodejs.org) (v18+).
2. In this folder:
   ```
   npm install
   npm start
   ```
3. Find your laptop's LAN IP:
   - Windows: `ipconfig` → look for **IPv4 Address** (e.g. `192.168.1.23`)
4. Make sure the laptop **and all phones are on the same Wi-Fi**.
5. Students open **`http://192.168.1.23:3000`** in their phone browser.
   - You (organiser) open the same URL, log in as `admin12112` / `pointbreak12112`.

> If phones can't connect, allow Node through the Windows Firewall (a prompt
> usually appears the first time you run `npm start` — click **Allow**).

This is the most reliable setup for a live game: lowest latency, no cloud, no
sleeping servers.

---

## Deploy to the internet (so people can join from anywhere)

The app needs **WebSockets**, so it must run on a host that keeps a Node
process alive (NOT plain static hosting like GitHub Pages / Netlify).

### Option A — Render.com (free, easiest)
1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free (fine for one event; may sleep after idle —
     open the URL a minute before the game to wake it).
4. Deploy. Render gives you a URL like `https://outlier-hunt.onrender.com` —
   share that with everyone. (Port is handled automatically via `process.env.PORT`.)

### Option B — Railway.app
1. Push to GitHub → [railway.app](https://railway.app) → **New Project → Deploy from GitHub**.
2. Railway auto-detects Node and runs `npm start`. Add a public domain in
   **Settings → Networking → Generate Domain**.

### Option C — Any VPS (DigitalOcean / EC2 / etc.)
```
npm install
npm install -g pm2
pm2 start server.js --name outlier-hunt
pm2 save
```
Point a domain / reverse proxy (Nginx) at port 3000 and enable WebSocket
upgrade headers.

---

## How to run a round

1. Everyone logs in. Admin & Point Maker on organiser devices.
2. Read out the word; the team on stage makes their 6 hint sentences.
3. Admin presses **🔓 Unlock buzzer** → the three answering teams' buzzers go live.
4. First team to press shows at **#1** on the Admin and Point Maker screens.
5. Admin presses **🔒 Lock** (freezes the order).
6. That team answers. Point Maker gives **+1** (word OR imposter) or **+2** (both).
7. Admin presses **↺ New round** to clear buzzes for the next word.
8. **⚠ Reset all scores** zeroes the point table (use only between games).

Scores persist while the server runs. Restarting the server clears everything.
