# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack at http://localhost:3000
- `npm run build` - Build for production with Turbopack
- `npm run start` - Start production server

### Code Quality (Always run after making changes)
- `npm run lint` - Check code with Biome linter
- `npm run format` - Format code with Biome
- `npm run lint:fixunsafe` - Auto-fix linting issues including unsafe fixes

### Maintenance
- `npm run upgrade-interactive` - Interactive dependency updates

## Architecture & Structure

This is a Next.js 15 project using the App Router with TypeScript and Tailwind CSS v4.

### Key Technologies
- **Next.js 15.5.2** with Turbopack for faster builds and development
- **React 19.1.1** with latest features
- **TypeScript 5** with strict mode enabled
- **Tailwind CSS v4** via PostCSS
- **Biome** for linting and formatting (replaces ESLint + Prettier)

### File Structure
- `src/app/` - Next.js App Router pages and layouts
- `@/*` path mapping points to `./src/*`
- Standard Next.js App Router conventions apply

### Code Style (Biome Configuration)
- **Indentation**: 2 spaces
- **Quotes**: Single quotes (JS/TS), double quotes (JSX)
- **Semicolons**: As needed (ASI)
- **Imports**: Automatically organized
- React and Next.js specific linting rules enabled

## Task Completion Process

After any code changes:
1. `npm run format` - Format code
2. `npm run lint` - Check for issues  
3. `npm run build` - Verify build succeeds

No testing framework is currently configured - manual testing via `npm run dev` is required.