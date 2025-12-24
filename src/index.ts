import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
	ListPromptsRequestSchema,
	GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { NewsService } from './services/newsService.js'
import { SummaryService } from './services/summaryService.js'
import { CacheService } from './services/cacheService.js'
import { SentimentService } from './services/sentimentService.js'
import { DuplicateService } from './services/duplicateService.js'
import { NewsItem } from './types/news.js'
import dotenv from 'dotenv'

// .env dosyasını yükle
dotenv.config()

// Global servis instances
let newsService: NewsService
let summaryService: SummaryService
let cacheService: CacheService
let sentimentService: SentimentService
let duplicateService: DuplicateService

// MCP Server oluştur
const server = new Server(
	{
		name: process.env.MCP_SERVER_NAME || 'mcp-news-server',
		version: process.env.MCP_SERVER_VERSION || '0.1.0'
	},
	{
		capabilities: {
			tools: {},
			resources: {},
			prompts: {}
		}
	}
)

// Tool tanımlamaları
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: 'haber_cek',
			description: 'RSS kaynaklarından güncel haberleri çeker',
			inputSchema: {
				type: 'object',
				properties: {
					source: {
						type: 'string',
						description: "Haber kaynağı URL'si (opsiyonel, boş bırakılırsa tüm kaynaklar)"
					},
					category: {
						type: 'string',
						description: 'Haber kategorisi filtresi (opsiyonel)'
					},
					keyword: {
						type: 'string',
						description: 'Arama kelimesi (opsiyonel)'
					},
					limit: {
						type: 'number',
						description: 'Maksimum haber sayısı (varsayılan: 10)',
						default: 10
					}
				}
			}
		},
		{
			name: 'haber_ozetle',
			description: 'Haber metnini özetler',
			inputSchema: {
				type: 'object',
				properties: {
					text: {
						type: 'string',
						description: 'Özetlenecek metin'
					},
					newsId: {
						type: 'string',
						description: "Alternatif olarak, daha önce çekilen haberin ID'si"
					},
					sentenceCount: {
						type: 'number',
						description: 'Özetteki cümle sayısı (varsayılan: 3)',
						default: 3
					},
					extractKeywords: {
						type: 'boolean',
						description: 'Anahtar kelimeleri çıkar (varsayılan: true)',
						default: true
					}
				},
				oneOf: [{ required: ['text'] }, { required: ['newsId'] }]
			}
		},
		{
			name: 'tam_icerik_al',
			description: 'Haberin tam içeriğini web sayfasından çeker',
			inputSchema: {
				type: 'object',
				properties: {
					url: {
						type: 'string',
						description: "Haber URL'si"
					},
					newsId: {
						type: 'string',
						description: "Alternatif olarak, daha önce çekilen haberin ID'si"
					}
				},
				oneOf: [{ required: ['url'] }, { required: ['newsId'] }]
			}
		},
		{
			name: 'trend_analiz',
			description: 'Haberlerdeki trendleri ve en çok kullanılan kelimeleri analiz eder',
			inputSchema: {
				type: 'object',
				properties: {
					hours: {
						type: 'number',
						description: 'Son kaç saatteki haberler (varsayılan: 24)',
						default: 24
					},
					topWords: {
						type: 'number',
						description: 'En çok kullanılan kelime sayısı (varsayılan: 10)',
						default: 10
					}
				}
			}
		},
		{
			name: 'duygu_analiz',
			description: 'Haber metninin duygusal tonunu analiz eder (pozitif/negatif/nötr)',
			inputSchema: {
				type: 'object',
				properties: {
					text: {
						type: 'string',
						description: 'Analiz edilecek metin'
					},
					newsId: {
						type: 'string',
						description: "Alternatif olarak, daha önce çekilen haberin ID'si"
					}
				},
				oneOf: [{ required: ['text'] }, { required: ['newsId'] }]
			}
		},
		{
			name: 'toplu_duygu_analiz',
			description: 'Birden fazla haberin duygusal tonunu toplu analiz eder',
			inputSchema: {
				type: 'object',
				properties: {
					category: {
						type: 'string',
						description: 'Kategori filtresi (opsiyonel)'
					},
					limit: {
						type: 'number',
						description: 'Maksimum haber sayısı (varsayılan: 10)',
						default: 10
					}
				}
			}
		},
		{
			name: 'kopyalari_bul',
			description: 'Haberlerdeki tekrarlayan/benzer içerikleri tespit eder',
			inputSchema: {
				type: 'object',
				properties: {
					threshold: {
						type: 'number',
						description: 'Benzerlik eşiği (0-1 arası, varsayılan: 0.6)',
						default: 0.6
					},
					category: {
						type: 'string',
						description: 'Kategori filtresi (opsiyonel)'
					}
				}
			}
		},
		{
			name: 'benzersiz_haberler',
			description: 'Tekrarlayan haberler temizlenmiş benzersiz haber listesi döndürür',
			inputSchema: {
				type: 'object',
				properties: {
					threshold: {
						type: 'number',
						description: 'Benzerlik eşiği (0-1 arası, varsayılan: 0.6)',
						default: 0.6
					},
					limit: {
						type: 'number',
						description: 'Maksimum haber sayısı (varsayılan: 20)',
						default: 20
					}
				}
			}
		},
		{
			name: 'kopya_kontrol',
			description: 'Belirli bir haberin başka haberlerle benzerliğini kontrol eder',
			inputSchema: {
				type: 'object',
				properties: {
					newsId: {
						type: 'string',
						description: "Kontrol edilecek haberin ID'si"
					},
					threshold: {
						type: 'number',
						description: 'Benzerlik eşiği (0-1 arası, varsayılan: 0.6)',
						default: 0.6
					}
				},
				required: ['newsId']
			}
		}
	]
}))

// Resource tanımlamaları
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
	resources: [
		{
			uri: 'news://recent',
			name: 'Son Haberler',
			description: "Cache'teki son haberler",
			mimeType: 'application/json'
		},
		{
			uri: 'news://sources',
			name: 'Haber Kaynakları',
			description: 'Aktif RSS feed kaynakları listesi',
			mimeType: 'application/json'
		},
		{
			uri: 'news://cache-stats',
			name: 'Cache İstatistikleri',
			description: 'Önbellek kullanım istatistikleri',
			mimeType: 'application/json'
		}
	]
}))

// Resource okuma handler'ı
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const { uri } = request.params

	switch (uri) {
		case 'news://recent': {
			const cachedNews = cacheService.getAllCachedNews()
			return {
				contents: [
					{
						uri,
						mimeType: 'application/json',
						text: JSON.stringify(cachedNews, null, 2)
					}
				]
			}
		}

		case 'news://sources': {
			const sources = process.env.RSS_FEEDS?.split(',') || [
				'https://feeds.bbci.co.uk/turkce/rss.xml,https://www.ensonhaber.com/rss/ensonhaber.xml,https://www.milliyet.com.tr/rss/rssnew/dunyarss.xml,https://www.bloomberght.com/rss'
			]
			return {
				contents: [
					{
						uri,
						mimeType: 'application/json',
						text: JSON.stringify({ sources }, null, 2)
					}
				]
			}
		}

		case 'news://cache-stats': {
			const stats = cacheService.getStats()
			return {
				contents: [
					{
						uri,
						mimeType: 'application/json',
						text: JSON.stringify(stats, null, 2)
					}
				]
			}
		}

		default:
			throw new Error(`Bilinmeyen resource: ${uri}`)
	}
})

// Prompt tanımlamaları
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
	prompts: [
		{
			name: 'gunluk_haber_ozeti',
			description: 'Günlük haber özeti oluşturur. Tüm kaynaklardan haberleri çeker ve kapsamlı bir özet sunar.',
			arguments: [
				{
					name: 'category',
					description: 'Haber kategorisi (opsiyonel, örn: ekonomi, spor, teknoloji)',
					required: false
				},
				{
					name: 'maxNews',
					description: 'Özete dahil edilecek maksimum haber sayısı (varsayılan: 10)',
					required: false
				}
			]
		},
		{
			name: 'konu_analizi',
			description: 'Belirli bir konu hakkında haberleri analiz eder ve detaylı bir rapor oluşturur.',
			arguments: [
				{
					name: 'topic',
					description: 'Analiz edilecek konu (zorunlu, örn: seçim, deprem, enflasyon)',
					required: true
				},
				{
					name: 'depth',
					description: 'Analiz derinliği: kısa, orta, detaylı (varsayılan: orta)',
					required: false
				}
			]
		},
		{
			name: 'haber_karsilastirma',
			description: 'Farklı haber kaynaklarının aynı konuyu nasıl ele aldığını karşılaştırır.',
			arguments: [
				{
					name: 'topic',
					description: 'Karşılaştırılacak konu (zorunlu)',
					required: true
				}
			]
		},
		{
			name: 'haftalik_brifing',
			description: 'Haftalık haber brifing raporu oluşturur. Öne çıkan haberler, trendler ve anahtar kelimeler içerir.',
			arguments: [
				{
					name: 'focusAreas',
					description: 'Odaklanılacak alanlar (opsiyonel, virgülle ayrılmış: ekonomi,siyaset,teknoloji)',
					required: false
				}
			]
		}
	]
}))

// Prompt getirme handler'ı
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
	const { name, arguments: args } = request.params

	switch (name) {
		case 'gunluk_haber_ozeti': {
			const category = args?.category || ''
			const maxNews = args?.maxNews || '10'
			return {
				description: 'Günlük haber özeti',
				messages: [
					{
						role: 'user',
						content: {
							type: 'text',
							text: `Lütfen güncel Türkçe haberleri analiz et ve kapsamlı bir günlük özet oluştur.

${category ? `Kategori: ${category}` : 'Tüm kategorilerden haberler'}
Maksimum haber sayısı: ${maxNews}

Şu adımları izle:
1. Önce fetch_news aracını kullanarak ${category ? `"${category}" kategorisindeki` : ''} güncel haberleri çek
2. Her haberin başlığını ve içeriğini analiz et
3. summarize_news aracını kullanarak önemli haberleri özetle
4. analyze_trends aracını kullanarak günün trendlerini belirle

Çıktı formatı:
- Günün Öne Çıkan Haberleri (en önemli 3-5 haber)
- Kategori Bazlı Özet
- Günün Anahtar Kelimeleri
- Genel Değerlendirme`
						}
					}
				]
			}
		}

		case 'konu_analizi': {
			const topic = args?.topic
			if (!topic) {
				throw new Error('topic parametresi zorunludur')
			}
			const depth = args?.depth || 'orta'

			const depthInstructions = {
				kısa: '2-3 cümlelik kısa bir özet',
				orta: 'orta detayda bir analiz (5-7 cümle)',
				detaylı: 'kapsamlı ve detaylı bir analiz (10+ cümle, farklı perspektifler dahil)'
			}

			return {
				description: `"${topic}" konusu hakkında haber analizi`,
				messages: [
					{
						role: 'user',
						content: {
							type: 'text',
							text: `"${topic}" konusu hakkında Türkçe haberleri analiz et.

Analiz derinliği: ${depth} - ${depthInstructions[depth as keyof typeof depthInstructions] || depthInstructions.orta}

Şu adımları izle:
1. fetch_news aracını kullanarak "${topic}" anahtar kelimesiyle haberleri ara
2. Bulunan haberlerin tam içeriğini get_full_content ile çek
3. summarize_news ile her haberi özetle
4. Tüm bilgileri sentezleyerek kapsamlı bir analiz oluştur

Çıktı formatı:
- Konu Özeti
- Farklı Kaynakların Yaklaşımları
- Kronolojik Gelişim (varsa)
- Anahtar Noktalar
- Sonuç ve Değerlendirme`
						}
					}
				]
			}
		}

		case 'haber_karsilastirma': {
			const topic = args?.topic
			if (!topic) {
				throw new Error('topic parametresi zorunludur')
			}

			return {
				description: `"${topic}" konusunda kaynak karşılaştırması`,
				messages: [
					{
						role: 'user',
						content: {
							type: 'text',
							text: `"${topic}" konusunu farklı haber kaynaklarının nasıl ele aldığını karşılaştır.

Kaynaklar: BBC Türkçe, Ensonhaber, Milliyet, BloombergHT

Şu adımları izle:
1. fetch_news aracını kullanarak "${topic}" ile ilgili haberleri tüm kaynaklardan çek
2. Her kaynaktan gelen haberleri ayrı ayrı analiz et
3. Kaynaklar arasındaki benzerlik ve farklılıkları belirle

Çıktı formatı:
- Kaynak Bazlı Özetler:
  * BBC Türkçe: [özet ve ton]
  * Ensonhaber: [özet ve ton]
  * Milliyet: [özet ve ton]
  * BloombergHT: [özet ve ton]
- Ortak Noktalar
- Farklı Yaklaşımlar
- Kaynak Güvenilirlik Değerlendirmesi
- Genel Sentez`
						}
					}
				]
			}
		}

		case 'haftalik_brifing': {
			const focusAreas = args?.focusAreas || ''

			return {
				description: 'Haftalık haber brifing raporu',
				messages: [
					{
						role: 'user',
						content: {
							type: 'text',
							text: `Haftalık haber brifing raporu oluştur.

${focusAreas ? `Odak alanları: ${focusAreas}` : 'Tüm kategoriler dahil'}

Şu adımları izle:
1. fetch_news aracını kullanarak son haberleri çek
2. analyze_trends aracını kullanarak son 168 saatteki (7 gün) trendleri analiz et
3. Öne çıkan haberleri summarize_news ile özetle

Çıktı formatı:
## Haftalık Haber Brifing Raporu

### Haftanın Öne Çıkan Gelişmeleri
[En önemli 5-7 haber]

### Trend Analizi
[Haftanın en çok konuşulan konuları]

### Kategori Bazlı Özet
${
	focusAreas
		? focusAreas
				.split(',')
				.map((area: string) => `- ${area.trim()}: [özet]`)
				.join('\n')
		: '- Ekonomi:\n- Siyaset:\n- Teknoloji:\n- Dünya:'
}

### Anahtar Kelimeler ve İstatistikler
[Haftanın anahtar kelimeleri ve haber sayıları]

### Önümüzdeki Hafta Beklentileri
[Takip edilmesi gereken konular]`
						}
					}
				]
			}
		}

		default:
			throw new Error(`Bilinmeyen prompt: ${name}`)
	}
})

// Tool çalıştırma handler'ı
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params

	try {
		switch (name) {
			case 'haber_cek': {
				const { source, category, keyword, limit = 10 } = args as any

				// Cache'ten kontrol et
				const cacheKey = `news:${source || 'all'}:${category || ''}:${keyword || ''}`
				const cached = cacheService.get(cacheKey)
				if (cached) {
					return {
						content: [
							{
								type: 'text',
								text: `Cache'ten ${cached.length} haber getirildi.`
							},
							{
								type: 'text',
								text: JSON.stringify(cached.slice(0, limit), null, 2)
							}
						]
					}
				}

				// Yeni haberler çek
				let news: NewsItem[]
				if (source) {
					const feed = await newsService.rssdenHaberleriCek(source)
					news = feed.items
				} else {
					news = await newsService.tumHaberleriCek()
				}

				// Filtrele
				if (category) {
					news = newsService.kategoriyeGoreFiltrele(news, category)
				}
				if (keyword) {
					news = newsService.haberleriAra(news, keyword)
				}

				// Limitle ve cache'le
				news = news.slice(0, limit)
				cacheService.set(cacheKey, news)

				// Haberleri ayrıca ID'leriyle cache'le
				news.forEach((item) => {
					cacheService.set(`news:id:${item.id}`, item)
				})

				return {
					content: [
						{
							type: 'text',
							text: `${news.length} haber başarıyla çekildi.`
						},
						{
							type: 'text',
							text: JSON.stringify(news, null, 2)
						}
					]
				}
			}

			case 'haber_ozetle': {
				const { text, newsId, sentenceCount = 3, extractKeywords = true } = args as any

				let contentToSummarize: string

				if (newsId) {
					const news = cacheService.get(`news:id:${newsId}`) as NewsItem
					if (!news) {
						throw new Error(`Haber bulunamadı: ${newsId}`)
					}
					contentToSummarize = news.content || news.description || news.title
				} else if (text) {
					contentToSummarize = text
				} else {
					throw new Error('text veya newsId parametresi gerekli')
				}

				const result = summaryService.ozetle(contentToSummarize, sentenceCount, { extractKeywords })

				return {
					content: [
						{
							type: 'text',
							text: `Özet başarıyla oluşturuldu (${result.reductionRatio.toFixed(1)}% azaltma)`
						},
						{
							type: 'text',
							text: JSON.stringify(result, null, 2)
						}
					]
				}
			}

			case 'tam_icerik_al': {
				const { url, newsId } = args as any

				let targetUrl: string

				if (newsId) {
					const news = cacheService.get(`news:id:${newsId}`) as NewsItem
					if (!news) {
						throw new Error(`Haber bulunamadı: ${newsId}`)
					}
					targetUrl = news.link
				} else if (url) {
					targetUrl = url
				} else {
					throw new Error('url veya newsId parametresi gerekli')
				}

				const content = await newsService.tamIcerikCek(targetUrl)

				return {
					content: [
						{
							type: 'text',
							text: `İçerik başarıyla çekildi (${content.length} karakter)`
						},
						{
							type: 'text',
							text: content
						}
					]
				}
			}

			case 'trend_analiz': {
				const { hours = 24 } = args as any

				const allNews = cacheService.getAllCachedNews()
				const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000)

				const recentNews = allNews.filter((news) => new Date(news.pubDate) > cutoffTime)

				if (recentNews.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: 'Belirtilen zaman aralığında haber bulunamadı.'
							}
						]
					}
				}

				// Tüm haberleri birleştir
				const allText = recentNews.map((news) => `${news.title} ${news.description || ''}`).join(' ')

				// Özet ve anahtar kelimeler
				const analysis = summaryService.ozetle(allText, 5, { extractKeywords: true })

				const result = {
					period: `Son ${hours} saat`,
					newsCount: recentNews.length,
					topKeywords: analysis.keywords,
					summary: analysis.summary,
					mostRecentNews: recentNews.slice(0, 5).map((n) => ({
						title: n.title,
						source: n.source,
						date: n.pubDate
					}))
				}

				return {
					content: [
						{
							type: 'text',
							text: `Son ${hours} saatteki ${recentNews.length} haber analiz edildi.`
						},
						{
							type: 'text',
							text: JSON.stringify(result, null, 2)
						}
					]
				}
			}

			// ============ SENTIMENT ANALYSIS TOOLS ============

			case 'duygu_analiz': {
				const { text, newsId } = args as any

				let contentToAnalyze: string
				let title: string | undefined

				if (newsId) {
					const news = cacheService.get(`news:id:${newsId}`) as NewsItem
					if (!news) {
						throw new Error(`Haber bulunamadı: ${newsId}`)
					}
					title = news.title
					contentToAnalyze = news.content || news.description || news.title
				} else if (text) {
					contentToAnalyze = text
				} else {
					throw new Error('text veya newsId parametresi gerekli')
				}

				const result = title
					? sentimentService.haberAnalizEt(title, contentToAnalyze)
					: sentimentService.analizEt(contentToAnalyze)

				const labelTr = {
					positive: 'Pozitif',
					negative: 'Negatif',
					neutral: 'Nötr'
				}

				return {
					content: [
						{
							type: 'text',
							text: `Duygu Analizi: ${labelTr[result.label]} (Skor: ${result.score})`
						},
						{
							type: 'text',
							text: JSON.stringify(result, null, 2)
						}
					]
				}
			}

			case 'toplu_duygu_analiz': {
				const { category, limit = 10 } = args as any

				let news = cacheService.getAllCachedNews()

				if (news.length === 0) {
					// Cache boşsa yeni haberler çek
					news = await newsService.tumHaberleriCek()
				}

				if (category) {
					news = newsService.kategoriyeGoreFiltrele(news, category)
				}

				news = news.slice(0, limit)

				const texts = news.map((n) => `${n.title} ${n.description || ''}`)
				const batchResult = sentimentService.cokluAnalizEt(texts)

				const detailedResults = news.map((n, i) => ({
					id: n.id,
					title: n.title,
					source: n.source,
					sentiment: batchResult.results[i]
				}))

				const labelTr = {
					positive: 'Pozitif',
					negative: 'Negatif',
					neutral: 'Nötr'
				}

				return {
					content: [
						{
							type: 'text',
							text: `${news.length} haber analiz edildi. Genel ton: ${
								labelTr[batchResult.aggregate.overallLabel]
							} (Ortalama skor: ${batchResult.aggregate.averageScore})`
						},
						{
							type: 'text',
							text: JSON.stringify(
								{
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
									details: detailedResults
								},
								null,
								2
							)
						}
					]
				}
			}

			// ============ DUPLICATE DETECTION TOOLS ============

			case 'kopyalari_bul': {
				const { threshold = 0.6, category } = args as any

				let news = cacheService.getAllCachedNews()

				if (news.length === 0) {
					news = await newsService.tumHaberleriCek()
				}

				if (category) {
					news = newsService.kategoriyeGoreFiltrele(news, category)
				}

				const result = duplicateService.kopyalariBul(news, threshold)

				const duplicateInfo = result.duplicateGroups.map((group) => ({
					mainNews: {
						id: group.mainNews.id,
						title: group.mainNews.title,
						source: group.mainNews.source
					},
					duplicateCount: group.duplicates.length,
					averageSimilarity: group.averageSimilarity,
					duplicates: group.duplicates.map((d) => ({
						id: d.news.id,
						title: d.news.title,
						source: d.news.source,
						similarity: `${Math.round(d.similarity * 100)}%`
					}))
				}))

				return {
					content: [
						{
							type: 'text',
							text: `${result.totalNews} haberden ${result.duplicateGroupCount} tekrarlayan grup bulundu. Benzersiz haber sayısı: ${result.uniqueCount}`
						},
						{
							type: 'text',
							text: JSON.stringify(
								{
									summary: {
										totalNews: result.totalNews,
										uniqueCount: result.uniqueCount,
										duplicateGroups: result.duplicateGroupCount,
										threshold: result.threshold
									},
									duplicateGroups: duplicateInfo
								},
								null,
								2
							)
						}
					]
				}
			}

			case 'benzersiz_haberler': {
				const { threshold = 0.6, limit = 20 } = args as any

				let news = cacheService.getAllCachedNews()

				if (news.length === 0) {
					news = await newsService.tumHaberleriCek()
				}

				const uniqueNews = duplicateService.haberleriTekillesir(news, threshold).slice(0, limit)

				return {
					content: [
						{
							type: 'text',
							text: `${news.length} haberden ${uniqueNews.length} benzersiz haber döndürülüyor.`
						},
						{
							type: 'text',
							text: JSON.stringify(uniqueNews, null, 2)
						}
					]
				}
			}

			case 'kopya_kontrol': {
				const { newsId, threshold = 0.6 } = args as any

				const targetNews = cacheService.get(`news:id:${newsId}`) as NewsItem
				if (!targetNews) {
					throw new Error(`Haber bulunamadı: ${newsId}`)
				}

				const allNews = cacheService.getAllCachedNews()
				const result = duplicateService.belirliKopyalariBul(targetNews, allNews, threshold)

				if (result.duplicates.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: `"${targetNews.title}" haberi için benzer haber bulunamadı.`
							}
						]
					}
				}

				const duplicateInfo = result.duplicates.map((d) => ({
					id: d.news.id,
					title: d.news.title,
					source: d.news.source,
					similarity: `${Math.round(d.similarity * 100)}%`,
					titleSimilarity: `${Math.round(d.titleSimilarity * 100)}%`,
					contentSimilarity: `${Math.round(d.contentSimilarity * 100)}%`
				}))

				return {
					content: [
						{
							type: 'text',
							text: `"${targetNews.title}" haberi için ${result.duplicates.length} benzer haber bulundu.`
						},
						{
							type: 'text',
							text: JSON.stringify(
								{
									targetNews: {
										id: targetNews.id,
										title: targetNews.title,
										source: targetNews.source
									},
									similarNews: duplicateInfo,
									averageSimilarity: result.averageSimilarity
								},
								null,
								2
							)
						}
					]
				}
			}

			default:
				throw new Error(`Bilinmeyen tool: ${name}`)
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata'
		return {
			content: [
				{
					type: 'text',
					text: `Hata: ${errorMessage}`
				}
			],
			isError: true
		}
	}
})

// Server'ı başlat
async function main() {
	// Servisleri başlat
	const feedUrls = process.env.RSS_FEEDS?.split(',').map((url) => url.trim())
	newsService = new NewsService(feedUrls)
	summaryService = new SummaryService()
	sentimentService = new SentimentService()
	duplicateService = new DuplicateService()

	const ttl = parseInt(process.env.CACHE_TTL || '3600')
	const checkPeriod = parseInt(process.env.CACHE_CHECK_PERIOD || '600')
	cacheService = new CacheService(ttl, checkPeriod)

	// Transport oluştur
	const transport = new StdioServerTransport()

	// Server'ı bağla ve çalıştır
	await server.connect(transport)

	console.error('MCP News Server başlatıldı')
	console.error(`- Versiyon: ${process.env.MCP_SERVER_VERSION || '0.1.0'}`)
	console.error(`- Cache TTL: ${ttl} saniye`)
	console.error(`- Kaynak sayısı: ${feedUrls?.length || 4}`)
}

// Hata yakalama
process.on('unhandledRejection', (error) => {
	console.error('İşlenmeyen hata:', error)
	process.exit(1)
})

// Ana fonksiyonu çalıştır
main().catch((error) => {
	console.error('Server başlatma hatası:', error)
	process.exit(1)
})
