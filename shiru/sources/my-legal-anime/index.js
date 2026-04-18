import AbstractSource from '../../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  base = 'https://nekobt.to/api/v1'
  apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzY1Mzg4NzksImV4cCI6MTgwODA3NDg3OX0.AWEkxOu0l0Js9hJm1RP8TiTkULTJYH3WOAz6SGLfu54'

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

    return { res, data }
  }

  debug(title, extra = '') {
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

  async single() {
    const me = await this.request('/users/@me')

    if (me.res.status === 401) {
      return this.debug('AUTH FAILED', '401')
    }

    if (me.res.status === 429) {
      return this.debug('RATE LIMITED', String(me.data?.retry_after || '429'))
    }

    if (!me.res.ok) {
      return this.debug('HTTP ERROR', String(me.res.status))
    }

    if (me.data?.error === true) {
      return this.debug('API ERROR', me.data?.message || 'error=true')
    }

    if (!me.data?.data) {
      return this.debug('AUTH SHAPE UNKNOWN', JSON.stringify(me.data || {}).slice(0, 40))
    }

    return this.debug('AUTH OK')
  }

  async batch() {
    return this.single()
  }

  async movie() {
    return this.single()
  }

  async validate() {
    return true
  }
}()
