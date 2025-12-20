import * as natural from 'natural'
import { SummaryResult } from '../types/news'

export class SummaryService {
	private tokenizer: any
	private tfidf: any
	private stopWords: Set<string>

	constructor() {
		// Natural kütüphanesi tokenizer'ı
		this.tokenizer = new natural.WordTokenizer()
		this.tfidf = new natural.TfIdf()

		// Türkçe stop words (yaygın kullanılan anlamsız kelimeler)
		this.stopWords = new Set([
			've',
			'ile',
			'veya',
			'ama',
			'ancak',
			'fakat',
			'çünkü',
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
			'mi',
			'mı',
			'mu',
			'mü',
			'olan',
			'olarak',
			'daha',
			'çok',
			'en',
			'her',
			'bazı',
			'hiç',
			'şey',
			'ben',
			'sen',
			'o',
			'biz',
			'siz',
			'onlar',
			'bunu',
			'şunu',
			'onu',
			'var',
			'yok',
			'evet',
			'hayır',
			'ne',
			'nasıl',
			'neden',
			'niçin',
			'nerede',
			'hangi',
			'hangisi',
			'kim',
			'kimin',
			'şöyle',
			'böyle',
			'işte',
			'yani',
			'ya',
			'hem',
			'hep',
			'artık',
			'henüz',
			'sadece',
			'yalnız',
			'tüm',
			'bütün'
		])
	}

	/**
	 * Metni cümlelere ayırır
	 */
	private cumlelereAyir(text: string): string[] {
		// Türkçe cümle sonları için özel işleme
		const sentences = text
			.replace(/([.!?])\s*(?=[A-ZÇĞİÖŞÜ])/g, '$1|')
			.split('|')
			.map((s) => s.trim())
			.filter((s) => s.length > 10) // Çok kısa cümleleri ele

		return sentences
	}

	/**
	 * Kelimeleri temizler ve normalize eder
	 */
	private kelimeleriIsle(text: string): string[] {
		const words = this.tokenizer.tokenize(text.toLowerCase())
		return words.filter((word: string) => {
			return word.length > 2 && !this.stopWords.has(word)
		})
	}

	/**
	 * Cümleleri TF-IDF skorlarına göre sıralar
	 */
	private cumleleriSkorla(sentences: string[]): Array<{ sentence: string; score: number }> {
		const scoredSentences: Array<{ sentence: string; score: number }> = []

		// TF-IDF hesaplama için tüm cümleleri ekle
		sentences.forEach((sentence) => {
			this.tfidf.addDocument(this.kelimeleriIsle(sentence))
		})

		// Her cümle için skor hesapla
		sentences.forEach((sentence, index) => {
			let score = 0
			const words = this.kelimeleriIsle(sentence)

			// Her kelime için TF-IDF skorunu topla
			words.forEach((word: string) => {
				this.tfidf.tfidfs(word, (i: number, measure: number) => {
					if (i === index) {
						score += measure
					}
				})
			})

			// Cümle pozisyonuna göre bonus (ilk ve son cümleler genelde önemli)
			if (index === 0) score *= 1.2
			if (index === sentences.length - 1) score *= 1.1

			// Cümle uzunluğuna göre normalizasyon
			score = score / Math.sqrt(words.length)

			scoredSentences.push({ sentence, score })
		})

		// Skora göre sırala
		scoredSentences.sort((a, b) => b.score - a.score)

		return scoredSentences
	}

	/**
	 * Anahtar kelimeleri çıkarır
	 */
	private anahtarKelimelerCikar(text: string, count: number = 5): string[] {
		const words = this.kelimeleriIsle(text)
		const wordFreq = new Map<string, number>()

		// Kelime frekanslarını hesapla
		words.forEach((word: string) => {
			wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
		})

		// Frekansa göre sırala ve ilk N kelimeyi al
		const sortedWords = Array.from(wordFreq.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, count)
			.map(([word]) => word)

		return sortedWords
	}

	/**
	 * Metni özetler
	 */
	ozetle(text: string, sentenceCount: number = 3, options: { extractKeywords?: boolean } = {}): SummaryResult {
		// Boş veya çok kısa metin kontrolü
		if (!text || text.length < 100) {
			return {
				originalText: text,
				summary: text,
				sentenceCount: 1,
				reductionRatio: 0,
				keywords: options.extractKeywords ? [] : undefined
			}
		}

		// TF-IDF'i sıfırla
		this.tfidf = new natural.TfIdf()

		// Cümlelere ayır
		const sentences = this.cumlelereAyir(text)

		// Eğer cümle sayısı istenen özet uzunluğundan azsa, tüm metni döndür
		if (sentences.length <= sentenceCount) {
			return {
				originalText: text,
				summary: sentences.join(' '),
				sentenceCount: sentences.length,
				reductionRatio: 0,
				keywords: options.extractKeywords ? this.anahtarKelimelerCikar(text) : undefined
			}
		}

		// Cümleleri skorla
		const scoredSentences = this.cumleleriSkorla(sentences)

		// En yüksek skorlu cümleleri seç
		const selectedSentences = scoredSentences.slice(0, sentenceCount).map((item) => item.sentence)

		// Orijinal sıralamayı koru (metin akışı için)
		const orderedSentences = sentences.filter((sentence) => selectedSentences.includes(sentence))

		const summary = orderedSentences.join(' ')

		// Özet istatistikleri
		const result: SummaryResult = {
			originalText: text,
			summary,
			sentenceCount: orderedSentences.length,
			reductionRatio: ((text.length - summary.length) / text.length) * 100
		}

		// Anahtar kelimeler isteniyorsa ekle
		if (options.extractKeywords) {
			result.keywords = this.anahtarKelimelerCikar(text)
		}

		return result
	}

	/**
	 * Birden fazla haber metnini birleştirip özetler
	 */
	cokluOzetle(texts: string[], totalSentences: number = 5): SummaryResult {
		// Tüm metinleri birleştir
		const combinedText = texts.join(' ')
		return this.ozetle(combinedText, totalSentences, { extractKeywords: true })
	}

	/**
	 * Başlık oluşturur (özetten ilk cümleyi alır ve kısaltır)
	 */
	baslikOlustur(text: string, maxLength: number = 100): string {
		const summary = this.ozetle(text, 1)
		let title = summary.summary

		if (title.length > maxLength) {
			title = title.substring(0, maxLength - 3) + '...'
		}

		return title
	}
}
