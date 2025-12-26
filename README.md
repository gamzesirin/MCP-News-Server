# MCP News Server

Türkçe haber kaynaklarından haber çeken, özetleyen ve analiz eden MCP (Model Context Protocol) tabanlı sunucu.

## Özellikler

- **Haber Çekme**: BBC Türkçe, Ensonhaber, Milliyet ve BloombergHT gibi Türkçe haber kaynaklarından RSS ile haber toplama
- **Haber Özetleme**: NLP tabanlı otomatik metin özetleme ve anahtar kelime çıkarma
- **Duygu Analizi**: Haberlerin duygusal tonunu analiz etme (pozitif/negatif/nötr)
- **Tekrar Tespiti**: Benzer veya tekrarlayan haberleri tespit etme
- **Trend Analizi**: Günün/haftanın en çok konuşulan konularını belirleme
- **Web Arayüzü**: REST API ve kullanıcı dostu web arayüzü

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modunda çalıştır
npm run dev

# Web sunucusunu çalıştır
npm run dev:web

# Derleme
npm run build

# Derlenmiş sürümü çalıştır
npm start
```

## Ortam Değişkenleri

`.env` dosyası oluşturarak aşağıdaki değişkenleri tanımlayabilirsiniz:

```env
# MCP Sunucu Ayarları
MCP_SERVER_NAME=mcp-news-server
MCP_SERVER_VERSION=0.1.0

# RSS Kaynakları (virgülle ayrılmış)
RSS_FEEDS=https://feeds.bbci.co.uk/turkce/rss.xml,https://www.ensonhaber.com/rss/ensonhaber.xml

# Cache Ayarları
CACHE_TTL=3600
CACHE_CHECK_PERIOD=600

# Web Sunucu Portu
PORT=3000
```

## Claude Desktop Kurulumu

### 1. Projeyi derle

```bash
cd MCP-News-Server
npm install
npm run build
```

### 2. Claude Desktop yapılandırma dosyasını aç

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### 3. MCP Server'ı ekle

`claude_desktop_config.json` dosyasına şunu ekle:

```json
{
    "mcpServers": {
        "news-server": {
            "command": "node",
            "args": ["C:\\Users\\Gamze Sirin\\Desktop\\MCP-News-Server\\dist\\index.js"],
            "env": {
                "MCP_SERVER_NAME": "news-summarizer",
                "RSS_FEEDS": "https://feeds.bbci.co.uk/turkce/rss.xml,https://www.ensonhaber.com/rss/ensonhaber.xml,https://www.milliyet.com.tr/rss/rssnew/dunyarss.xml,https://www.bloomberght.com/rss"
            }
        }
    }
}
```

### 4. Claude Desktop'ı yeniden başlat

Uygulamayı tamamen kapat ve tekrar aç.

### 5. Kullanım

Claude Desktop'ta şu komutları kullanabilirsin:

- "Güncel haberleri getir"
- "Bu metni özetle: ..."
- "Haberlerdeki trendleri analiz et"
- "Spor haberlerini ara"

## MCP Araçları (Tools)

### fetch_news
RSS kaynaklarından güncel haberleri çeker.
- `source`: Haber kaynağı URL'si (opsiyonel)
- `category`: Kategori filtresi (opsiyonel)
- `keyword`: Arama kelimesi (opsiyonel)
- `limit`: Maksimum haber sayısı (varsayılan: 10)

### summarize_news
Haber metnini özetler.
- `text`: Özetlenecek metin
- `newsId`: Daha önce çekilen haberin ID'si
- `sentenceCount`: Özetteki cümle sayısı (varsayılan: 3)
- `extractKeywords`: Anahtar kelimeleri çıkar (varsayılan: true)

### get_full_content
Haberin tam içeriğini web sayfasından çeker.
- `url`: Haber URL'si
- `newsId`: Haberin ID'si

### analyze_trends
Haberlerdeki trendleri ve en çok kullanılan kelimeleri analiz eder.
- `hours`: Son kaç saatteki haberler (varsayılan: 24)
- `topWords`: En çok kullanılan kelime sayısı (varsayılan: 10)

### analyze_sentiment
Haber metninin duygusal tonunu analiz eder.
- `text`: Analiz edilecek metin
- `newsId`: Haberin ID'si

### analyze_sentiment_batch
Birden fazla haberin duygusal tonunu toplu analiz eder.
- `category`: Kategori filtresi (opsiyonel)
- `limit`: Maksimum haber sayısı (varsayılan: 10)

### find_duplicates
Haberlerdeki tekrarlayan/benzer içerikleri tespit eder.
- `threshold`: Benzerlik eşiği (0-1 arası, varsayılan: 0.6)
- `category`: Kategori filtresi (opsiyonel)

### get_unique_news
Tekrarlayan haberler temizlenmiş benzersiz haber listesi döndürür.
- `threshold`: Benzerlik eşiği (varsayılan: 0.6)
- `limit`: Maksimum haber sayısı (varsayılan: 20)

### check_duplicate
Belirli bir haberin başka haberlerle benzerliğini kontrol eder.
- `newsId`: Kontrol edilecek haberin ID'si
- `threshold`: Benzerlik eşiği (varsayılan: 0.6)

## MCP Promptları

### daily_news_summary
Günlük haber özeti oluşturur.

### topic_analysis
Belirli bir konu hakkında haberleri analiz eder.

### news_comparison
Farklı haber kaynaklarının aynı konuyu nasıl ele aldığını karşılaştırır.

### weekly_briefing
Haftalık haber brifing raporu oluşturur.

## REST API Endpoint'leri

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/news` | GET | Haberleri listeler |
| `/api/summarize` | POST | Metin özetler |
| `/api/trends` | GET | Trend analizi yapar |
| `/api/sentiment` | POST | Duygu analizi yapar |
| `/api/sentiment/news` | GET | Haberlerin toplu duygu analizi |
| `/api/duplicates` | GET | Tekrarlayan haberleri bulur |
| `/api/news/unique` | GET | Benzersiz haberleri listeler |
| `/api/similarity` | POST | İki metin arasındaki benzerliği hesaplar |

## Web Arayüzü

MCP yerine web arayüzünü kullanmak isterseniz:

```bash
npm run start:web
```

Tarayıcıda `http://localhost:3000` adresini açın.

## Proje Yapısı

```
mcp-news-server/
├── src/
│   ├── index.ts                # MCP sunucu giriş noktası
│   ├── web-server.ts           # Express web sunucusu
│   ├── frontend.html           # Web arayüzü
│   ├── styles.css              # CSS stilleri
│   ├── types/
│   │   └── news.ts             # TypeScript tip tanımları
│   └── services/
│       ├── newsService.ts      # Haber çekme servisi
│       ├── summaryService.ts   # Özetleme servisi
│       ├── sentimentService.ts # Duygu analizi servisi
│       ├── duplicateService.ts # Tekrar tespiti servisi
│       └── cacheService.ts     # Önbellek servisi
├── package.json
├── tsconfig.json
└── README.md
```

## Teknolojiler

- **TypeScript**: Tip güvenli JavaScript
- **Model Context Protocol (MCP)**: AI model entegrasyonu için standart protokol
- **Express.js**: Web sunucu framework
- **RSS Parser**: RSS feed okuma
- **Cheerio**: HTML parsing ve web scraping
- **Natural**: NLP işlemleri için
- **Node-Cache**: Bellek içi önbellek

<img width="1920" height="2887" alt="image" src="https://github.com/user-attachments/assets/0d5000ea-94f1-4597-9bea-e2677eb0ba77" />

