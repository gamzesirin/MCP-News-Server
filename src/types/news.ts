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
