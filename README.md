# bun-template

[![License][license-src]][license-href]

Template for [bun](https://bun.sh) projects.

This template includes essential files such as scripts for updating and installing dependencies, ESLint configuration, `tsconfig.json`, `Dockerfile`, and related files.

It also comes with pre-configured scripts in `package.json`, allowing you to use commands like `bun run dev`.

## Environment Requirements

- Bun version 1.2 or higher

## Usage Instructions

You can clone this repository and modify it as needed. Alternatively, you can fork the repository to conveniently sync updates from the base project (such as optimizations and bug fixes).

## Command Descriptions

### Build and Compilation

- `bun run build` - Builds the project (`./src/index.ts` as the entry point). Enables bytecode and minification by default. Outputs to `./dist/`, with `NODE_ENV=production`. Loads `.env.production.local`.
- `bun run compile` - Builds the project into a single binary executable (`./src/index.ts` as the entry point). Enables bytecode and minification by default. Outputs to `./dist/index`, with `NODE_ENV=production`. Loads `.env.production.local`.

### Development

- `bun run dev` - Runs the project in development mode (`./src/index.ts` as the entry point). Watches for file changes and restarts automatically. Sets `NODE_ENV=development` and loads `.env.development.local`.

### Code Quality

- `bun run lint` - Runs ESLint.
- `bun run lint:fix` - Runs ESLint with auto-fixing enabled.
- `bun run type-check` - Performs TypeScript type checking.

## Directory and File Descriptions

- `src/` - Source code directory
- `.vscode/` - VS Code settings directory

### Configuration Files

- `.gitignore` - Specifies files and directories to be ignored by Git
- `package.json` - Project metadata and dependencies
- `tsconfig.json` - TypeScript configuration file
- `eslint.config.mjs` - ESLint configuration file

### Environment Files

- `.env.development` - Template for development environment variables
- `.env.development.local` - Development environment variables (ignored by Git)
- `.env.production` - Template for production environment variables
- `.env.production.local` - Production environment variables (ignored by Git)

### Docker-related Files

- `Dockerfile` - Defines the Docker image configuration
- `.dockerignore` - Specifies files to be ignored when building the Docker image
- `docker-entrypoint.sh` - Entry point script for Docker containers
- `docker-build-and-run.sh` - Builds a Docker image, removes old containers, and runs a new container

### Utility Scripts

- `install-dependencies.sh` - Loads `.env.development.local` and installs dependencies
- `upgrade-dependencies.sh` - Loads `.env.development.local` and updates dependencies
- `fetch-and-merge.sh` - Fetches and merges the latest `main` branch from this template
- `modify-files-permissions.sh` - Ensures consistent file permissions
- `tmux-run-dev.sh` - Runs the development mode inside a tmux session

### Licensing

- `LICENSE` - License file for the project

## Additional Notes

- If you use a private npm registry, you can specify it by modifying the `NPM_CONFIG_REGISTRY` value in the environment files. Use the provided scripts to install or update dependencies.

## License

[MIT License](./LICENSE)

<!-- Badges -->
[license-href]: https://github.com/kiki-kanri/bun-template/blob/main/LICENSE
[license-src]: https://img.shields.io/github/license/kiki-kanri%2Fbun-template?colorA=18181b&colorB=28cf8d&style=flat
