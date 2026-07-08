const { apiRequest, LEVEL_NAMES } = require('../../utils/api')

Page({
  data: {
    records: [],
    top3: [],
    filterIndex: 0,
    levelNames: []
  },

  onLoad() {
    const levelNames = ['全部等级']
    for (let i = 10; i >= 0; i--) {
      levelNames.push(LEVEL_NAMES[i])
    }
    this.setData({ levelNames })
    this.loadLeaderboard()
  },

  onFilterChange(e) {
    this.setData({ filterIndex: Number(e.detail.value) })
    this.loadLeaderboard()
  },

  loadLeaderboard() {
    const { filterIndex } = this.data
    let url = '/records/leaderboard'
    if (filterIndex > 0) {
      const level = 11 - filterIndex
      url += `?gameLevel=${level}`
    }

    apiRequest(url).then(data => {
      const records = (data.records || data || []).map(r => ({
        ...r,
        gameLevelName: LEVEL_NAMES[r.gameLevel] || LEVEL_NAMES[10]
      }))
      const top3 = records.slice(0, 3)
      const rest = records.slice(3)
      this.setData({ top3, records: rest })
    }).catch(err => {
      console.warn('Load leaderboard failed:', err)
    })
  }
})