# macOS Packaging and Code Signing Guide

## Version Management
- Client version number is located in the `version` field of `client/package.json`.
- Before each release, manually update this field following semantic versioning (e.g., `0.1.1`, `0.2.0`).

## Environment Setup
1. The `.env` file in the project root should contain the following information:
   ```
   APPLE_ID=your_apple_id@example.com
   APPLE_APP_SPECIFIC_PASSWORD=your_app_specific_password
   APPLE_TEAM_ID=YOUR_TEAM_ID
   CODESIGN_IDENTITY="Developer ID Application: Your Company Name (TEAMID)"
   ```
2. Ensure your Apple Developer account is still valid and the app-specific password hasn't expired.

## Packaging Process
1. Execute from the project root:
   ```bash
   npm run build:mac
   ```
   The script will:
   - Automatically load `.env`;
   - Build the client;
   - Sign the embedded Ollama binary and main application;
   - Notarize and staple;
   - Verify with `codesign` / `spctl`.
2. After successful completion, artifacts will be located at:
   - `client/release/<version>/mac-arm64/Klee.app`
   - `client/release/<version>/Klee_<version>_arm64.dmg`
   - `latest-mac.yml`, `.blockmap`, and other release files.

## Release Notes
- The DMG is the distribution file and can be directly uploaded or attached to a Release.
- To support other architectures, you need to add the corresponding Ollama binaries and update `mac.binaries` in `electron-builder.json`.
- If Apple returns a notarization failure, check if credentials in `.env` have expired or if the certificate has been revoked.
