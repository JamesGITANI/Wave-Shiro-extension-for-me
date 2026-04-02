import AbstractSource from '../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'

  async _request(path) {
    const res = await fetch(this.base + path, {
      headers: {
        accept: 'application/json',
        cookie: 'ssid=eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUxNTUyMjQsImV4cCI6MTgwNjY5MTIyNH0.12ixC2B_1zZ_IW5gORTvecICqOcZbDQ8jPpSI39ij8k'
      },
      credentials: 'include'
    })

    let data = null
    try {
      data = await res.json()
    } catch {
      return []
    }

    if (res.status === 401) throw new Error('Unauthorized')
    if (res.status === 429) throw new Error('Rate limited')
    if (res.status === 400) throw new Error(data?.message || 'Bad request')
    if (!res.ok) return []
    if (data?.error === true) throw new Error(data.message || 'API error')

    return data?.data ?? data ?? []
  }

  _normalize(title = '') {
    return title.toLowerCase().replace(/[^\w\s-]/g, ' ').trim()
  }

  _audioInfo(item) {
    const blob = this._normalize([
      item.release_name,
      item.name,
      ...(item.tags || [])
    ].join(' '))

    const isEng = blob.includes('eng') || blob.includes('english dub') || blob.includes('dub')
    const isJpn = blob.includes('jpn') || blob.includes('japanese') || blob.includes('dual audio')

    return {
      eng: isEng,
      jpn: isJpn,
      dual: blob.includes('dual audio') || (isEng && isJpn)
    }
  }

  _mapResult(item) {
    const audio = this._audioInfo(item)
    const link = item.magnet || item.stream_url || item.download_url || item.url

    return {
      title: item.release_name || item.name || 'Unknown',
      link,
      hash: item.info_hash || item.magnet?.match(/btih:([A-Fa-f0-9]+)/)?.[1] || '',
      seeders: Number(item.seeders || 0),
      leechers: Number(item.leechers || 0),
      downloads: Number(item.downloads || 0),
      size: Number(item.size || item.size_bytes || 0),
      date: new Date(item.created_at || item.updated_at || Date.now()),
      accuracy: audio.dual ? 'high' : audio.eng ? 'medium' : 'low',
      type: 'alt'
    }
  }

  async _search(title, episode) {
    let query = this._normalize(title)
    if (episode) query += ` ${episode.toString().padStart(2, '0')}`

    const mediaResults = await this._request('/media/search?query=' + encodeURIComponent(query))
    const torrentResults = await this._request('/torrents/search?query=' + encodeURIComponent(query))

    const combined = Array.isArray(torrentResults) ? torrentResults : []

    if (Array.isArray(mediaResults)) {
      for (const media of mediaResults.slice(0, 5)) {
        if (!media?.id) continue
        try {
          const mediaDetails = await this._request('/media/' + media.id)
          const embedded = mediaDetails?.torrents || mediaDetails?.releases || mediaDetails?.items || []
          if (Array.isArray(embedded)) combined.push(...embedded)
        } catch {
          // ignore bad media item
        }
      }
    }

    return combined
      .filter(item => item && (item.magnet || item.stream_url || item.download_url || item.url))
      .map(item => this._mapResult(item))
  }

  async single({ titles, episode }) {
    if (!titles?.length) return []
    return this._search(titles[0], episode)
  }

  async batch(options) {
    return this.single(options)
  }

  async movie(options) {
    return this.single(options)
  }

  async validate() {
    try {
      const res = await fetch(this.base + '/users/@me', {
        headers: {
          accept: 'application/json',
          cookie: 'ssid=eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUxNTUyMjQsImV4cCI6MTgwNjY5MTIyNH0.12ixC2B_1zZ_IW5gORTvecICqOcZbDQ8jPpSI39ij8k+'
        },
        credentials: 'include'
      })
      return res.ok
    } catch {
      return false
    }
  }
}()