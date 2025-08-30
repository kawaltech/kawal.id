export interface Report {
  readonly id: number
  readonly title: string
  readonly description: string
  readonly categorySlug: string
  readonly url?: string
  readonly location?: {
    lat: number
    lng: number
    address?: string
    desa?: string
    kecamatan?: string
    kabupaten?: string
    provinsi?: string
    negara?: string
    benua?: string
  }
  readonly timestamp: string
  readonly status?: 'pending' | 'verified' | 'resolved'
  readonly tags?: string[]
  readonly source?: 'form' | 'manual' | 'api'
  readonly image?: string
}

export type Reports = Report[]

export interface Category {
  readonly title: string
  readonly slug: string
  readonly description: string
  readonly iconSet?: 'duotone' | 'light' | 'regular'
  readonly iconId?: string
  readonly iconForeground: string
  readonly iconBackground: string
}

export type Categories = Category[]

export interface Timestamp {
  readonly lastUpdated: string
}

export interface URLEmbedData {
  platform: 'twitter' | 'instagram' | 'facebook' | 'youtube' | 'unknown'
  embedUrl?: string
  thumbnailUrl?: string
  title?: string
  description?: string
  error?: string
}

export interface Location {
  lat: number
  lng: number
  address?: string
  city?: string
  country?: string
}

export type ReportStatus = 'pending' | 'verified' | 'resolved'
export type Platform = 'twitter' | 'instagram' | 'facebook' | 'youtube' | 'unknown'

export interface SearchFilters {
  category?: string
  status?: ReportStatus
  location?: string
  dateFrom?: string
  dateTo?: string
  query?: string
}

export interface ReportFormData {
  title: string
  description: string
  categorySlug: string
  url?: string
  location?: {
    lat: number
    lng: number
    address?: string
    desa?: string
    kecamatan?: string
    kabupaten?: string
    provinsi?: string
    negara?: string
  }
  tags?: string[]
}

// Utility types for better data management
export type CategoriesRecord = Record<string, Category>

// Helper function types
export type GetCategoryBySlug = (slug: string) => Category | undefined