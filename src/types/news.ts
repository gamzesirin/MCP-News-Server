export interface NewsItem {
    id: string
    title: string
    description?: string
    content?: string
    link: string
    pubDate: Date
    source: string
    category?: string
    imageUrl?: string
    summary?: string
}

export interface NewsFeed {
    title: string
    description?: string
    link: string
    items: NewsItem[]
    lastUpdate: Date
}

export interface SummaryResult {
    originalText: string
    summary: string
    sentenceCount: number
    reductionRatio: number
    keywords?: string[]
}

// Sentiment Analysis Types
export interface SentimentResult {
    score: number
    comparative: number
    label: 'positive' | 'negative' | 'neutral'
    confidence: number
    positiveWords: string[]
    negativeWords: string[]
}

// Duplicate Detection Types
export interface DuplicateItem {
    news: NewsItem
    similarity: number
    titleSimilarity: number
    contentSimilarity: number
}

export interface DuplicateGroup {
    mainNews: NewsItem
    duplicates: DuplicateItem[]
    averageSimilarity: number
}

export interface DuplicateResult {
    totalNews: number
    uniqueCount: number
    duplicateGroupCount: number
    duplicateGroups: DuplicateGroup[]
    uniqueNews: NewsItem[]
    threshold: number
}
