# 🤝 Contributing to Cryptus

Thank you for helping build **Cryptus** — the zero-central-server P2P encrypted chat client.

---

## 🛠️ Development Setup

### Prerequisites

- Node.js 22.0.0+
- npm 10.0.0+

### Clone & Build

```bash
git clone https://github.com/cryptus-org/cryptus.git
cd cryptus
npm install
npm run build
```

---

## 📂 Source Code Structure

```
src/
├── cli/                 # Commander CLI entry points & commands
│   ├── commands/        # init, contacts, network, status, verify, backup
│   └── index.ts         # Binary entry point
├── identity/            # Ed25519 key generation & Argon2id keystores
├── storage/             # SQLite connection manager, DDL schema & DAO layer
│   └── dao/             # ContactDAO, MessageDAO, SessionDAO
├── network/             # libp2p P2P node, invite codes & protocol handlers
│   ├── discovery/       # libp2p node, invite codecs, chat protocol
│   └── ice/             # STUN/TURN candidate gathering & connectivity checks
├── outbox/              # Pending message queue & retry manager with jitter
├── crypto/              # Safety Numbers fingerprinting & Double Ratchet engine
├── backup/              # Age-encrypted archive export and import utilities
└── tui/                 # Ink (React-for-terminals) UI components and views
```

---

## 🧪 Testing Guidelines

Verify changes before submitting pull requests:

```bash
# TypeScript build check
npm run build

# Run CLI verification commands
npx tsx src/cli/index.ts --help
```

---

## 📄 Code Style

- Use **TypeScript strict mode**.
- Ensure clean module resolution (`NodeNext` imports with `.js` extensions).
- Follow clean functional architecture and error-first design patterns.
