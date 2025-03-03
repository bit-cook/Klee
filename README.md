# Klee Client

## System Requirements

- Node.js 20.x or higher
- Yarn 1.22.19 or higher

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-organization/klee-client.git
cd klee-client
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Then edit the `.env` file according to your needs, configuring the following environment variables:

#### Basic Configuration

```
# Remote Mode Configuration
# Set to 'true' to enable remote mode, 'false' to use local mode, default is 'false'
VITE_USE_SUPABASE=false

# Supabase configuration (only required if VITE_USE_SUPABASE=true)
# These are used to configure your own remote service
# If not specified, the system will use our default deployed service
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_AUTH_CALLBACK_URL=your_callback_url

# Ollama service address, default: http://localhost:11434
VITE_OLLAMA_BASE_URL=http://localhost:11434

# Local Python service address, default: http://localhost:6190
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

### 4. Run in Development Mode

```bash
yarn dev
```

This will start the Vite development server and the Electron application.

### 5. Build the Application

```bash
yarn build
```

After building, you can find the compiled application in the `dist` directory.

## Other Useful Commands

- `yarn type-check`: Run TypeScript type checking
- `yarn lint`: Run ESLint and Stylelint for code checking
- `yarn lint:fix`: Automatically fix fixable code style issues
- `yarn generate-icons`: Generate app icons (requires app-icon.png file)

## Technology Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- Radix UI
- i18next (Internationalization)
- React Query
- Jotai (State Management)

