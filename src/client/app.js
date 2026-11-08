// Client de messagerie — squelette de base

const $ = (id) => document.getElementById(id);
let me = null;
let ws = null;
let currentPeer = null;

// ---------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const action = e.submitter.dataset.action; // "login" ou "register"
  const body = JSON.stringify({ username: $("username").value, password: $("password").value });
  const res = await fetch(`/api/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json();
  if (!res.ok) return showAuthMsg(data.error);

  if (action === "register") {
    showAuthMsg("Compte créé, vous pouvez vous connecter.");
  } else {
    startChat(data.username);
  }
});

function showAuthMsg(text) {
  $("auth-msg").textContent = text;
}

$("logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.reload();
});

// Session déjà active ? (cookie toujours valide)
fetch("/api/me").then((r) => r.ok && r.json()).then((d) => d && startChat(d.username));

// ---------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------
function startChat(username) {
  me = username;
  $("me").textContent = me;
  $("auth").hidden = true;
  $("chat").hidden = false;

  // TODO : passer à wss:// (TLS) en production
  ws = new WebSocket(`ws://${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "users") renderUsers(msg.users);
    if (msg.type === "message") {
      // TODO : vérifier la signature puis déchiffrer msg.payload
      addMessage(msg.from, msg.payload.text);
    }
  };
}

function renderUsers(list) {
  const ul = $("users");
  ul.innerHTML = "";
  list.filter((u) => u !== me).forEach((u) => {
    const li = document.createElement("li");
    li.textContent = u; // textContent, jamais innerHTML : protège contre le XSS
    if (u === currentPeer) li.classList.add("active");
    li.onclick = () => selectPeer(u);
    ul.appendChild(li);
  });
}

function selectPeer(u) {
  currentPeer = u;
  $("text").disabled = false;
  $("text").placeholder = `Message à ${u}…`;
  document.querySelector("#send-form button").disabled = false;
  document.querySelectorAll("#users li").forEach((li) => li.classList.toggle("active", li.textContent === u));
}

$("send-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text || !currentPeer) return;

  // TODO (le cœur du projet) : remplacer ce payload en clair par
  // { ciphertext, iv, signature, counter, ... } produit avec la WebCrypto API
  const payload = { text };

  ws.send(JSON.stringify({ type: "message", to: currentPeer, payload }));
  addMessage(`moi → ${currentPeer}`, text);
  $("text").value = "";
});

function addMessage(from, text) {
  const div = document.createElement("div");
  div.className = "msg";
  const who = document.createElement("strong");
  who.textContent = from + " : ";
  div.append(who, document.createTextNode(text)); // pas d'innerHTML
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
}
