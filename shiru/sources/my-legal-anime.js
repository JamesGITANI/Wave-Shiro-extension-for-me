import AbstractSource from '../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMTIxNDgxMzQ2OCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUxNTg1MTEsImV4cCI6MTgwNjY5NDUxMX0.HQCTAk2NvhOUAQ9ZA8yygQjn6l972ezQDLiy3AfLhSg'

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
      blob.includes('english') ||
      blob.includes(' eng ') ||
      blob.startsWith('eng ') ||
      blob.endsWith(' eng') ||
      blob.includes('dual audio') ||
      String(item.audio_lang || '').includes('en') ||
      String(item.fsub_lang || '').includes('en')

    const jpn =
      blob.includes('japanese') ||
      blob.includes(' ja ') ||
      blob.startsWith('ja ') ||
      blob.endsWith(' ja') ||
      blob.includes('dual audio') ||
      String(item.audio_lang || '').includes('ja')

    return {
      eng,
      jpn,
      dual: (eng && jpn) || blob.includes('dual audio')
    }
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

  matchEpisodeFromMedia(media, wantedEpisode) {
    if (!wantedEpisode || !Array.isArray(media?.episodes)) return []

    return media.episodes
      .filter(ep =>
        ep?.episode === wantedEpisode ||
        ep?.absolute === wantedEpisode
      )
      .map(ep => ep.id)
      .filter(Boolean)
  }

  async searchMedia(title) {
    const query = this.normalize(title)
    if (!query) return []

    const result = await this.request('/media/search?query=' + encodeURIComponent(query))
    return Array.isArray(result) ? result : []
  }

  async getMedia(mediaId) {
    return await this.request('/media/' + encodeURIComponent(mediaId))
  }

  async searchTorrents(params) {
    const qs = new URLSearchParams()

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      qs.set(key, String(value))
    }

    const result = await this.request('/torrents/search?' + qs.toString())
    return Array.isArray(result) ? result : []
  }

  async getTorrent(id) {
    return await this.request('/torrents/' + encodeURIComponent(id))
  }

  async searchByTitle(title, episode, wantBatch = false) {
    const mediaResults = await this.searchMedia(title)
    if (!mediaResults.length) return []

    const all = []

    for (const mediaRow of mediaResults.slice(0, 5)) {
      if (!mediaRow?.id) continue

      try {
        const media = await this.getMedia(mediaRow.id)
        const episodeIds = this.matchEpisodeFromMedia(media, episode)

        const torrents = await this.searchTorrents({
          media_id: mediaRow.id,
          episode_ids: episodeIds.length ? episodeIds.join(',') : undefined,
          episode_match_any: episodeIds.length ? 'true' : undefined,
          batch: wantBatch ? 'true' : undefined,
          sort_by: 'seeders',
          limit: 25
        })

        for (const row of torrents) {
          if (!row?.id) continue

          try {
            const torrent = await this.getTorrent(row.id)
            if (!torrent?.magnet && !torrent?.private_magnet) continue
            all.push(this.mapTorrent(torrent))
          } catch {
            // ignore bad torrent detail rows
          }
        }
      } catch {
        // ignore bad media rows
      }
    }

    const deduped = []
    const seen = new Set()

    for (const item of all) {
      const key = item.hash || item.link || item.title
      if (!key || seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
    }

    return deduped.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 }
      return (rank[b.accuracy] - rank[a.accuracy]) || (b.seeders - a.seeders)
    })
  }

  async single(options) {
    const titles = this.getTitles(options)
    if (!titles.length) return []
    return this.searchByTitle(titles[0], options?.episode, false)
  }

  async batch(options) {
    const titles = this.getTitles(options)
    if (!titles.length) return []
    return this.searchByTitle(titles[0], undefined, true)
  }

  async movie(options) {
    const titles = this.getTitles(options)
    if (!titles.length) return []
    return this.searchByTitle(titles[0], undefined, false)
  }

  async validate() {
    return true
  }
}()
