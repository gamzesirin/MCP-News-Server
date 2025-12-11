import express from 'express'
import cors from 'cors'
import path from 'path'
import { NewsService } from './services/newsService'
import { SummaryService } from './services/summaryService'
import { CacheService } from './services/cacheService'
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

		let news = await newsService.fetchAllNews()

		if (category) {
			news = newsService.filterByCategory(news, category as string)
		}
		if (keyword) {
			news = newsService.searchNews(news, keyword as string)
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

		const result = summaryService.summarize(text, sentenceCount, {
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
		const allNews = await newsService.fetchAllNews()
		const last24h = allNews.filter((n) => {
			const hoursDiff = (Date.now() - n.pubDate.getTime()) / (1000 * 60 * 60)
			return hoursDiff <= 24
		})

		const allText = last24h.map((n) => n.title + ' ' + (n.description || '')).join(' ')
		const summary = summaryService.summarize(allText, 3, { extractKeywords: true })

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

app.listen(PORT, () => {
	console.log(`Web server http://localhost:${PORT} adresinde çalışıyor`)
	console.log(`API dokümantasyonu için http://localhost:${PORT} adresini ziyaret edin`)
})
