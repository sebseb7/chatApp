# ChatApp

A real-time chat application with end-to-end encryption, built with React and Node.js.

## Features

### Authentication & Profiles
- **Google OAuth** login - no passwords to remember
- **Custom profiles** - set your own display name and avatar
- **Visibility toggle** - go invisible to appear offline while still receiving messages

### Messaging
- **Real-time chat** powered by Socket.io
- **Direct messages** between users
- **Group chats** with admin controls (add/remove members, mute users)
- **Public groups** that auto-add all users (admin-only creation)
- **Markdown support** for formatted messages
- **Image sharing** with drag & drop and fullscreen preview
- **Read receipts** and delivery status indicators

### End-to-End Encryption (E2EE)
- **Deterministic key generation** from passphrase + Google ID using PBKDF2 + ECDH (P-256)
- **Cross-device support** - same passphrase generates identical keys on any browser
- **Visual fingerprints** using jdenticon for easy key verification
- **Live preview** - see your fingerprint as you type your passphrase
- Keys are generated client-side and never sent to the server

### Admin Features
- Manage public groups
- User administration via CLI script

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, Material UI 5, Socket.io Client |
| Backend | Node.js, Express, Socket.io |
| Database | SQLite |
| Auth | Passport.js + Google OAuth 2.0 |
| Crypto | Web Crypto API, elliptic (ECDH) |

## Setup

### Prerequisites
- Node.js 18+
- Google Cloud Console project with OAuth 2.0 credentials

### Installation

```bash
# Clone and install dependencies
cd chatApp
cd server && npm install
cd ../client && npm install
```

### Environment Variables

Create `server/.env`:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
COOKIE_KEY=random_secret_string
PORT=3001
```

### Running

```bash
# Terminal 1 - Server
cd server && npm start

# Terminal 2 - Client
cd client && npm start
```

The client runs on `http://localhost:3881` and proxies API requests to the server on port 3001.

## Project Structure

```
chatApp/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # React components (Chat, ProfileSettings, etc.)
│       ├── context/        # Socket.io context provider
│       └── services/       # Crypto utilities for E2EE
├── server/                 # Express backend
│   └── src/
│       ├── index.js        # Express server setup
│       ├── socket.js       # Socket.io event handlers
│       ├── db.js           # SQLite database setup
│       └── auth.js         # Passport Google OAuth config
└── README.md
```

## How E2EE Works

1. User enters a passphrase in the E2EE dialog
2. A deterministic seed is derived using PBKDF2 (passphrase + Google ID + salt, 100k iterations)
3. An ECDH key pair (P-256) is generated from this seed using the `elliptic` library
4. The public key is broadcast to other users; the private key stays local
5. Messages are encrypted using ECDH shared secrets + AES-GCM
6. The server only sees encrypted blobs - it cannot read message content

**Security note**: The same passphrase always generates the same keys, enabling multi-device usage. Users should choose strong, unique passphrases.

## Admin CLI

Toggle admin status for a user:

```bash
cd server
npm run toggle-admin <user_id>
```

## Build Verification

Verify the integrity of deployed files by comparing SHA-256 hashes:

<!-- BUILD_HASHES_START -->
| File | SRI Hash (compare with [srihash.org](https://srihash.org)) |
|------|-------------------------------------------------------------|
| `index.html` | `sha256-rdlRN7d6Qrx+hV767TGWY8DrMhlzFAilZlhmhtwV8Fs=` |
| `bundle.js` | `sha256-cIH7BTejijSuVT0XPj3DDd6W61Rlax3i9REaNzH+reM=` |
| `sw.js` | `sha256-A4EjsQpU1fR3RBC3mnpKzq1gjuB46Wa9yAK8KoHXzxE=` |
<!-- BUILD_HASHES_END -->

**Verify online:** [index.html](https://www.srihash.org/?url=https://c.growheads.de/index.html) | [bundle.js](https://www.srihash.org/?url=https://c.growheads.de/bundle.js) | [sw.js](https://www.srihash.org/?url=https://c.growheads.de/sw.js)

**Bookmarklet:** Create a bookmark with this URL to verify anytime:

```
javascript:(async()=>{const R='https://raw.githubusercontent.com/sebseb7/chatApp/refs/heads/main/README.md?'+Date.now(),B='https://c.growheads.de',F=['index.html','bundle.js','sw.js'];try{const r=await(await fetch(R)).text(),h={};r.replace(/`([^`]+)`\s*\|\s*`sha256-([^`]+)`/g,(m,f,v)=>F.includes(f)&&(h[f]=v));const s=async u=>{const d=await(await fetch(u)).arrayBuffer(),b=await crypto.subtle.digest('SHA-256',d);return btoa(String.fromCharCode(...new Uint8Array(b)))};let o='ChatApp Build Verification\n\n';for(const f of F){const a=await s(`${B}/${f}`),e=h[f],m=a===e;o+=`${m?'✅':'❌'} ${f}: ${m?'MATCH':'MISMATCH'}\n`}alert(o)}catch(e){alert('Error: '+e.message)}})()
```

## License

0BSD

