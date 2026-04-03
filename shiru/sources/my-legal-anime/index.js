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

  normalize(text = '') {
    return String(text).toLowerCase().replace(/[^\w\s-]/g, ' ').trim()
  }

  getTitles(input) {
    return [
      ...(input?.titles || []),
      input?.media?.title?.english,
      input?.media?.title?.romaji,
      input?.media?.title?.native
    ].filter(Boolean)
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

  async searchMedia(title) {
    return await this.request('/media/search?query=' + encodeURIComponent(title))
  }

  async searchTorrentsByMedia(mediaId) {
    const qs = new URLSearchParams({
      media_id: String(mediaId),
      sort_by: 'seeders',
      limit: '25'
    })
    return await this.request('/torrents/search?' + qs.toString())
  }

  async getTorrent(id) {
    return await this.request('/torrents/' + encodeURIComponent(id))
  }

  async single(options) {
    const titles = this.getTitles(options)
    if (!titles.length) return []

    for (const title of titles) {
      const mediaSearch = await this.searchMedia(title)

      if (mediaSearch.error) {
        return [this.makeDebug('MEDIA SEARCH FAILED', mediaSearch.message || 'unknown')]
      }

      const mediaRows = Array.isArray(mediaSearch.data) ? mediaSearch.data : []
      if (!mediaRows.length) continue

      for (const media of mediaRows.slice(0, 5)) {
        if (!media?.id) continue

        const torrentSearch = await this.searchTorrentsByMedia(media.id)
        if (torrentSearch.error) {
          return [this.makeDebug('TORRENT SEARCH FAILED', torrentSearch.message || 'unknown')]
        }

        const rows = Array.isArray(torrentSearch.data) ? torrentSearch.data : []
        if (!rows.length) continue

        const results = []

        for (const row of rows.slice(0, 10)) {
          if (!row?.id) continue

          const detail = await this.getTorrent(row.id)
          if (detail.error) continue

          const mapped = this.mapTorrent(detail.data)
          if (mapped.link) results.push(mapped)
        }

        if (results.length) {
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
      }
    }

    return [this.makeDebug('MEDIA/TORRENT EMPTY', titles[0])]
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