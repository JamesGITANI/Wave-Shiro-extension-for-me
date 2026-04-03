import AbstractSource from '../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUyMjAwOTksImV4cCI6MTgwNjc1NjA5OX0.iXZCInN1yhVH3_1y5U8E-InQQzkkztJWfmSw9zP9y_Y'

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
      throw new Error('Unauthorized')
    }

    if (res.status === 429) {
      const retryAfter = data?.retry_after ?? 'unknown'
      throw new Error('Rate limited. Retry after ' + retryAfter + ' seconds')
    }

    if (res.status === 400) {
      throw new Error(data?.message || 'Bad request')
    }

    if (!res.ok) {
      throw new Error('HTTP ' + res.status)
    }

    if (data?.error === true) {
      throw new Error(data.message || 'API error')
    }

    return data?.data ?? []
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
    if (!titles?.length) return []

    const query = encodeURIComponent(titles[0])
    const rows = await this.request('/torrents/search?query=' + query)

    return Array.isArray(rows)
      ? rows.map(row => this.mapTorrent(row)).filter(row => row.link)
      : []
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
