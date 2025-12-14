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
import { NewsItem } from './types/news.js'
import dotenv from 'dotenv'

// .env dosyasını yükle
dotenv.config()

// Global servis instances
let newsService: NewsService
let summaryService: SummaryService
let cacheService: CacheService

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
			name: 'fetch_news',
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
			name: 'summarize_news',
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
			name: 'get_full_content',
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
			name: 'analyze_trends',
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
			name: 'daily_news_summary',
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
			name: 'topic_analysis',
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
			name: 'news_comparison',
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
			name: 'weekly_briefing',
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
		case 'daily_news_summary': {
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

		case 'topic_analysis': {
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

		case 'news_comparison': {
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

		case 'weekly_briefing': {
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
${focusAreas ? focusAreas.split(',').map((area: string) => `- ${area.trim()}: [özet]`).join('\n') : '- Ekonomi:\n- Siyaset:\n- Teknoloji:\n- Dünya:'}

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
			case 'fetch_news': {
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
					const feed = await newsService.fetchNewsFromRSS(source)
					news = feed.items
				} else {
					news = await newsService.fetchAllNews()
				}

				// Filtrele
				if (category) {
					news = newsService.filterByCategory(news, category)
				}
				if (keyword) {
					news = newsService.searchNews(news, keyword)
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

			case 'summarize_news': {
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

				const result = summaryService.summarize(contentToSummarize, sentenceCount, { extractKeywords })

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

			case 'get_full_content': {
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

				const content = await newsService.fetchFullContent(targetUrl)

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

			case 'analyze_trends': {
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
				const analysis = summaryService.summarize(allText, 5, { extractKeywords: true })

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
