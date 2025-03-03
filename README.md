# Klee
Klee is a fully open-source platform that brings secure, local AI to your desktop.

For more information, visit our <u>[Website](https://kleedesktop.com/)</u>.

![Klee Screenshot](public/KleeScreenShot.png)

At its core, Klee is built on:
- <u>[Ollama](https://ollama.com/)</u>: For running local LLMs quickly and efficiently.
- <u>[LlamaIndex](https://www.llamaindex.ai/)</u>: As the data framework.

With Klee, you can:
- Download and run open-source large language models on your desktop with a single click - no terminal or technical background required.
- Utilize the built-in knowledge base to store your local and private files with complete data security.
- Save all LLM responses to your knowledge base using the built-in markdown notes feature.

## 🔧 Installation

### 1. System Requirements

- Node.js 20.x or higher
- Yarn 1.22.19 or higher

### 2. Clone the Repository

```bash
git clone https://github.com/signerlabs/klee-client.git
cd klee-client
```

### 3. Install Dependencies

```bash
yarn install
```

### 4. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Edit the `.env` file to configure the following environment variables according to your requirements:

#### Basic Configuration

```
# Remote Mode Configuration
# Set to 'true' to enable remote mode, 'false' to use local mode (default is 'false')
VITE_USE_SUPABASE=false

# Supabase configuration (only required if VITE_USE_SUPABASE=true)
# These are used to configure your own remote service
# If not specified, the system will use our default deployed service
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_AUTH_CALLBACK_URL=your_callback_url

# Ollama service address (default: http://localhost:11434)
VITE_OLLAMA_BASE_URL=http://localhost:11434

# Local Python service address (default: http://localhost:6190)
VITE_REQUEST_PREFIX_URL=http://localhost:6190
```

#### macOS App Signing and Notarization (required only for production builds)

If you need to build a signed application for macOS, configure the following environment variables:

```
# Apple ID account
APPLEID=your_apple_id@example.com
# Apple ID password or app-specific password
APPLEIDPASS=your_apple_id_password
# Apple Developer Team ID
APPLETEAMID=your_team_id
```

### 5. Set Up Backend Service

Before running the client, you need to set up and start the backend service. Clone and configure the backend service repository:

```bash
git clone https://github.com/signerlabs/klee-service.git
cd klee-service
```

Follow the installation instructions in the backend repository to set up and start the service. The backend service needs to be running on port 6190 (or the port you specified in `VITE_REQUEST_PREFIX_URL`) for the client to connect properly.

Refer to the [klee-service repository](https://github.com/signerlabs/klee-service) for detailed backend setup instructions.

### 6. Run in Development Mode

```bash
yarn dev
```

This command will start both the Vite development server and the Electron application.

### 7. Build the Application (Optional)

```bash
yarn build
```

After building is complete, you can find the compiled application in the `dist` directory.

## 🚀 Other Useful Commands

- `yarn type-check`: Run TypeScript type checking
- `yarn lint`: Run ESLint and Stylelint for code quality checking
- `yarn lint:fix`: Automatically fix resolvable code style issues
- `yarn generate-icons`: Generate application icons (requires app-icon.png file)

## 📖 Technology Stack

- <u>[Electron](https://www.electronjs.org/)</u>
- <u>[React](https://react.dev/)</u>
- <u>[TypeScript](https://www.typescriptlang.org/)</u>
- <u>[Vite](https://vite.dev/)</u>
- <u>[Tailwind CSS](https://tailwindcss.com/)</u>
- <u>[Radix UI](https://www.radix-ui.com/)</u>
- <u>[i18nex](https://www.i18next.com/)</u>
- <u>[React Query](https://github.com/TanStack/query/)</u>
- <u>[Jotai](https://jotai.org/)</u>
