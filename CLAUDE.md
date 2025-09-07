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

This is a bookmark management system called "Encore" built with Next.js 15 and the App Router.

### Key Technologies
- **Next.js 15.5.2** with Turbopack for faster builds and development
- **React 19.1.1** with latest features
- **TypeScript 5** with strict mode enabled
- **Tailwind CSS v4** via PostCSS
- **Biome** for linting and formatting (replaces ESLint + Prettier)

### Project Purpose
Encore is designed as a comprehensive bookmark management system with advanced metadata extraction capabilities. See `idea/` directory for detailed technical architecture and specifications.

### File Structure
- `src/app/` - Next.js App Router pages and layouts
- `src/app/api/` - API routes for metadata extraction
- `idea/` - Technical specifications and architecture documents
- `@/*` path mapping points to `./src/*`
- Standard Next.js App Router conventions apply

### Architecture Documents
Critical design documents are located in the `idea/` directory:
- `database-design.md` - Database schema and design patterns
- `api-design.md` - API endpoints and data access patterns
- `metadata-extraction.md` - Core metadata extraction system
- `technical-architecture.md` - Overall system architecture index

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

## Important Notes

- **Language**: Project documentation in `idea/` and `.claude/CLAUDE.md` indicate responses should be in Japanese
- **Architecture First**: Always consult the `idea/` directory for system architecture before making changes
- **Metadata System**: Core functionality revolves around URL metadata extraction with Edge/Node/External API fallback strategy