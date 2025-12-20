import * as natural from 'natural'
import { SentimentResult } from '../types/news'

export class SentimentService {
	private tokenizer: any

	// Türkçe pozitif kelimeler
	private positiveWords: Set<string> = new Set([
		'başarı',
		'başarılı',
		'güzel',
		'harika',
		'mükemmel',
		'olumlu',
		'artış',
		'yükseliş',
		'kazanç',
		'kar',
		'gelişme',
		'ilerleme',
		'büyüme',
		'rekor',
		'zafer',
		'mutlu',
		'sevindirici',
		'umut',
		'umutlu',
		'iyi',
		'iyileşme',
		'pozitif',
		'destek',
		'destekli',
		'avantaj',
		'fırsat',
		'yenilik',
		'yenilikçi',
		'verimli',
		'verimlilik',
		'kaliteli',
		'güçlü',
		'sağlam',
		'istikrar',
		'istikrarlı',
		'barış',
		'huzur',
		'refah',
		'zengin',
		'zenginlik',
		'övgü',
		'takdir',
		'ödül',
		'başarım',
		'kazanım',
		'atılım',
		'zirve',
		'lider',
		'liderlik',
		'çözüm',
		'anlaşma',
		'uzlaşma',
		'işbirliği',
		'dayanışma',
		'yardım'
	])

	// Türkçe negatif kelimeler
	private negativeWords: Set<string> = new Set([
		'kötü',
		'olumsuz',
		'düşüş',
		'azalış',
		'kayıp',
		'zarar',
		'kriz',
		'sorun',
		'problem',
		'tehlike',
		'tehlikeli',
		'risk',
		'riskli',
		'endişe',
		'kaygı',
		'korku',
		'panik',
		'çöküş',
		'iflas',
		'başarısız',
		'başarısızlık',
		'felaket',
		'yıkım',
		'yıkıcı',
		'ölüm',
		'öldü',
		'saldırı',
		'savaş',
		'çatışma',
		'terör',
		'şiddet',
		'suç',
		'suçlu',
		'tutuklandı',
		'hapis',
		'ceza',
		'yasak',
		'yasaklandı',
		'iptal',
		'ertelendi',
		'durduruldu',
		'engel',
		'engellendi',
		'reddedildi',
		'protesto',
		'grev',
		'enflasyon',
		'işsizlik',
		'yoksulluk',
		'fakir',
		'hastalık',
		'salgın',
		'virüs',
		'deprem',
		'sel',
		'yangın',
		'kaza',
		'çarpışma',
		'patlama',
		'acı',
		'üzücü',
		'trajedi',
		'trajik',
		'vahşet',
		'cinayet',
		'taciz',
		'istismar',
		'yolsuzluk',
		'rüşvet',
		'skandal',
		'ihanet'
	])

	// Yoğunlaştırıcı kelimeler (intensifiers)
	private intensifiers: Map<string, number> = new Map([
		['çok', 1.5],
		['son derece', 2.0],
		['aşırı', 1.8],
		['oldukça', 1.3],
		['fazla', 1.4],
		['büyük', 1.3],
		['dev', 1.5],
		['devasa', 1.6],
		['muazzam', 1.7],
		['korkunç', 1.6],
		['inanılmaz', 1.5],
		['şiddetli', 1.5],
		['ağır', 1.4],
		['ciddi', 1.4],
		['kritik', 1.5]
	])

	// Olumsuzlaştırıcı kelimeler (negators)
	private negators: Set<string> = new Set(['değil', 'yok', 'olmadan', 'dışında', 'hariç', 'asla', 'hiç', 'hiçbir'])

	constructor() {
		this.tokenizer = new natural.WordTokenizer()
	}

	/**
	 * Metni analiz eder ve duygu skorunu döndürür
	 */
	analizEt(text: string): SentimentResult {
		if (!text || text.trim().length === 0) {
			return {
				score: 0,
				comparative: 0,
				label: 'neutral',
				confidence: 0,
				positiveWords: [],
				negativeWords: []
			}
		}

		const words = this.tokenizer.tokenize(text.toLowerCase())
		const foundPositive: string[] = []
		const foundNegative: string[] = []

		let score = 0
		let wordCount = 0
		let currentIntensifier = 1
		let isNegated = false

		for (let i = 0; i < words.length; i++) {
			const word = words[i]

			// Yoğunlaştırıcı kontrolü
			if (this.intensifiers.has(word)) {
				currentIntensifier = this.intensifiers.get(word) || 1
				continue
			}

			// Olumsuzlaştırıcı kontrolü
			if (this.negators.has(word)) {
				isNegated = true
				continue
			}

			// Pozitif kelime kontrolü
			if (this.positiveWords.has(word)) {
				let wordScore = 1 * currentIntensifier
				if (isNegated) {
					wordScore = -wordScore
					foundNegative.push(word)
				} else {
					foundPositive.push(word)
				}
				score += wordScore
				wordCount++
			}

			// Negatif kelime kontrolü
			if (this.negativeWords.has(word)) {
				let wordScore = -1 * currentIntensifier
				if (isNegated) {
					wordScore = -wordScore
					foundPositive.push(word)
				} else {
					foundNegative.push(word)
				}
				score += wordScore
				wordCount++
			}

			// Yoğunlaştırıcı ve olumsuzlaştırıcı etkisini sıfırla
			currentIntensifier = 1
			isNegated = false
		}

		// Comparative skor (kelime sayısına göre normalize)
		const comparative = wordCount > 0 ? score / wordCount : 0

		// Güven skoru hesapla (bulunan kelime sayısına göre)
		const confidence = Math.min(wordCount / 5, 1) // Max 5 kelimede %100 güven

		// Label belirleme
		let label: 'positive' | 'negative' | 'neutral'
		if (score > 0.5) {
			label = 'positive'
		} else if (score < -0.5) {
			label = 'negative'
		} else {
			label = 'neutral'
		}

		return {
			score: Math.round(score * 100) / 100,
			comparative: Math.round(comparative * 100) / 100,
			label,
			confidence: Math.round(confidence * 100) / 100,
			positiveWords: [...new Set(foundPositive)],
			negativeWords: [...new Set(foundNegative)]
		}
	}

	/**
	 * Birden fazla metni analiz eder
	 */
	cokluAnalizEt(texts: string[]): {
		results: SentimentResult[]
		aggregate: {
			averageScore: number
			overallLabel: 'positive' | 'negative' | 'neutral'
			positiveCount: number
			negativeCount: number
			neutralCount: number
		}
	} {
		const results = texts.map((text) => this.analizEt(text))

		let positiveCount = 0
		let negativeCount = 0
		let neutralCount = 0
		let totalScore = 0

		results.forEach((result) => {
			totalScore += result.score
			if (result.label === 'positive') positiveCount++
			else if (result.label === 'negative') negativeCount++
			else neutralCount++
		})

		const averageScore = results.length > 0 ? totalScore / results.length : 0

		let overallLabel: 'positive' | 'negative' | 'neutral'
		if (averageScore > 0.5) {
			overallLabel = 'positive'
		} else if (averageScore < -0.5) {
			overallLabel = 'negative'
		} else {
			overallLabel = 'neutral'
		}

		return {
			results,
			aggregate: {
				averageScore: Math.round(averageScore * 100) / 100,
				overallLabel,
				positiveCount,
				negativeCount,
				neutralCount
			}
		}
	}

	/**
	 * Haber başlığı ve içeriğini birlikte analiz eder
	 * Başlığa daha fazla ağırlık verir
	 */
	haberAnalizEt(title: string, content?: string): SentimentResult & { titleSentiment: SentimentResult } {
		const titleResult = this.analizEt(title)
		const contentResult = content ? this.analizEt(content) : null

		// Başlığa %60, içeriğe %40 ağırlık ver
		let combinedScore: number
		let combinedComparative: number

		if (contentResult) {
			combinedScore = titleResult.score * 0.6 + contentResult.score * 0.4
			combinedComparative = titleResult.comparative * 0.6 + contentResult.comparative * 0.4
		} else {
			combinedScore = titleResult.score
			combinedComparative = titleResult.comparative
		}

		let label: 'positive' | 'negative' | 'neutral'
		if (combinedScore > 0.5) {
			label = 'positive'
		} else if (combinedScore < -0.5) {
			label = 'negative'
		} else {
			label = 'neutral'
		}

		const allPositive = [...titleResult.positiveWords, ...(contentResult?.positiveWords || [])]
		const allNegative = [...titleResult.negativeWords, ...(contentResult?.negativeWords || [])]

		return {
			score: Math.round(combinedScore * 100) / 100,
			comparative: Math.round(combinedComparative * 100) / 100,
			label,
			confidence: titleResult.confidence,
			positiveWords: [...new Set(allPositive)],
			negativeWords: [...new Set(allNegative)],
			titleSentiment: titleResult
		}
	}
}
