import NodeCache from 'node-cache'
import fs from 'fs'
import path from 'path'
import { NewsItem } from '../types/news'

interface CacheStats {
    keys: number
    hits: number
    misses: number
    hitRate: number
    memoryUsage: number
}

export class CacheService {
    private cache: NodeCache
    private stats: { hits: number; misses: number }
    private cacheDir: string

    constructor(ttlSeconds: number = 3600, checkPeriod: number = 600) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: checkPeriod,
            useClones: false, // Performans için klonlama yapma
        })

        this.stats = { hits: 0, misses: 0 }
        this.cacheDir = path.join(process.cwd(), 'cache')

        // Cache klasörünü oluştur
        this.ensureCacheDir()

        // Başlangıçta persistent cache'i yükle
        this.loadPersistentCache()

        // Belirli aralıklarla cache'i diske kaydet
        setInterval(() => this.savePersistentCache(), 60000) // Her dakika

        // Uygulama kapanırken cache'i kaydet
        process.on('beforeExit', () => this.savePersistentCache())
        process.on('SIGINT', () => {
            this.savePersistentCache()
            process.exit(0)
        })
    }

    /**
     * Cache klasörünün var olduğundan emin ol
     */
    private ensureCacheDir(): void {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true })
        }
    }

    /**
     * Cache'ten veri al
     */
    get<T = any>(key: string): T | undefined {
        const value = this.cache.get<T>(key)
        if (value !== undefined) {
            this.stats.hits++
        } else {
            this.stats.misses++
        }
        return value
    }

    /**
     * Cache'e veri ekle
     */
    set<T = any>(key: string, value: T, ttl?: number): boolean {
        return this.cache.set(key, value, ttl || 0)
    }

    /**
     * Cache'ten veri sil
     */
    delete(key: string): number {
        return this.cache.del(key)
    }

    /**
     * Tüm cache'i temizle
     */
    flush(): void {
        this.cache.flushAll()
        this.stats = { hits: 0, misses: 0 }
    }

    /**
     * Cache anahtarlarını al
     */
    getKeys(): string[] {
        return this.cache.keys()
    }

    /**
     * Cache istatistiklerini al
     */
    getStats(): CacheStats {
        const keys = this.cache.keys()
        const hitRate = this.stats.hits + this.stats.misses > 0 ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0

        // Yaklaşık bellek kullanımını hesapla
        let memoryUsage = 0
        keys.forEach((key) => {
            const value = this.cache.get(key)
            if (value) {
                memoryUsage += JSON.stringify(value).length
            }
        })

        return {
            keys: keys.length,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: parseFloat(hitRate.toFixed(2)),
            memoryUsage: Math.round(memoryUsage / 1024), // KB cinsinden
        }
    }

    /**
     * TTL'i güncelle
     */
    updateTTL(key: string, ttl: number): boolean {
        return this.cache.ttl(key, ttl)
    }

    /**
     * Bir anahtarın TTL'ini al
     */
    getTTL(key: string): number | undefined {
        return this.cache.getTtl(key)
    }

    /**
     * Cache'i JSON dosyasına kaydet
     */
    private savePersistentCache(): void {
        try {
            const cacheData: Record<string, any> = {}
            const keys = this.cache.keys()

            keys.forEach((key) => {
                const value = this.cache.get(key)
                const ttl = this.cache.getTtl(key)
                if (value !== undefined && ttl) {
                    cacheData[key] = {
                        value,
                        ttl,
                        savedAt: Date.now(),
                    }
                }
            })

            const filePath = path.join(this.cacheDir, 'persistent-cache.json')
            fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2))
            console.error(`Cache diske kaydedildi (${keys.length} anahtar)`)
        } catch (error) {
            console.error('Cache kaydetme hatası:', error)
        }
    }

    /**
     * JSON dosyasından cache'i yükle
     */
    private loadPersistentCache(): void {
        try {
            const filePath = path.join(this.cacheDir, 'persistent-cache.json')

            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8')
                const cacheData = JSON.parse(data)

                let loadedCount = 0
                const now = Date.now()

                Object.entries(cacheData).forEach(([key, item]: [string, any]) => {
                    const elapsed = now - item.savedAt
                    const remainingTTL = item.ttl - elapsed

                    // TTL'i geçmemiş verileri yükle
                    if (remainingTTL > 0) {
                        this.cache.set(key, item.value, Math.round(remainingTTL / 1000))
                        loadedCount++
                    }
                })

                console.error(`Persistent cache yüklendi (${loadedCount} anahtar)`)
            }
        } catch (error) {
            console.error('Cache yükleme hatası:', error)
        }
    }

    /**
     * Haberleri cache'ten al
     */
    getAllCachedNews(): NewsItem[] {
        const allNews: NewsItem[] = []
        const keys = this.cache.keys()

        keys.forEach((key) => {
            if (key.startsWith('news:id:')) {
                const news = this.cache.get<NewsItem>(key)
                if (news) {
                    allNews.push(news)
                }
            }
        })

        // Tarihe göre sırala
        allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

        return allNews
    }

    /**
     * Eski haberleri temizle
     */
    cleanOldNews(daysToKeep: number = 7): number {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

        const keys = this.cache.keys()
        let deletedCount = 0

        keys.forEach((key) => {
            if (key.startsWith('news:')) {
                const item = this.cache.get<any>(key)
                if (item && item.pubDate && new Date(item.pubDate) < cutoffDate) {
                    this.cache.del(key)
                    deletedCount++
                }
            }
        })

        return deletedCount
    }

    /**
     * Cache boyutunu kontrol et ve gerekirse temizle
     */
    checkAndCleanCache(maxSizeKB: number = 10240): void {
        const stats = this.getStats()

        if (stats.memoryUsage > maxSizeKB) {
            // En eski haberleri temizle
            const news = this.getAllCachedNews()
            const toDelete = Math.floor(news.length * 0.3) // %30'unu sil

            news.slice(-toDelete).forEach((item) => {
                this.cache.del(`news:id:${item.id}`)
            })

            console.error(`Cache temizlendi: ${toDelete} haber silindi`)
        }
    }
}
