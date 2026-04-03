import AbstractSource from '../../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUyMjQ0NjcsImV4cCI6MTgwNjc2MDQ2N30.A2s4AiUh507mDDWITvzoZdBPfHzanlzHqCEXL2CO1E8'

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async request(path) {
    const res = await fetch(this.base + path, {
      headers: {
        accept: 'application/json',
        cookie: 'ssid=' + this.apiKey
      },
      credentials: 'include'
    })

    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }

    if (res.status === 401) return { error: true, message: '401 Unauthorized' }
    if (res.status === 429) return { error: true, message: '429 Rate Limited', retry_after: data?.retry_after }
    if (res.status === 400) return { error: true, message: data?.message || '400 Bad Request' }
    if (!res.ok) return { error: true, message: 'HTTP ' + res.status }
    if (data?.error === true) return { error: true, message: data.message || 'API error' }

    return { error: false, data: data?.data ?? [] }
  }

  makeDebug(title, extra = '') {
    return [{
      title: extra ? `${title} | ${extra}` : title,
      link: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
      hash: '0123456789abcdef0123456789abcdef01234567',
      seeders: 1,
      leechers: 0,
      downloads: 0,
      size: 123456789,
      date: new Date(),
      accuracy: 'high',
      type: 'alt'
    }]
  }

  normalize(text = '') {
    return String(text).replace(/\s+/g, ' ').trim()
  }

  titleVariants(text = '') {
    const raw = this.normalize(text)
    if (!raw) return []

    const lower = raw.toLowerCase()
    const upper = raw.toUpperCase()
    const parts = raw.split(' ').filter(Boolean)

    const variants = [
      raw,
      lower,
      upper,
      parts.join(' '),
      parts.slice(0, 4).join(' '),
      parts.slice(0, 3).join(' '),
      parts.slice(0, 2).join(' '),
      raw + ' 1080p',
      raw + ' WEB-DL'
    ]

    return [...new Set(variants.filter(Boolean))]
  }

  getTitles(input) {
    const raw = [
      ...(input?.titles || []),
      input?.media?.title?.english,
      input?.media?.title?.romaji,
      input?.media?.title?.native
    ].filter(Boolean)

    const out = []
    const seen = new Set()

    for (const t of raw) {
      for (const v of this.titleVariants(t)) {
        if (!seen.has(v)) {
          seen.add(v)
          out.push(v)
        }
      }
    }

    return out
  }

  mapTorrent(item) {
    return {
      title: item.title || item.auto_title || 'Unknown',
      link: item.magnet || item.private_magnet || '',
      hash: item.infohash || item.magnet?.match(/btih:([A-Fa-f0-9]+)/)?.[1] || '',
      seeders: Number(item.seeders || 0),
      leechers: Number(item.leechers || 0),
      downloads: Number(item.completed || 0),
      size: Number(item.filesize || 0),
      date: new Date(Number(item.uploaded_at || Date.now())),
      accuracy: 'medium',
      type: item.batch ? 'batch' : 'alt'
    }
  }

  async searchOnce(query) {
    const search = await this.request('/torrents/search?query=' + encodeURIComponent(query) + '&limit=5&sort_by=seeders')

    if (search.error) {
      if (search.retry_after) return { type: 'rate', value: search.retry_after }
      return { type: 'error', value: search.message || 'unknown' }
    }

    const rows = Array.isArray(search.data) ? search.data : []
    if (!rows.length) return { type: 'empty' }

    const results = []

    for (const row of rows.slice(0, 3)) {
      if (!row?.id) continue

      await this.sleep(1200)

      const detail = await this.request('/torrents/' + encodeURIComponent(row.id))
      if (detail.error) continue

      const mapped = this.mapTorrent(detail.data)
      if (mapped.link) results.push(mapped)
    }

    if (!results.length) return { type: 'empty' }
    return { type: 'ok', value: results.sort((a, b) => b.seeders - a.seeders) }
  }

  async single(options) {
    const titles = this.getTitles(options)
    if (!titles.length) return []

    for (const title of titles) {
      const result = await this.searchOnce(title)

      if (result.type === 'ok') return result.value
      if (result.type === 'rate') return this.makeDebug('RATE LIMITED', String(result.value) + 's')
    }

    return this.makeDebug('NO MATCHES', titles[0])
  }

  async batch(options) {
    return this.single(options)
  }

  async movie(options) {
    return this.single(options)
  }

  async validate() {
    return true
  }
}()