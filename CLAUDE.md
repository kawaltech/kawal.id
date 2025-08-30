# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Commands

- `npm run dev` - Start development server with HMR at <http://localhost:5173>
- `npm run build` - Create production build
- `npm run start` - Start production server from built files
- `npm run typecheck` - Run React Router type generation and TypeScript checking

## Architecture

This is a React Router v7 application using **Framework Mode** - the most
comprehensive routing strategy offering type-safe routing, intelligent code
splitting, and support for multiple rendering strategies (SPA, SSR, static
rendering).

### Key Framework Mode Features

- Type-safe routing with generated types
- Route Module API for data loading, actions, and meta
- Intelligent code splitting
- Vite plugin integration for optimal build performance
- Support for prerendering (configured for root path `/`)

### Project Structure

- **Framework**: React Router v7 Framework Mode with TypeScript and TailwindCSS
- **Build System**: Vite with React Router dev plugin
- **Styling**: TailwindCSS v4 with Vite plugin
- **Routing**: File-based routing configured in `app/routes.ts`
- **Configuration**:
  - `react-router.config.ts` - Defines prerendering strategy
  - `vite.config.ts` - Vite configuration with React Router, TailwindCSS, and
    TypeScript path plugins

### Key Files

- `app/root.tsx` - Root layout with HTML structure, error boundary, and font
  loading
- `app/routes.ts` - Route configuration using React Router's route helpers
- `app/routes/home.tsx` - Home page route with meta function
- `app/welcome/welcome.tsx` - Welcome component
- `app/app.css` - Global styles

### TypeScript Configuration

- Path alias `~/*` maps to `./app/*` for clean imports
- React Router generates types in `.react-router/types/`
- Route modules get typed `Route` imports for type-safe meta, loaders, and
  actions
- Strict TypeScript settings enabled

### Build Output

Production builds generate:

- `build/client/` - Static assets optimized for browser
- `build/server/` - Server-side code for SSR/prerendering

### Docker Support

Multi-stage Dockerfile included for containerized deployment using Node.js 20
Alpine.
