# Klee Electron

## Prerequisites

To use Electron, you need to install Node.js. We recommend that you use the latest LTS version available.

Please install Node.js using pre-built installers for your platform. You may encounter incompatibility issues with different development tools otherwise.

To check that Node.js was installed correctly, type the following commands in your terminal client:

```sh
node -v
npm -v
```

The commands should print the versions of Node.js and npm accordingly.

## Install

```sh
yarn
```

## Run

```sh
yarn start
```

We prefer `Yarn` as package manager.

## Build

```sh
yarn make
```

## Tech Stack

- [electron](https://www.electronjs.org/)
- [electron-forge](https://www.electronforge.io/)
- [vite](https://vitejs.dev/)
- [Typescript](https://www.typescriptlang.org/)
- [react](https://reactjs.org/)
- [tailwindcss](https://tailwindcss.com/)
- [shadcn ui](https://ui.shadcn.com/)
- [framer-motion](https://www.framer.com/)
- [react-lucide](https://lucide.dev/)
- [react-query](https://tanstack.com/query/latest/)
- [postcss](https://postcss.org/)
- [react-router-dom](https://reactrouter.com/en/6.16.0)
- [eslint](https://eslint.org/)/[stylelint](https://stylelint.io/)
- [prettier](https://prettier.io/)
- [svgr](https://react-svgr.com/)
- [editorconfig](https://editorconfig.org/)
- [husky](https://typicode.github.io/husky/#/)/[lint-staged](https://github.com/okonet/lint-staged)
- [commitlint](https://commitlint.js.org/)

## Project Structure

```sh
src
├── app.tsx     # App entry
├── assets      # Assets for images, favicon etc
├── components  # React components
├── hooks       # React hooks
├── i18n        # i18n files
├── lib         # Utils、tools、services
├── main.tsx    # File entry
├── pages       # One .tsx per page
├── router.tsx  # Routers
├── styles      # Less files
├── types       # Typescript types
└── vite-env.d.ts
```
