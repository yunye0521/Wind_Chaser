App({
  globalData: {
    apiBase: 'https://slkx.store:1998/CAMERA/api',
    currentUser: null,
    usersCache: []
  },

  onLaunch() {
    this.loadUsersCache()
  },

  loadUsersCache() {
    try {
      this.globalData.usersCache = wx.getStorageSync('karate_users') || []
    } catch (e) {
      this.globalData.usersCache = []
    }
  },

  saveUsersCache(users) {
    this.globalData.usersCache = users || []
    try {
      wx.setStorageSync('karate_users', users || [])
    } catch (e) {}
  },

  setCurrentUser(user) {
    this.globalData.currentUser = user
    try {
      wx.setStorageSync('karate_current_user', user)
    } catch (e) {}
  },

  getCurrentUser() {
    if (this.globalData.currentUser) return this.globalData.currentUser
    try {
      this.globalData.currentUser = wx.getStorageSync('karate_current_user') || null
    } catch (e) {}
    return this.globalData.currentUser
  }
})