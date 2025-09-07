# Code Style and Conventions

## Biome Configuration
The project uses Biome for both linting and formatting with the following settings:

### Formatting
- **Indentation**: 2 spaces (not tabs)
- **Quote Style**: Single quotes for JavaScript, double quotes for JSX
- **Semicolons**: As needed (automatic semicolon insertion)
- **Import Organization**: Enabled (automatically organizes imports)

### Linting
- Uses recommended rules for JavaScript/TypeScript
- Next.js specific rules enabled
- React specific rules enabled  
- `noUnknownAtRules` is disabled for CSS (likely for Tailwind compatibility)

### File Handling
- Ignores unknown file types
- Excludes: node_modules, .next, dist, build directories
- Git integration enabled with ignore file support

## TypeScript Configuration
- **Target**: ES2017
- **Strict mode**: Enabled
- **JSX**: Preserve (handled by Next.js)
- **Module Resolution**: Bundler
- **Path Mapping**: `@/*` maps to `./src/*`

## Next.js Patterns
- Uses App Router (src/app directory structure)
- Font optimization with next/font and Geist fonts
- TypeScript configuration optimized for Next.js