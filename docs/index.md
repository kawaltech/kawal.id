# Kawal.id - Public Reporting Website

## Overview

A public reporting website inspired by [senar.ai](https://senar.ai) for
collecting and displaying incident reports with categorization, URL embedding,
and location mapping.

**Reference Implementation:** <https://github.com/senar-ai/web> (Remix v1/Deno -
use for inspiration only)

## Core Features

### Data Collection & Management

- [ ] Reports submitted via Google Form (future integration)
- [ ] Static data generation at build time
- [ ] JSON-based data storage for development
- [ ] TypeScript data models and interfaces

### Categorization System (`Kategori`)

- [ ] Category-based report organization
- [ ] Category filtering and navigation
- [ ] Category-specific pages (`/kategori/[slug]`)
- [ ] Icon and color-coded category system

### URL Embedding

- [ ] Social media URL detection and embedding
  - [ ] Twitter/X posts
  - [ ] Instagram posts
  - [ ] Facebook posts
  - [ ] YouTube videos
- [ ] Fallback handling for unsupported URLs
- [ ] Loading states and error handling

### Location & Mapping

- [ ] Lat/long coordinate storage
- [ ] Interactive map integration
- [ ] Location-based filtering
- [ ] Geographic data display

### User Interface

- [ ] Responsive design with TailwindCSS
- [ ] Report grid/list view
- [ ] Individual report detail pages
- [ ] Search functionality
- [ ] Navigation and breadcrumbs

### Technical Implementation

- [ ] React Router v7 Framework Mode
- [ ] TypeScript interfaces
- [ ] Static site generation
- [ ] Build-time data fetching
- [ ] SEO optimization
- [ ] Sitemap generation

## Data Structure

### Report Model

```typescript
interface Report {
  id: string;
  title: string;
  description: string;
  category: string;
  url?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  timestamp: string;
  status?: "pending" | "verified" | "resolved";
}
```

### Category Model

```typescript
interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  color?: string;
}
```

## Development Progress

### Phase 1: Project Setup & Documentation

- [x] Create feature documentation
- [x] Update README.md
- [x] Set up TypeScript interfaces
- [x] Create dummy JSON data

### Phase 2: Core Data Structure

**Detailed Plan:** [docs/plans/phase-2.md](plans/phase-2.md)

- [ ] Design report data model
- [ ] Create category system
- [ ] Set up data fetching utilities
- [ ] Configure build-time data integration

### Phase 3: UI Components & Layout

- [ ] Create main layout
- [ ] Build report listing component
- [ ] Create category filter system
- [ ] Design report card component

### Phase 4: URL Embedding System

- [ ] Build URL parser
- [ ] Create platform-specific components
- [ ] Handle unsupported URLs
- [ ] Add loading states

### Phase 5: Location & Mapping

- [ ] Integrate mapping library
- [ ] Create location components
- [ ] Add map view
- [ ] Implement location filtering

### Phase 6: Routing & Pages

- [ ] Set up main routes
- [ ] Category filtering pages
- [ ] Search functionality
- [ ] Report detail pages

### Phase 7: Build-time Integration

- [ ] Configure prerendering
- [ ] Set up build-time data fetching
- [ ] Optimize for static hosting
- [ ] Add sitemap generation

## Notes

- Reference implementation uses older Remix v1/Deno stack - use for UI/UX
  inspiration only
- Focus on React Router v7 Framework Mode conventions
- Prioritize static generation for performance
- Plan for future Google Forms integration
