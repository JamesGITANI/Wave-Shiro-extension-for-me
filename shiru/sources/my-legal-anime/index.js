import AbstractSource from '../../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUyMjE5ODQsImV4cCI6MTgwNjc1Nzk4NH0.dKuaCGvuzsGx_hRXtl_wD80SAi5Vf7_kuKtetldDPa0'

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

    if (res.status === 401) throw new Error('Unauthorized')
    if (res.status === 429) throw new Error('Rate limited')
    if (res.status === 400) throw new Error(data?.message || 'Bad request')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    if (data?.error === true) throw new Error(data.message || 'API error')

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

  async getTorrent(id) {
    return await this.request('/torrents/' + encodeURIComponent(id))
  }

  async searchTitle(title) {
    if (!title) return []

    const rows = await this.request('/torrents/search?query=' + encodeURIComponent(title))
    if (!Array.isArray(rows)) return []

    const results = []

    for (const row of rows.slice(0, 25)) {
      if (!row?.id) continue

      try {
        const torrent = await this.getTorrent(row.id)
        const mapped = this.mapTorrent(torrent)
        if (mapped.link) results.push(mapped)
      } catch {
        // skip bad rows
      }
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

  async single({ titles }) {
    if (!titles?.length) return []
    return this.searchTitle(titles[0])
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
