import AbstractSource from '../../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
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

  async single() {
    return this.debugResult('NEW CODE LOADED')
  }

  async batch() {
    return this.debugResult('NEW CODE LOADED BATCH')
  }

  async movie() {
    return this.debugResult('NEW CODE LOADED MOVIE')
  }

  async validate() {
    return true
  }
}()