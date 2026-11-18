import { formatBytes, formatDuration, formatRate } from './formatStats'

const GB = 1024 ** 3
const MB = 1024 ** 2

describe('formatStats', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [7.8 * GB, '7.8 GB'],
    [120 * GB, '120 GB'],
    [476.3 * GB, '476 GB'],
    [2.5 * 1024 * GB, '2.5 TB'],
  ])('formatBytes(%d) = %s', (n, text) => expect(formatBytes(n)).toBe(text))

  it.each([
    [0, '0 B/s'],
    [1.2 * MB, '1.2 MB/s'],
    [3.4 * MB, '3.4 MB/s'],
    [800 * 1024, '800 KB/s'],
  ])('formatRate(%d) = %s', (n, text) => expect(formatRate(n)).toBe(text))

  it.each([
    [45, '45 s'],
    [12 * 60 + 5, '12 min'],
    [2 * 3600 + 5 * 60, '2 h 5 min'],
    [3 * 86400 + 4 * 3600 + 59 * 60, '3 d 4 h'],
  ])('formatDuration(%d) = %s', (s, text) => expect(formatDuration(s)).toBe(text))
})
