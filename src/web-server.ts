import express from 'express'
import cors from 'cors'
import path from 'path'
import { NewsService } from './services/newsService'
import { SummaryService } from './services/summaryService'
import { CacheService } from './services/cacheService'
import { SentimentService } from './services/sentimentService'
import { DuplicateService } from './services/duplicateService'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '../src')))

// Services
const newsService = new NewsService()
const summaryService = new SummaryService()
const sentimentService = new SentimentService()
const duplicateService = new DuplicateService()
// Cache service başlatılıyor ama bu örnekte kullanılmıyor
new CacheService()

// Routes
app.get('/', (_req, res) => {
	res.sendFile(path.join(__dirname, '../src/frontend.html'))
})

// Haberleri getir
app.get('/api/news', async (req, res) => {
	try {
		const { category, keyword, limit = 10 } = req.query

		let news = await newsService.tumHaberleriCek()

		if (category) {
			news = newsService.kategoriyeGoreFiltrele(news, category as string)
		}
		if (keyword) {
			news = newsService.haberleriAra(news, keyword as string)
		}

		res.json({
			success: true,
			count: news.length,
			data: news.slice(0, Number(limit))
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// Metin özetle
app.post('/api/summarize', (req, res) => {
	try {
		const { text, sentenceCount = 3 } = req.body

		if (!text) {
			res.status(400).json({
				success: false,
				error: 'Metin gerekli'
			})
			return
		}

		const result = summaryService.ozetle(text, sentenceCount, {
			extractKeywords: true
		})

		res.json({
			success: true,
			data: result
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// Trend analizi
app.get('/api/trends', async (_req, res) => {
	try {
		const allNews = await newsService.tumHaberleriCek()
		const last24h = allNews.filter((n) => {
			const hoursDiff = (Date.now() - n.pubDate.getTime()) / (1000 * 60 * 60)
			return hoursDiff <= 24
		})

		const allText = last24h.map((n) => n.title + ' ' + (n.description || '')).join(' ')
		const summary = summaryService.ozetle(allText, 3, { extractKeywords: true })

		res.json({
			success: true,
			data: {
				newsCount: last24h.length,
				period: 'Son 24 saat',
				keywords: summary.keywords,
				summary: summary.summary,
				latestNews: last24h.slice(0, 5).map((n) => ({
					title: n.title,
					date: n.pubDate,
					source: n.source
				}))
			}
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// Tekil metin duygu analizi
app.post('/api/sentiment', (req, res) => {
	try {
		const { text } = req.body

		if (!text) {
			res.status(400).json({
				success: false,
				error: 'Metin gerekli'
			})
			return
		}

		const result = sentimentService.analizEt(text)

		res.json({
			success: true,
			data: result
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// Haberlerin toplu duygu analizi
app.get('/api/sentiment/news', async (req, res) => {
	try {
		const { category, limit = 10 } = req.query

		let news = await newsService.tumHaberleriCek()

		if (category) {
			news = newsService.kategoriyeGoreFiltrele(news, category as string)
		}

		news = news.slice(0, Number(limit))

		const texts = news.map((n) => `${n.title} ${n.description || ''}`)
		const batchResult = sentimentService.cokluAnalizEt(texts)

		const detailedResults = news.map((n, i) => ({
			id: n.id,
			title: n.title,
			source: n.source,
			pubDate: n.pubDate,
			sentiment: batchResult.results[i]
		}))

		res.json({
			success: true,
			data: {
				summary: {
					totalAnalyzed: news.length,
					averageScore: batchResult.aggregate.averageScore,
					overallLabel: batchResult.aggregate.overallLabel,
					distribution: {
						positive: batchResult.aggregate.positiveCount,
						negative: batchResult.aggregate.negativeCount,
						neutral: batchResult.aggregate.neutralCount
					}
				},
				news: detailedResults
			}
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// Tekrarlayan haberleri bul
app.get('/api/duplicates', async (req, res) => {
	try {
		const { threshold = 0.6, category } = req.query

		let news = await newsService.tumHaberleriCek()

		if (category) {
			news = newsService.kategoriyeGoreFiltrele(news, category as string)
		}

		const result = duplicateService.kopyalariBul(news, Number(threshold))

		const duplicateInfo = result.duplicateGroups.map((group) => ({
			mainNews: {
				id: group.mainNews.id,
				title: group.mainNews.title,
				source: group.mainNews.source,
				pubDate: group.mainNews.pubDate
			},
			duplicateCount: group.duplicates.length,
			averageSimilarity: group.averageSimilarity,
			duplicates: group.duplicates.map((d) => ({
				id: d.news.id,
				title: d.news.title,
				source: d.news.source,
				similarity: Math.round(d.similarity * 100)
			}))
		}))

		res.json({
			success: true,
			data: {
				summary: {
					totalNews: result.totalNews,
					uniqueCount: result.uniqueCount,
					duplicateGroups: result.duplicateGroupCount,
					threshold: result.threshold
				},
				duplicateGroups: duplicateInfo
			}
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// Benzersiz haberleri getir (duplicate'lar temizlenmiş)
app.get('/api/news/unique', async (req, res) => {
	try {
		const { threshold = 0.6, limit = 20, category } = req.query

		let news = await newsService.tumHaberleriCek()

		if (category) {
			news = newsService.kategoriyeGoreFiltrele(news, category as string)
		}

		const uniqueNews = duplicateService.haberleriTekillesir(news, Number(threshold)).slice(0, Number(limit))

		res.json({
			success: true,
			count: uniqueNews.length,
			originalCount: news.length,
			data: uniqueNews
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

// İki metin arasındaki benzerliği kontrol et
app.post('/api/similarity', (req, res) => {
	try {
		const { text1, text2 } = req.body

		if (!text1 || !text2) {
			res.status(400).json({
				success: false,
				error: 'İki metin de gerekli (text1, text2)'
			})
			return
		}

		// Geçici NewsItem nesneleri oluştur
		const news1 = {
			id: '1',
			title: text1,
			link: '',
			pubDate: new Date(),
			source: ''
		}
		const news2 = {
			id: '2',
			title: text2,
			link: '',
			pubDate: new Date(),
			source: ''
		}

		const similarity = duplicateService.benzerlikHesapla(news1, news2)

		res.json({
			success: true,
			data: {
				similarity: Math.round(similarity.overall * 100),
				titleSimilarity: Math.round(similarity.titleSimilarity * 100),
				isDuplicate: similarity.overall >= 0.6,
				method: similarity.method
			}
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Hata oluştu'
		})
	}
})

app.listen(PORT, () => {
	console.log(`Web server http://localhost:${PORT} adresinde çalışıyor`)
	console.log(`API dokümantasyonu için http://localhost:${PORT} adresini ziyaret edin`)
})
