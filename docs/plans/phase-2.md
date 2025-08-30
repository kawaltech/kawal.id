# Phase 2: Core Data Structure - Implementation Plan

## Overview

Phase 2 focuses on building the core data management infrastructure for the
kawal.id reporting system. This includes data models, category management,
Google Sheets integration, and build-time data fetching capabilities.

**Reference Documentation:** [docs/index.md](../index.md) - Main project
documentation

## Key Insights from senar.ai Reference

Based on analysis of the
[senar.ai implementation](https://github.com/senar-ai/web), we've identified
proven patterns to adapt:

### Data Fetching Architecture

- **Google Sheets CSV export** - Direct CSV export from Google Sheets (no API
  keys needed)
- **Build-time data fetching** - Data pulled during build process, not runtime
- **Custom CSV parser** - Handles quoted fields, commas, and special characters
  properly
- **Data transformation pipeline** - CSV → parsed rows → processed objects →
  JSON files

### Build Integration

- **Build script approach** - `npm run fetch` step runs before main build
- **Timestamp tracking** - Records when data was last updated
- **Error handling** - Graceful failures during build process

### Data Processing

- **String utilities** - kebab-case conversion, snake_case fields, HTML tag
  stripping
- **Field transformation** - URL extraction, category slug generation, location
  parsing
- **Data validation** - Filters empty rows and validates required fields

## Implementation Tasks

### 1. Design Report Data Model (`app/lib/data.ts`)

**Purpose:** Central data access layer with utilities and validation

**Key Functions:**

```typescript
// Data access
export function getAllReports(): Reports;
export function getReportById(id: number): Report | undefined;
export function getReportsByCategory(categorySlug: string): Reports;

// Filtering and search
export function filterReports(filters: SearchFilters): Reports;
export function searchReports(query: string): Reports;

// Validation
export function validateReport(report: any): Report | null;
export function isValidReportData(data: unknown): data is Report;
```

**Features:**

- Type-safe data access with proper error handling
- Caching layer for performance optimization
- Data validation and sanitization
- Search and filtering utilities

### 2. Create Category System (`app/lib/categories.ts`)

**Purpose:** Category management with efficient lookups and utilities

**Key Functions:**

```typescript
// Category access
export function getAllCategories(): Categories;
export function getCategoryBySlug(slug: string): Category | undefined;
export function getUncategorizedCategory(): Category;

// Category utilities
export function createCategoriesRecord(
  categories: Categories,
): CategoriesRecord;
export function getCategoryReportCounts(): Record<string, number>;

// Validation
export function isValidCategory(category: any): category is Category;
```

**Features:**

- O(1) category lookup via Record mapping (adapted from senar.ai)
- Fallback uncategorized category handling
- Category-based report counting
- Icon and theming utilities

### 3. Set up Data Fetching Utilities

#### A. Google Sheets Integration (`app/utils/google-sheets.ts`)

**Purpose:** Handle Google Sheets CSV export and data transformation

**Key Functions:**

```typescript
// CSV processing
export function parseCSV(csvText: string): string[][];
export function rowReducer(row: string[]); // Transform CSV rows to objects

// Data transformation
export function extractGoogleQuery(value: string): string; // URL extraction
export function processLocationFields(row: any): void; // Location parsing
export function generateSlug(name: string): string; // Slug generation
```

**Features:**

- Robust CSV parsing (handles quotes, commas, newlines)
- Google Sheets link extraction
- HTML tag stripping
- Location field standardization

#### B. String Utilities (`app/utils/string.ts`)

**Purpose:** Text processing and transformation utilities

**Key Functions:**

```typescript
export function toSnakeCase(str: string): string;
export function getKebabCase(str: string): string;
export function stripTags(str: string): string;
export function isAllEmptyString(array: string[]): boolean;
```

**Features:**

- Consistent string transformations
- HTML sanitization
- Validation helpers

#### C. Build Script (`app/scripts/fetch-data.ts`)

**Purpose:** Build-time data fetching and processing

**Process:**

1. Fetch CSV from Google Sheets URL
2. Parse and validate CSV data
3. Transform rows using field processors
4. Generate report and category JSON files
5. Update timestamp file
6. Handle errors gracefully

### 4. Configure Build-time Data Integration

#### Package.json Integration

```json
{
  "scripts": {
    "fetch": "node --require tsx app/scripts/fetch-data.ts",
    "build": "npm run fetch && react-router build"
  }
}
```

#### React Router Integration

- Configure static data loading for reports and categories
- Set up prerendering for category pages
- Ensure data availability during build process

## Technical Decisions

### Data Storage Strategy

- **JSON files** for development and fallback
- **Build-time fetching** from Google Sheets for production
- **Static generation** for optimal performance

### Error Handling Approach

- **Graceful degradation** - Fall back to existing JSON data if fetch fails
- **Build process continuation** - Don't fail build on data fetch errors
- **Validation layers** - Multiple validation points in data pipeline

### Performance Optimizations

- **O(1) lookups** via Record mappings for categories
- **Static data** loaded at build time, not runtime
- **Minimal transformation** - Process data once during build

## File Structure

```tree
app/
├── lib/
│   ├── data.ts          # Report data access layer
│   ├── categories.ts    # Category management system
│   └── types.ts         # TypeScript interfaces (existing)
├── utils/
│   ├── google-sheets.ts # Google Sheets integration
│   └── string.ts        # String processing utilities
├── scripts/
│   └── fetch-data.ts    # Build-time data fetching
└── data/                # JSON data files (existing)
```

## Next Steps

1. **Implement core data utilities** - Start with `app/lib/data.ts` and category
   system
2. **Build fetching infrastructure** - Create Google Sheets integration
3. **Add build process** - Integrate data fetching into build pipeline
4. **Test and validate** - Ensure data consistency and error handling

## References

- **Main Documentation**: [docs/index.md](../index.md)
- **senar.ai Reference**: <https://github.com/senar-ai/web>
- **Phase 1 Completion**: TypeScript interfaces and dummy data complete
