# Klee

<div align="center">

**An AI-Powered Knowledge Management Desktop Application**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-33.4.11-blue)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-blue)](https://www.typescriptlang.org/)

[Features](#features) • [Architecture](#architecture) • [Getting Started](#getting-started) • [Documentation](#documentation) • [Contributing](#contributing)

</div>

---

## Overview

Klee is a modern desktop application that combines AI-powered chat, knowledge base management, and note-taking capabilities. It offers both **Cloud Mode** for seamless synchronization and **Private Mode** for complete offline functionality.

### Key Highlights

- 🤖 **AI-Powered Conversations**: Integrated with OpenAI and local Ollama models
- 📚 **Knowledge Base Management**: Organize and search through your documents with RAG (Retrieval-Augmented Generation)
- 📝 **Rich Note-Taking**: Tiptap-based collaborative editor with Markdown support
- 🔒 **Privacy-First**: Complete offline mode with local AI and data storage
- ☁️ **Cloud Sync**: Optional cloud synchronization via Supabase
- 🎨 **Modern UI**: Built with React, TailwindCSS, and shadcn/ui components

---

## Features

### 🌩️ Cloud Mode
- **Authentication**: Google OAuth and email/password via Supabase
- **Data Sync**: PostgreSQL database with real-time updates
- **File Storage**: Supabase Storage for documents and attachments
- **Collaboration**: Share knowledge bases and chat configurations

### 🔐 Private Mode
- **Local AI**: Powered by Ollama (embedded or system-installed)
- **Local Storage**: SQLite for structured data
- **Vector Search**: LanceDB for semantic search (planned)
- **Complete Offline**: No internet connection required

### 🛠️ Core Capabilities
- **Multi-Model Support**: Switch between cloud (OpenAI) and local (Ollama) models
- **Knowledge Base**: Upload documents, extract text, and query with RAG
- **Note Management**: Create, edit, and organize notes with a rich editor
- **Marketplace**: Browse and install community-shared agents and knowledge bases
- **Search**: Full-text and semantic search across all content

---

## Architecture

### Tech Stack

**Frontend**
- **Framework**: React 18.3 + TypeScript
- **Desktop**: Electron 33.4
- **Routing**: TanStack Router
- **State Management**: TanStack Query (React Query)
- **UI Components**: Radix UI + shadcn/ui
- **Styling**: TailwindCSS
- **Editor**: Tiptap (collaborative rich text)

**Backend**
- **Framework**: Hono (type-safe RPC)
- **Database (Cloud)**: PostgreSQL via Drizzle ORM
- **Database (Private)**: SQLite via Drizzle ORM
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **AI**: AI SDK (Vercel) with OpenAI + Ollama providers

**Infrastructure**
- **Deployment**: AWS Elastic Beanstalk (backend)
- **Vector Store**: LanceDB (private mode, planned)
- **Local AI**: electron-ollama

### Project Structure

```
klee/
├── client/                 # Electron + React app
│   ├── src/
│   │   ├── main/          # Electron main process
│   │   │   ├── ipc/       # IPC handlers
│   │   │   └── local/     # Private mode services
│   │   └── renderer/      # React app
│   │       ├── components/
│   │       ├── hooks/     # TanStack Query hooks
│   │       ├── routes/    # TanStack Router routes
│   │       └── lib/       # Utilities and clients
├── server/                 # Hono API server
│   ├── src/
│   │   ├── routes/        # API routes
│   │   └── db/            # Database schemas and queries
├── docs/                   # Documentation
└── specs/                  # Feature specifications
```

---

## Getting Started

### Prerequisites

- **Node.js**: 20.x or higher
- **npm**: 9.x or higher
- **Docker**: For local PostgreSQL (optional, cloud mode only)
- **Ollama**: For local AI (optional, private mode only)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/signerlabs/Klee.git
   cd klee
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` files and configure:
   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

   See [Environment Configuration](#environment-configuration) for details.

4. **Start the development server**
   ```bash
   npm run dev
   ```

   This will start:
   - Backend API server on `http://localhost:3000`
   - Electron app with hot reload

### Environment Configuration

#### Root `.env` (for macOS builds)
```bash
# Apple Developer credentials (only needed for signed builds)
APPLE_ID=your_apple_id@example.com
APPLE_APP_SPECIFIC_PASSWORD=your_app_specific_password
APPLE_TEAM_ID=YOUR_TEAM_ID
CODESIGN_IDENTITY="Developer ID Application: Your Company Name (TEAMID)"
```

#### `server/.env`
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Database (Cloud Mode)
DATABASE_URL=postgresql://user:pass@localhost:5432/klee

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### `client/.env`
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup (Cloud Mode)

1. **Start PostgreSQL**
   ```bash
   npm run db:up
   ```

2. **Run migrations**
   ```bash
   npm run db:push
   ```

3. **Configure Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Copy your project URL and anon key to `.env` files
   - Configure OAuth providers in Supabase dashboard
   - Add redirect URL: `klee://auth/callback`

---

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start both client and server in dev mode
npm run client:dev       # Start Electron app only
npm run server:dev       # Start API server only

# Building
npm run build            # Build for production
npm run client:build     # Build Electron app
npm run server:build     # Build API server
npm run build:mac        # Build signed macOS .dmg

# Database
npm run db:up            # Start PostgreSQL with Docker
npm run db:push          # Push schema changes
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations

# Deployment
npm run server:deploy    # Deploy backend to AWS EB
```

### Code Organization

**Frontend Hooks** (`client/src/renderer/src/hooks/`)
```
hooks/
├── chat/              # Chat queries and mutations
├── knowledge-base/    # Knowledge base operations
├── note/              # Note management
├── marketplace/       # Marketplace operations
├── mode/              # Private mode hooks
└── common/            # Shared utilities
```

**API Routes** (`server/src/routes/`)
- Type-safe RPC using Hono
- Automatic type inference from server to client
- Zod validation for all inputs

---

## Building for Production

### macOS

1. **Configure signing** (optional)
   - Add Apple Developer credentials to root `.env`
   - See [docs/mac-build.md](docs/mac-build.md) for details

2. **Build**
   ```bash
   npm run build:mac
   ```

3. **Output**
   - `client/release/<version>/Klee_<version>_arm64.dmg`

### Backend Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete backend deployment guide.

---

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Backend and client deployment
- [macOS Build Guide](docs/MAC_BUILD.md) - Code signing and notarization
- [OAuth Integration](docs/ELECTRON_SUPABASE_OAUTH_GUIDE.md) - Supabase OAuth setup
- [Development Guidelines](CLAUDE.md) - Code style and architecture patterns

---

## Technology Decisions

### Why TanStack Query?
- Automatic caching and background refetching
- Optimistic updates for better UX
- Built-in loading and error states
- Perfect for client-server synchronization

### Why Hono?
- Type-safe RPC with zero configuration
- Automatic type inference from server to client
- Lightweight and fast
- Works seamlessly with TanStack Query

### Why Electron?
- Cross-platform desktop support
- Access to native APIs (file system, Ollama, SQLite)
- Ability to bundle local AI models
- Deep link support for OAuth

### Why Two Modes?
- **Cloud Mode**: Best for users who want sync and collaboration
- **Private Mode**: Essential for users who need complete data privacy and offline access

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Style

- Follow the existing code style
- Use TypeScript for all new code
- Add tests for new features
- Update documentation as needed

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Electron](https://www.electronjs.org/) - Desktop framework
- [Supabase](https://supabase.com/) - Backend as a service
- [Ollama](https://ollama.ai/) - Local AI runtime
- [TanStack](https://tanstack.com/) - Powerful React utilities
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Hono](https://hono.dev/) - Lightweight web framework

---

## Support

- **Issues**: [GitHub Issues](https://github.com/signerlabs/Klee/issues)
- **Discussions**: [GitHub Discussions](https://github.com/signerlabs/Klee/discussions)

---

<div align="center">

Made with ❤️ by the Klee Contributors

</div>
