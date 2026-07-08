const app = getApp()
const { DIFFICULTY_LEVELS, LEVEL_NAMES } = require('../../utils/api')

Page({
  data: {
    userName: '',
    userLevelName: '',
    difficultyIndex: 0,
    difficultyNames: [],
    targetTypeIndex: 0,
    targetTypeNames: ['🎲 随机 (拳+脚)', '🔴 仅红球 (拳)', '🔵 仅蓝球 (脚)'],
    targetTypeValues: ['random', 'hand', 'foot'],
    sideIndex: 0,
    sideNames: ['🎲 随机两侧', '⬅️ 仅左侧', '➡️ 仅右侧'],
    sideValues: ['random', 'left', 'right']
  },

  onLoad() {
    const user = app.getCurrentUser()
    const difficultyNames = []
    const keys = Object.keys(DIFFICULTY_LEVELS).map(Number).sort((a, b) => b - a)
    keys.forEach(k => { difficultyNames.push(DIFFICULTY_LEVELS[k].name) })

    this.setData({
      userName: user ? user.name : '',
      userLevelName: user ? (LEVEL_NAMES[user.level] || LEVEL_NAMES[10]) : LEVEL_NAMES[10],
      difficultyNames
    })
  },

  onDifficultyChange(e) {
    this.setData({ difficultyIndex: Number(e.detail.value) })
  },

  onTargetTypeChange(e) {
    this.setData({ targetTypeIndex: Number(e.detail.value) })
  },

  onSideChange(e) {
    this.setData({ sideIndex: Number(e.detail.value) })
  },

  startGame() {
    const { difficultyIndex, targetTypeIndex, sideIndex, targetTypeValues, sideValues, difficultyNames } = this.data
    const keys = Object.keys(DIFFICULTY_LEVELS).map(Number).sort((a, b) => b - a)
    const gameLevel = keys[difficultyIndex]
    const config = DIFFICULTY_LEVELS[gameLevel]
    const targetType = targetTypeValues[targetTypeIndex]
    const side = sideValues[sideIndex]

    wx.navigateTo({
      url: `/pages/game/game?level=${gameLevel}&count=${config.count}&duration=${config.duration}&targetType=${targetType}&side=${side}`
    })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  goLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },

  doLogout() {
    app.setCurrentUser(null)
    wx.redirectTo({ url: '/pages/login/login' })
  }
})