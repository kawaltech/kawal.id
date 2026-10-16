# Kawal.id - Public Reporting Website

A public reporting platform for collecting and displaying incident reports with categorization, URL embedding, and location mapping. Built with React Router v7 Framework Mode.

**Inspired by:** [senar.ai](https://senar.ai) | **Reference:** <https://github.com/senar-ai/web>

## Features

- 📝 Public incident reporting system
- 🏷️ Category-based organization (`Kategori`)
- 🔗 Social media URL embedding (Twitter, Instagram, Facebook, YouTube)
- 📍 Location mapping with coordinates
- 🚀 Static site generation for performance
- ⚡️ React Router v7 Framework Mode
- 🎨 TailwindCSS styling
- 🔒 TypeScript by default

## Getting Started

### Installation

Install the dependencies:

```bash
pnpm install --frozen-lockfile
```

Use the Node.js version in `.node-version` and the pnpm version in
`package.json`.

### Amp Orbs

Amp runs `.agents/setup` for a fresh orb when no exact snapshot is available.
The script installs the pinned tools, installs locked dependencies, and
generates React Router types. Amp can reuse this state from a project snapshot.
The setup script is safe to run again after repository updates.

The tools are available in new login shells in this repository and its
subdirectories. `.agents/resume` checks the tool versions without reinstalling
dependencies. No database, API key, or user authentication is required yet.

Run `pnpm typecheck` and `pnpm build` to check the application. Start a supervised
development server with:

```bash
amp orb service start dev --command 'pnpm dev --host 0.0.0.0 --port "$PORT"' --portal
```

Use the portal URL returned by the command to open the application.

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```tree
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Project Structure

```tree
├── docs/           # Project documentation and progress tracking
├── app/
│   ├── components/ # Reusable UI components
│   ├── data/       # JSON data files for development
│   ├── lib/        # Utility functions and types
│   ├── routes/     # React Router pages
│   └── root.tsx    # Root layout
├── build/          # Production build output
└── public/         # Static assets
```

## Data Models

### Report Structure

Reports contain incident information with categorization, social media URLs, and location coordinates.

### Category System (`Kategori`)

Organized categorization system for filtering and organizing reports by type or severity.

## Development Roadmap

See [`docs/index.md`](docs/index.md) for detailed feature requirements and implementation progress.

---

Built with ❤️ using React Router v7 Framework Mode.
