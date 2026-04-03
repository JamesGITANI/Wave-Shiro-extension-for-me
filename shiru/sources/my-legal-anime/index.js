import AbstractSource from '../../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUyMjQ0NjcsImV4cCI6MTgwNjc2MDQ2N30.A2s4AiUh507mDDWITvzoZdBPfHzanlzHqCEXL2CO1E8'

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

  async runQuery(query) {
    const search = await this.request(
      '/torrents/search?query=' +
      encodeURIComponent(query) +
      '&limit=5&sort_by=seeders'
    )

    if (search.error) {
      if (search.retry_after) return this.makeDebug('RATE LIMITED', String(search.retry_after) + 's')
      return this.makeDebug('SEARCH FAILED', search.message || 'unknown')
    }

    const rows = Array.isArray(search.data) ? search.data : []
    if (!rows.length) return []

    const results = rows
      .slice(0, 5)
      .map(row => this.mapTorrent(row))
      .filter(item => item.link)

    return results
  }

  async single({ titles, media }) {
    const queries = [
      ...(titles || []),
      media?.title?.english,
      media?.title?.romaji,
      media?.title?.native
    ].filter(Boolean)

    for (const q of queries) {
      const results = await this.runQuery(q)
      if (results.length) return results
    }

    return this.makeDebug('NO MATCHES', queries[0] || 'unknown')
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