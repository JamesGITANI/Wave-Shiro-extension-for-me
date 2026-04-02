import AbstractSource from '../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUxNTc1NDcsImV4cCI6MTgwNjY5MzU0N30.jnG3SHmUbB59g6TgRPzCtf_7i3I1ZQLCaiMrxAnQie8'

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

  normalize(text = '') {
    return String(text).toLowerCase().replace(/[^\w\s-]/g, ' ').trim()
  }

  parseAudio(item) {
    const blob = this.normalize([
      item.title,
      item.auto_title,
      item.description,
      item.audio_lang,
      item.sub_lang,
      item.fsub_lang
    ].filter(Boolean).join(' '))

    const eng =
      blob.includes(' eng ') ||
      blob.startsWith('eng ') ||
      blob.endsWith(' eng') ||
      blob.includes('english') ||
      blob.includes('dual audio') ||
      blob.includes('audio_lang en') ||
      blob.includes('fsub_lang en')

    const jpn =
      blob.includes(' ja ') ||
      blob.startsWith('ja ') ||
      blob.endsWith(' ja') ||
      blob.includes('japanese') ||
      blob.includes('audio_lang ja') ||
      blob.includes('dual audio')

    return {
      eng,
      jpn,
      dual: (eng && jpn) || blob.includes('dual audio')
    }
  }

  episodeMatches(item, episode) {
    if (!episode) return true

    const text = this.normalize([
      item.title,
      item.auto_title,
      ...(item.files || []).map(f => f.name || f.path || '')
    ].join(' '))

    const ep = String(episode).padStart(2, '0')

    return (
      text.includes('e' + ep) ||
      text.includes(' ep ' + episode + ' ') ||
      text.includes(' episode ' + episode + ' ') ||
      text.includes(' ' + episode + ' ')
    )
  }

  mapTorrent(item) {
    const audio = this.parseAudio(item)

    return {
      title: item.title || item.auto_title || 'Unknown',
      link: item.magnet || item.private_magnet || '',
      hash: item.infohash || item.magnet?.match(/btih:([A-Fa-f0-9]+)/)?.[1] || '',
      seeders: Number(item.seeders || 0),
      leechers: Number(item.leechers || 0),
      downloads: Number(item.completed || 0),
      size: Number(item.filesize || 0),
      date: new Date(Number(item.uploaded_at || Date.now())),
      accuracy: audio.dual ? 'high' : audio.eng ? 'medium' : 'low',
      type: item.batch ? 'batch' : 'alt'
    }
  }

  async searchByTitle(title, episode) {
    const query = this.normalize(title)
    if (!query) return []

    const search = await this.request('/torrents/search?query=' + encodeURIComponent(query))
    if (!Array.isArray(search)) return []

    const detailed = []

    for (const row of search.slice(0, 25)) {
      if (!row?.id) continue

      try {
        const torrent = await this.request('/torrents/' + row.id)
        if (!torrent?.magnet && !torrent?.private_magnet) continue
        if (!this.episodeMatches(torrent, episode)) continue
        detailed.push(this.mapTorrent(torrent))
      } catch {
        // ignore bad torrent rows
      }
    }

    return detailed.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 }
      return (rank[b.accuracy] - rank[a.accuracy]) || (b.seeders - a.seeders)
    })
  }

  async single({ titles, episode }) {
    if (!titles?.length) return []
    return this.searchByTitle(titles[0], episode)
  }

  async batch({ titles }) {
    if (!titles?.length) return []
    return this.searchByTitle(titles[0])
  }

  async movie({ titles }) {
    if (!titles?.length) return []
    return this.searchByTitle(titles[0])
  }

  async validate() {
    return true
  }
}()