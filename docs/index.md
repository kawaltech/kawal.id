# Kawal.id contributor guide

Use this index for current decisions and operating documents. Use
[GitHub Issues](https://github.com/kawaltech/kawal.id/issues) for remaining work
and pull requests for code review. The old plan below is history, not a backlog.

## Current documents

| Document                                              | Use                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| [README](../README.md)                                | Setup, commands, and repository structure.                                  |
| [Contributing](../CONTRIBUTING.md)                    | Issue ownership, pull requests, checks, and handoff.                        |
| [Local development](development.md)                   | Run without a cloud account; auth and test limits.                          |
| [Security policy](../SECURITY.md)                     | Private vulnerability reporting and supported code.                         |
| [Open-source readiness](open-source-readiness.md)     | Publication gates and source-audit limits.                                  |
| [Agent handoff prompt](contributor-handoff.md)        | Initial prompt for a contributor using Opus or another agent.               |
| [Domain terms](../CONTEXT.md)                         | Shared language for observations, reports, and publication.                 |
| [ADR 0002](adr/0002-static-publication.md)            | Static public reads, export activation, cache limits, and withdrawal gates. |
| [ADR 0003](adr/0003-map-and-table-public-design.md)   | Accepted option B map-and-table design.                                     |
| [ADR 0004](adr/0004-void-static-deployment.md)        | Native Void stack with separate public and app targets.                     |
| [ADR 0006](adr/0006-d1-read-replication-off.md)       | D1 read replication stays disabled.                                         |
| [ADR 0007](adr/0007-reliable-data-before-playback.md) | Reliable satellite data before playback; 3D is deferred.                    |
| [Operations](operations.md)                           | Local services, operating limits, and release controls.                     |
| [App staging](app-staging.md)                         | Deployment procedure, approval gates, and recorded staging checks.          |

The [satellite-release proposal](plans/reliable-satellite-release.md) breaks
issue #5 into work packages. It is proposed, not accepted implementation scope.

Accepted ADR 0008 and the private report implementation are in
[PR #1](https://github.com/kawaltech/kawal.id/pull/1). Until that PR merges, read
[ADR 0008 on its branch](https://github.com/kawaltech/kawal.id/blob/report-review-slice/docs/adr/0008-private-report-drafts-and-review.md).
Its acceptance is not evidence of a merge, remote migration, or deployment.

## Work and ownership

| Issue                                                | Scope                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| [#2](https://github.com/kawaltech/kawal.id/issues/2) | Review and integrate the private draft/review slice.                       |
| [#3](https://github.com/kawaltech/kawal.id/issues/3) | D1 recovery evidence, retention, and erasure rules before real reports.    |
| [#4](https://github.com/kawaltech/kawal.id/issues/4) | Separately approved synthetic-only staging rollout.                        |
| [#5](https://github.com/kawaltech/kawal.id/issues/5) | Plan reliable satellite ingestion, exports, and public map/table delivery. |
| [#6](https://github.com/kawaltech/kawal.id/issues/6) | Keep the document index and scope statements current.                      |

Record current status and ownership in the issue, not in this table.

1. Record one accountable contributor, their agent thread if used, and the
   branch or PR before work starts. One contributor owns each file change;
   agree ownership before parallel work touches the same files.
2. State scope, dependencies, acceptance checks, and approval limits in the
   issue. Update it when work starts, blocks, enters review, or finishes.
3. Link decisions to ADRs. Put terms in `CONTEXT.md` and procedures in runbooks.
   Do not copy the backlog into another task system or a new Markdown plan.
4. Record the exact reviewed revision, check results, unresolved findings, and
   next owner at handoff. A thread message or commit ID does not transfer
   unpushed files between orbs.
5. Report code and deployment status separately. Accepted, implemented locally,
   merged, deployed, and live-verified are different states. A green local test
   is not proof of remote D1 or staging behavior.
6. Get explicit approval before a push, merge, remote migration, deployment, or
   other shared-system write. An issue assignment is not that approval. Keep
   secrets, real report text, personal data, and private media out of issues,
   test data, and review evidence.

The owner wants to publish this repository as open source. The
[readiness gates](open-source-readiness.md) must pass first. This guide does not
change repository visibility, grant a license, authorize real report intake,
or lift any release gate.

## Historical documents

[ADR 0001](adr/0001-self-contained-kawal-asap.md) and
[ADR 0005](adr/0005-cloudflare-editorial.md) are superseded by ADR 0004.
The [old phase 2 plan](plans/phase-2.md) and the sections below describe the
earlier reporting project. Do not use their tasks, stack, data model, or Google
Sheets integration as current requirements.

---

# Historical plan: public reporting website

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
