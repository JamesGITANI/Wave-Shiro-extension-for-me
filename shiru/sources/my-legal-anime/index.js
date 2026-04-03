import AbstractSource from '../../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUyMjE5ODQsImV4cCI6MTgwNjc1Nzk4NH0.dKuaCGvuzsGx_hRXtl_wD80SAi5Vf7_kuKtetldDPa0'

  debugResult(title, extra = '') {
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

  async rawRequest(path) {
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

    return { res, data }
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
    const title = titles?.[0] || 'naruto'

    try {
      const search = await this.rawRequest('/torrents/search?query=' + encodeURIComponent(title))

      if (search.res.status === 401) {
        return this.debugResult('AUTH FAILED', '401 Unauthorized')
      }

      if (search.res.status === 429) {
        return this.debugResult('RATE LIMITED', String(search.data?.retry_after || '429'))
      }

      if (!search.res.ok) {
        return this.debugResult('HTTP ERROR', String(search.res.status))
      }

      if (search.data?.error === true) {
        return this.debugResult('API ERROR', search.data.message || 'error=true')
      }

      const rows = Array.isArray(search.data?.data)
        ? search.data.data
        : Array.isArray(search.data)
          ? search.data
          : []

      if (!rows.length) {
        return this.debugResult('SEARCH EMPTY', title)
      }

      const row = rows[0]
      if (!row?.id) {
        return this.debugResult('NO TORRENT ID')
      }

      const detail = await this.rawRequest('/torrents/' + encodeURIComponent(row.id))

      if (detail.res.status === 401) {
        return this.debugResult('DETAIL AUTH FAILED', '401')
      }

      if (detail.res.status === 429) {
        return this.debugResult('DETAIL RATE LIMITED', String(detail.data?.retry_after || '429'))
      }

      if (!detail.res.ok) {
        return this.debugResult('DETAIL HTTP ERROR', String(detail.res.status))
      }

      if (detail.data?.error === true) {
        return this.debugResult('DETAIL API ERROR', detail.data.message || 'error=true')
      }

      const torrent = detail.data?.data ?? detail.data
      const mapped = this.mapTorrent(torrent)

      if (!mapped.link) {
        return this.debugResult('NO MAGNET IN DETAIL', String(row.id))
      }

      return [mapped]
    } catch (err) {
      return this.debugResult('EXCEPTION', err?.message || 'unknown')
    }
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