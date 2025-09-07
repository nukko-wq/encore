# Task Completion Checklist

When completing any development task, run these commands to ensure code quality:

## Required Steps
1. **Format Code**: `npm run format`
2. **Lint Code**: `npm run lint`
3. **Build Check**: `npm run build` (ensure the project builds successfully)

## Optional Steps
- If linting shows fixable issues: `npm run lint:fixunsafe`
- Test the changes in development: `npm run dev`

## Notes
- Biome will automatically organize imports when formatting
- The build uses Turbopack for faster compilation
- No automated tests are currently configured - manual testing via development server is required
- Consider adding test scripts if implementing testing in the future