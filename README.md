# Projet: Application Web de Messagerie Sécurisée

## Auteurs
- Code permanent, nom, prénom
- Code permanent, nom, prénom

## Compatibilité

Node.js - 22 (LTS)

## Utilisation

### Prérequis

Installer Node.js 22 LTS : https://nodejs.org/fr/download

Vérifier l'installation :

```bash
node --version
npm --version
```

### Installation des dépendances

```bash
cd src/server
npm install
```

### Lancement

```bash
cd src/server
npm start
```

Puis ouvrir http://localhost:3000 dans deux navigateurs différents (ou une fenêtre normale + une fenêtre de navigation privée), créer deux comptes et échanger des messages.

## Structure

```
chat/
├── src/
│   ├── client/   # Interface web (HTML, CSS, JS)
│   └── server/   # Serveur Node.js (Express + WebSocket)
├── presentation.pdf
└── README.md
```
