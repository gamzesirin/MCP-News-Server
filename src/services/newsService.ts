import RSSParser from 'rss-parser'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { NewsItem, NewsFeed } from '../types/news'
import crypto from 'crypto'

export class NewsService {
	private parser: RSSParser
	private rssFeedUrls: string[]

	constructor(feedUrls?: string[]) {
		this.parser = new RSSParser({
			customFields: {
				item: ['media:content', 'media:thumbnail', 'enclosure']
			}
		})

		// Varsayılan Türk haber kaynakları
		this.rssFeedUrls = feedUrls || [
			'https://feeds.bbci.co.uk/turkce/rss.xml',
			'https://www.ensonhaber.com/rss/ensonhaber.xml',
			'https://www.milliyet.com.tr/rss/rssnew/dunyarss.xml',
			'https://www.bloomberght.com/rss'
		]
	}

	/**
	 * RSS feed'den haberleri çeker
	 */
	async rssdenHaberleriCek(feedUrl: string): Promise<NewsFeed> {
		try {
			const feed = await this.parser.parseURL(feedUrl)

			const items: NewsItem[] = feed.items.map((item) => {
				// Benzersiz ID oluştur
				const id = crypto
					.createHash('md5')
					.update(item.link || item.title || '')
					.digest('hex')

				// Resim URL'sini bul
				let imageUrl: string | undefined
				if (item.enclosure && item.enclosure.url) {
					imageUrl = item.enclosure.url
				} else if (item['media:thumbnail']) {
					imageUrl = item['media:thumbnail']
				} else if (item['media:content']) {
					imageUrl = item['media:content']
				}

				return {
					id,
					title: item.title || 'Başlıksız Haber',
					description: item.contentSnippet || item.content,
					content: item.content,
					link: item.link || '',
					pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
					source: new URL(feedUrl).hostname,
					category: item.categories?.[0],
					imageUrl
				}
			})

			return {
				title: feed.title || 'Haber Kaynağı',
				description: feed.description,
				link: feed.link || feedUrl,
				items: items.slice(0, 20), // İlk 20 haberi al
				lastUpdate: new Date()
			}
		} catch (error) {
			console.error(`RSS feed okuma hatası (${feedUrl}):`, error)
			throw new Error(`RSS feed okunamadı: ${feedUrl}`)
		}
	}

	/**
	 * Tüm kaynaklardan haberleri toplar
	 */
	async tumHaberleriCek(): Promise<NewsItem[]> {
		const allNews: NewsItem[] = []
		const errors: string[] = []

		for (const feedUrl of this.rssFeedUrls) {
			try {
				const feed = await this.rssdenHaberleriCek(feedUrl)
				allNews.push(...feed.items)
			} catch (error) {
				errors.push(`${feedUrl}: ${error}`)
			}
		}

		if (allNews.length === 0 && errors.length > 0) {
			throw new Error(`Hiç haber çekilemedi. Hatalar: ${errors.join(', ')}`)
		}

		// Tarihe göre sırala (en yeni önce)
		allNews.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())

		return allNews
	}

	/**
	 * Haber içeriğini web sayfasından çeker
	 */
	async tamIcerikCek(newsUrl: string): Promise<string> {
		try {
			const response = await axios.get(newsUrl, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				},
				timeout: 10000
			})

			const $ = cheerio.load(response.data)

			// Gereksiz elementleri kaldır
			$('script, style, nav, header, footer, aside, .ad, .advertisement').remove()

			// Haber içeriğini bulmaya çalış (yaygın selector'lar)
			const selectors = [
				'article',
				'[class*="content"]',
				'[class*="article"]',
				'[class*="story"]',
				'[class*="text"]',
				'main',
				'.news-content',
				'.detail-content',
				'.post-content'
			]

			let content = ''
			for (const selector of selectors) {
				const element = $(selector).first()
				if (element.length > 0) {
					content = element.text().trim()
					if (content.length > 200) {
						break
					}
				}
			}

			// Eğer içerik bulunamazsa, tüm paragrafları al
			if (content.length < 200) {
				content = $('p')
					.map((_, el) => $(el).text().trim())
					.get()
					.filter((text) => text.length > 50)
					.join(' ')
			}

			// Temizleme
			content = content
				.replace(/\s+/g, ' ')
				.replace(/\n{3,}/g, '\n\n')
				.trim()

			return content || 'İçerik alınamadı'
		} catch (error) {
			console.error(`İçerik çekme hatası (${newsUrl}):`, error)
			throw new Error(`Haber içeriği çekilemedi: ${newsUrl}`)
		}
	}

	/**
	 * Kategoriye göre haberleri filtreler
	 */
	kategoriyeGoreFiltrele(news: NewsItem[], category: string): NewsItem[] {
		return news.filter((item) => item.category?.toLowerCase().includes(category.toLowerCase()))
	}

	/**
	 * Anahtar kelimeye göre haberleri arar
	 */
	haberleriAra(news: NewsItem[], keyword: string): NewsItem[] {
		const lowerKeyword = keyword.toLowerCase()
		return news.filter(
			(item) =>
				item.title.toLowerCase().includes(lowerKeyword) ||
				item.description?.toLowerCase().includes(lowerKeyword) ||
				item.content?.toLowerCase().includes(lowerKeyword)
		)
	}
}
