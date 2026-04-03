import AbstractSource from '../abstract.js'

export default new class MyLegalAnime extends AbstractSource {
  async single({ titles }) {
    return [
      {
        title: 'DEBUG RESULT',
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
    ]
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
