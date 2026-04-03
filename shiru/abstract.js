export default class AbstractSource {
  async single(options) {
    throw new Error('Source does not implement method #single()')
  }

  async batch(options) {
    throw new Error('Source does not implement method #batch()')
  }

  async movie(options) {
    throw new Error('Source does not implement method #movie()')
  }

  async validate() {
    throw new Error('Source does not implement method #validate()')
  }
}