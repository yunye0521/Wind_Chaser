const app = getApp()

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${app.globalData.apiBase}${path}`
    const method = options.method || 'GET'
    const header = options.header || {}

    if (options.data && method !== 'GET') {
      header['Content-Type'] = header['Content-Type'] || 'application/json'
    }

    wx.request({
      url,
      method,
      data: options.data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data.ok !== false) {
          resolve(res.data)
        } else {
          const error = new Error(res.data.error || `API request failed: ${res.statusCode}`)
          error.status = res.statusCode
          reject(error)
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Network error'))
      }
    })
  })
}

function uploadPoseFrame(imageBase64) {
  return apiRequest('/pose-detect', {
    method: 'POST',
    data: { image: imageBase64 }
  })
}

function uploadFaceFrame(imageBase64) {
  return apiRequest('/face-detect', {
    method: 'POST',
    data: { image: imageBase64 }
  })
}

function descriptorDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = Number(a[i]) - Number(b[i])
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

function findBestFaceMatch(descriptor, users) {
  const FACE_AUTO_MATCH_THRESHOLD = 0.40
  const FACE_POSSIBLE_MATCH_THRESHOLD = 0.43
  const FACE_MIN_DISTANCE_GAP = 0.08

  if (!descriptor) {
    return { user: null, status: 'unknown', distance: Infinity }
  }

  const candidates = []
  ;(users || []).forEach(user => {
    const descriptors = user.descriptors || (user.descriptor ? [user.descriptor] : [])
    descriptors.forEach((sample, idx) => {
      const distance = descriptorDistance(descriptor, sample)
      candidates.push({ user, distance, sampleIndex: idx })
    })
  })

  candidates.sort((a, b) => a.distance - b.distance)
  const nearest = candidates[0]
  if (!nearest) return { user: null, status: 'new', distance: Infinity }

  const bestKey = String(nearest.user.id ?? nearest.user.name)
  const second = candidates.find(c => String(c.user.id ?? c.user.name) !== bestKey)
  const secondDistance = second ? second.distance : Infinity
  const gap = Number.isFinite(secondDistance) ? secondDistance - nearest.distance : Infinity

  if (gap < FACE_MIN_DISTANCE_GAP) return { ...nearest, status: 'ambiguous' }
  if (nearest.distance <= FACE_AUTO_MATCH_THRESHOLD) return { ...nearest, status: 'auto' }
  if (nearest.distance <= FACE_POSSIBLE_MATCH_THRESHOLD) return { ...nearest, status: 'possible' }
  return { ...nearest, status: 'new' }
}

const DIFFICULTY_LEVELS = {
  10: { count: 20, duration: 3000, name: '10级 (白带)' },
  9:  { count: 30, duration: 3000, name: '9级 (白黄带)' },
  8:  { count: 40, duration: 3000, name: '8级 (黄带)' },
  7:  { count: 30, duration: 2500, name: '7级 (黄绿带)' },
  6:  { count: 40, duration: 2500, name: '6级 (绿带)' },
  5:  { count: 30, duration: 2000, name: '5级 (绿蓝带)' },
  4:  { count: 40, duration: 2000, name: '4级 (蓝带)' },
  3:  { count: 30, duration: 1500, name: '3级 (蓝棕带)' },
  2:  { count: 40, duration: 1500, name: '2级 (棕带)' },
  1:  { count: 30, duration: 1000, name: '1级 (棕黑带)' },
  0:  { count: 40, duration: 1000, name: '黑带 (高手)' }
}

const LEVEL_NAMES = {
  10: '10级 白带', 9: '9级 白黄带', 8: '8级 黄带', 7: '7级 黄绿带',
  6: '6级 绿带', 5: '5级 绿蓝带', 4: '4级 蓝带', 3: '3级 蓝棕带',
  2: '2级 棕带', 1: '1级 棕黑带', 0: '黑带'
}

module.exports = {
  apiRequest,
  uploadPoseFrame,
  uploadFaceFrame,
  descriptorDistance,
  findBestFaceMatch,
  DIFFICULTY_LEVELS,
  LEVEL_NAMES
}