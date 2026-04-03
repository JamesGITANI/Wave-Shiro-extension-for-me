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

    if (res.status === 401) {
      return { error: true, message: '401 Unauthorized' }
    }

    if (res.status === 429) {
      return { error: true, message: '429 Rate Limited', retry_after: data?.retry_after }
    }

    if (res.status === 400) {
      return { error: true, message: data?.message || '400 Bad Request' }
    }

    if (!res.ok) {
      return { error: true, message: 'HTTP ' + res.status }
    }

    if (data?.error === true) {
      return { error: true, message: data.message || 'API error' }
    }

    return { error: false, data: data?.data ?? [] }
  }

  makeDebug(title, extra = '') {
    return {
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
    }
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

  async single({ titles }) {
    const title = titles?.[0]
    if (!title) return []

    const search = await this.request('/torrents/search?query=' + encodeURIComponent(title))

    if (search.error) {
      return [this.makeDebug('SEARCH FAILED', search.message || 'unknown')]
    }

    const rows = Array.isArray(search.data) ? search.data : []
    if (!rows.length) {
      return [this.makeDebug('SEARCH EMPTY', title)]
    }

    const results = []

    for (const row of rows.slice(0, 10)) {
      if (!row?.id) continue

      const detail = await this.request('/torrents/' + encodeURIComponent(row.id))
      if (detail.error) continue

      const torrent = detail.data
      const mapped = this.mapTorrent(torrent)

      if (mapped.link) {
        results.push(mapped)
      }
    }

    if (!results.length) {
      return [this.makeDebug('NO MAGNET RESULTS', title)]
    }

    const deduped = []
    const seen = new Set()

    for (const item of results) {
      const key = item.hash || item.link || item.title
      if (!key || seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
    }

    return deduped.sort((a, b) => b.seeders - a.seeders)
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