import * as natural from 'natural'
import { NewsItem, DuplicateGroup, DuplicateResult } from '../types/news'

export class DuplicateService {
	private tokenizer: any
	private stopWords: Set<string>

	constructor() {
		this.tokenizer = new natural.WordTokenizer()

		// Türkçe stop words
		this.stopWords = new Set([
			've',
			'ile',
			'veya',
			'ama',
			'ancak',
			'için',
			'gibi',
			'kadar',
			'bir',
			'bu',
			'şu',
			'o',
			'ki',
			'de',
			'da',
			'olan',
			'olarak',
			'daha',
			'çok',
			'en',
			'her',
			'var',
			'yok',
			'ne',
			'nasıl',
			'neden',
			'nerede'
		])
	}

	/**
	 * Metni tokenize eder ve normalize eder
	 */
	private metniOnIsle(text: string): string[] {
		const words = this.tokenizer.tokenize(text.toLowerCase())
		return words.filter((word: string) => word.length > 2 && !this.stopWords.has(word))
	}

	/**
	 * İki metin arasındaki Jaccard benzerliğini hesaplar
	 */
	private jaccardBenzerligi(text1: string, text2: string): number {
		const set1 = new Set(this.metniOnIsle(text1))
		const set2 = new Set(this.metniOnIsle(text2))

		if (set1.size === 0 && set2.size === 0) return 1
		if (set1.size === 0 || set2.size === 0) return 0

		const intersection = new Set([...set1].filter((x) => set2.has(x)))
		const union = new Set([...set1, ...set2])

		return intersection.size / union.size
	}

	/**
	 * İki haber arasındaki genel benzerliği hesaplar (Jaccard metin benzerliği)
	 */
	benzerlikHesapla(
		news1: NewsItem,
		news2: NewsItem
	): {
		overall: number
		titleSimilarity: number
		contentSimilarity: number
		method: string
	} {
		// Başlık benzerliği (Jaccard)
		const titleSimilarity = this.jaccardBenzerligi(news1.title, news2.title)

		// İçerik benzerliği (varsa)
		let contentSimilarity = 0
		const content1 = news1.content || news1.description || ''
		const content2 = news2.content || news2.description || ''

		if (content1 && content2) {
			contentSimilarity = this.jaccardBenzerligi(content1, content2)
		}

		// Genel skor: Başlık %60, İçerik %40
		const overall = content1 && content2 ? titleSimilarity * 0.6 + contentSimilarity * 0.4 : titleSimilarity

		return {
			overall: Math.round(overall * 100) / 100,
			titleSimilarity: Math.round(titleSimilarity * 100) / 100,
			contentSimilarity: Math.round(contentSimilarity * 100) / 100,
			method: content1 && content2 ? 'title+content' : 'title-only'
		}
	}

	/**
	 * Haber listesindeki muhtemel kopyaları bulur
	 */
	kopyalariBul(news: NewsItem[], threshold: number = 0.6): DuplicateResult {
		const duplicateGroups: DuplicateGroup[] = []
		const processed = new Set<string>()
		const uniqueNews: NewsItem[] = []

		for (let i = 0; i < news.length; i++) {
			if (processed.has(news[i].id)) continue

			const group: DuplicateGroup = {
				mainNews: news[i],
				duplicates: [],
				averageSimilarity: 0
			}

			let totalSimilarity = 0
			let duplicateCount = 0

			for (let j = i + 1; j < news.length; j++) {
				if (processed.has(news[j].id)) continue

				const similarity = this.benzerlikHesapla(news[i], news[j])

				if (similarity.overall >= threshold) {
					group.duplicates.push({
						news: news[j],
						similarity: similarity.overall,
						titleSimilarity: similarity.titleSimilarity,
						contentSimilarity: similarity.contentSimilarity
					})
					processed.add(news[j].id)
					totalSimilarity += similarity.overall
					duplicateCount++
				}
			}

			processed.add(news[i].id)

			if (group.duplicates.length > 0) {
				group.averageSimilarity = Math.round((totalSimilarity / duplicateCount) * 100) / 100
				duplicateGroups.push(group)
			} else {
				uniqueNews.push(news[i])
			}
		}

		return {
			totalNews: news.length,
			uniqueCount: uniqueNews.length + duplicateGroups.length,
			duplicateGroupCount: duplicateGroups.length,
			duplicateGroups,
			uniqueNews,
			threshold
		}
	}

	/**
	 * Belirli bir haberin kopyalarını bulur
	 */
	belirliKopyalariBul(targetNews: NewsItem, newsList: NewsItem[], threshold: number = 0.6): DuplicateGroup {
		const group: DuplicateGroup = {
			mainNews: targetNews,
			duplicates: [],
			averageSimilarity: 0
		}

		let totalSimilarity = 0

		for (const news of newsList) {
			if (news.id === targetNews.id) continue

			const similarity = this.benzerlikHesapla(targetNews, news)

			if (similarity.overall >= threshold) {
				group.duplicates.push({
					news,
					similarity: similarity.overall,
					titleSimilarity: similarity.titleSimilarity,
					contentSimilarity: similarity.contentSimilarity
				})
				totalSimilarity += similarity.overall
			}
		}

		if (group.duplicates.length > 0) {
			group.averageSimilarity = Math.round((totalSimilarity / group.duplicates.length) * 100) / 100
		}

		// Benzerliğe göre sırala
		group.duplicates.sort((a, b) => b.similarity - a.similarity)

		return group
	}

	/**
	 * Haberleri gruplar ve her gruptan en kapsamlı olanı seçer
	 */
	haberleriTekillesir(news: NewsItem[], threshold: number = 0.6): NewsItem[] {
		const result = this.kopyalariBul(news, threshold)
		const deduplicatedNews: NewsItem[] = [...result.uniqueNews]

		// Her duplicate grubundan en iyi haberi seç
		for (const group of result.duplicateGroups) {
			const allInGroup = [group.mainNews, ...group.duplicates.map((d) => d.news)]

			// En uzun içeriğe sahip olanı seç
			const best = allInGroup.reduce((prev, current) => {
				const prevLength = (prev.content?.length || 0) + (prev.description?.length || 0)
				const currentLength = (current.content?.length || 0) + (current.description?.length || 0)
				return currentLength > prevLength ? current : prev
			})

			deduplicatedNews.push(best)
		}

		// Tarihe göre sırala (en yeni önce)
		deduplicatedNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

		return deduplicatedNews
	}

	/**
	 * İki haberin kopya olup olmadığını kontrol eder
	 */
	kopyaMi(news1: NewsItem, news2: NewsItem, threshold: number = 0.6): boolean {
		const similarity = this.benzerlikHesapla(news1, news2)
		return similarity.overall >= threshold
	}
}
