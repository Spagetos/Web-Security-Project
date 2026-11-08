// Serveur de messagerie — squelette de base
// Sert le client (dossier ../client), gère l'inscription/connexion
// et relaie les messages via WebSocket.

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// "Base de données" en mémoire (tout est perdu au redémarrage)
// TODO : remplacer par une vraie base (SQLite par ex.)
// ---------------------------------------------------------------
const users = new Map();    // username -> { passwordHash }
const sessions = new Map(); // sessionId -> { username, expiresAt }
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 h

// ---------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------
function createSession(username) {
  const sessionId = crypto.randomBytes(32).toString("hex"); // ID imprévisible
  sessions.set(sessionId, { username, expiresAt: Date.now() + SESSION_DURATION_MS });
  return sessionId;
}

function getSession(sessionId) {
  const s = sessionId && sessions.get(sessionId);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").filter(Boolean).map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
}

function setSessionCookie(res, sessionId) {
  // HttpOnly : inaccessible au JavaScript (protège contre le vol par XSS)
  // SameSite=Strict : limite le CSRF
  // TODO : ajouter "Secure" quand l'appli tournera en HTTPS
  res.setHeader(
    "Set-Cookie",
    `sid=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}`
  );
}

// ---------------------------------------------------------------
// Application HTTP
// ---------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));

// Inscription
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "Nom d'utilisateur invalide (3-20 caractères, lettres/chiffres/_)." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Mot de passe trop court (8 caractères minimum)." });
  }
  if (users.has(username)) {
    return res.status(409).json({ error: "Nom d'utilisateur déjà pris." });
  }
  // bcrypt : hachage lent + sel automatique. TODO : envisager Argon2id.
  const passwordHash = await bcrypt.hash(password, 12);
  users.set(username, { passwordHash });
  res.status(201).json({ ok: true });
});

// Connexion
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = typeof username === "string" && users.get(username);
  // Message d'erreur identique dans les deux cas : on ne révèle pas si le compte existe
  const valid = user && typeof password === "string" && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) {
    // TODO : limiter les tentatives (rate limiting) contre la force brute
    return res.status(401).json({ error: "Identifiants invalides." });
  }
  setSessionCookie(res, createSession(username));
  res.json({ ok: true, username });
});

// Qui suis-je ?
app.get("/api/me", (req, res) => {
  const s = getSession(parseCookies(req.headers.cookie).sid);
  if (!s) return res.status(401).json({ error: "Non connecté." });
  res.json({ username: s.username });
});

// Déconnexion
app.post("/api/logout", (req, res) => {
  sessions.delete(parseCookies(req.headers.cookie).sid);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ ok: true });
});

// ---------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const online = new Map(); // username -> ws

server.on("upgrade", (req, socket, head) => {
  // Seuls les utilisateurs connectés peuvent ouvrir une WebSocket
  const s = getSession(parseCookies(req.headers.cookie).sid);
  // TODO : vérifier aussi req.headers.origin (contre le Cross-Site WebSocket Hijacking)
  if (!s) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.username = s.username; // l'identité vient de la session, jamais du client
    wss.emit("connection", ws);
  });
});

function broadcastUserList() {
  const msg = JSON.stringify({ type: "users", users: [...online.keys()] });
  for (const ws of online.values()) ws.send(msg);
}

wss.on("connection", (ws) => {
  online.set(ws.username, ws);
  broadcastUserList();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== "message" || typeof msg.to !== "string") return;

    const target = online.get(msg.to);
    if (!target) return;

    // TODO (le cœur du projet) : "payload" devra être un message chiffré
    // et signé par le client. Le serveur se contente de le relayer
    // sans pouvoir le lire.
    target.send(JSON.stringify({ type: "message", from: ws.username, payload: msg.payload }));
  });

  ws.on("close", () => {
    online.delete(ws.username);
    broadcastUserList();
  });
});

server.listen(PORT, () => {
  console.log(`Serveur démarré : http://localhost:${PORT}`);
});
