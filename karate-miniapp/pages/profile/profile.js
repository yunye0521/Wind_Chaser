const app = getApp()
const { apiRequest, LEVEL_NAMES } = require('../../utils/api')

Page({
  data: {
    userName: '',
    userLevelName: '',
    totalGames: 0,
    bestRate: 0,
    totalHit: 0,
    totalMiss: 0,
    history: []
  },

  onLoad() {
    const user = app.getCurrentUser()
    if (user) {
      this.setData({
        userName: user.name,
        userLevelName: LEVEL_NAMES[user.level] || LEVEL_NAMES[10]
      })
      this.loadProfile(user)
    }
  },

  loadProfile(user) {
    const userId = user.id || user.name
    apiRequest(`/users/${userId}/records?limit=20`).then(data => {
      const records = (data.records || data || []).map(r => ({
        ...r,
        gameLevelName: LEVEL_NAMES[r.gameLevel] || LEVEL_NAMES[10],
        dateStr: r.clientDate ? new Date(r.clientDate).toLocaleDateString('zh-CN') : '-'
      }))

      let totalHit = 0, totalMiss = 0, bestRate = 0
      records.forEach(r => {
        totalHit += r.hit || 0
        totalMiss += r.miss || 0
        if ((r.rate || 0) > bestRate) bestRate = r.rate
      })

      this.setData({
        history: records,
        totalGames: records.length,
        bestRate,
        totalHit,
        totalMiss
      })
    }).catch(err => {
      console.warn('Load profile failed:', err)
    })
  },

  goBack() {
    wx.navigateBack()
  }
})