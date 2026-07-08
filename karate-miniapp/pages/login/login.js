const app = getApp()
const { apiRequest, uploadFaceFrame, findBestFaceMatch, LEVEL_NAMES } = require('../../utils/api')

Page({
  data: {
    showCamera: false,
    scanStatus: '正在启动摄像头...',
    recognized: false,
    matchedUser: null,
    possibleMatch: null,
    showRegister: false,
    registerName: '',
    registerLevelIndex: -1,
    levelOptions: []
  },

  _cameraCtx: null,
  _detectTimer: null,
  _detecting: false,

  onLoad() {
    const levelOptions = []
    for (let i = 10; i >= 0; i--) {
      levelOptions.push(LEVEL_NAMES[i])
    }
    this.setData({ levelOptions })

    this.loadUsers()

    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.camera']) {
          this.setData({ showCamera: true })
        } else {
          wx.authorize({
            scope: 'scope.camera',
            success: () => this.setData({ showCamera: true }),
            fail: () => this.setData({ scanStatus: '需要摄像头权限才能使用' })
          })
        }
      }
    })
  },

  onUnload() {
    this.stopDetection()
  },

  onCameraReady() {
    this._cameraCtx = wx.createCameraContext()
    this.setData({ scanStatus: '正在识别人脸...' })
    this.startDetection()
  },

  onCameraError(err) {
    console.error('Camera error:', err)
    this.setData({ scanStatus: '摄像头启动失败' })
  },

  loadUsers() {
    apiRequest('/users').then(data => {
      const users = (data.users || data || []).map(u => ({
        ...u,
        levelName: LEVEL_NAMES[u.level] || LEVEL_NAMES[10]
      }))
      app.saveUsersCache(users)
    }).catch(err => {
      console.warn('Load users failed:', err)
    })
  },

  startDetection() {
    this.stopDetection()
    this._detectTimer = setInterval(() => {
      if (this._detecting) return
      this.detectFace()
    }, 1500)
  },

  stopDetection() {
    if (this._detectTimer) {
      clearInterval(this._detectTimer)
      this._detectTimer = null
    }
  },

  detectFace() {
    if (!this._cameraCtx || this._detecting) return
    this._detecting = true

    this._cameraCtx.takePhoto({
      quality: 'low',
      success: (res) => {
        wx.getFileSystemManager().readFile({
          filePath: res.tempImagePath,
          encoding: 'base64',
          success: (fileRes) => {
            uploadFaceFrame(fileRes.data).then(result => {
              this.handleFaceResult(result)
            }).catch(err => {
              console.warn('Face detect failed:', err)
            }).finally(() => {
              this._detecting = false
            })
          },
          fail: () => { this._detecting = false }
        })
      },
      fail: () => { this._detecting = false }
    })
  },

  handleFaceResult(result) {
    if (!result || !result.descriptor) {
      if (!this.data.recognized && !this.data.possibleMatch && !this.data.showRegister) {
        this.setData({ scanStatus: '未检测到人脸，请正对摄像头' })
      }
      return
    }

    const users = app.globalData.usersCache
    const match = findBestFaceMatch(result.descriptor, users)

    if (match.status === 'auto') {
      this.stopDetection()
      this.setData({
        recognized: true,
        matchedUser: { ...match.user, levelName: LEVEL_NAMES[match.user.level] || LEVEL_NAMES[10] },
        possibleMatch: null,
        showRegister: false,
        scanStatus: ''
      })
      app.setCurrentUser(match.user)
    } else if (match.status === 'possible') {
      this.setData({
        possibleMatch: match.user,
        scanStatus: '检测到相似用户'
      })
    } else {
      this.setData({
        showRegister: true,
        scanStatus: '新用户，请注册'
      })
    }
  },

  confirmPossible() {
    const user = this.data.possibleMatch
    if (user) {
      app.setCurrentUser(user)
      this.setData({ possibleMatch: null, recognized: true, matchedUser: { ...user, levelName: LEVEL_NAMES[user.level] || LEVEL_NAMES[10] } })
      this.stopDetection()
    }
  },

  retryFace() {
    this.setData({ possibleMatch: null, scanStatus: '正在重新识别...' })
  },

  onNameInput(e) {
    this.setData({ registerName: e.detail.value })
  },

  onLevelPick(e) {
    this.setData({ registerLevelIndex: Number(e.detail.value) })
  },

  async doRegister() {
    const { registerName, registerLevelIndex } = this.data
    if (!registerName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (registerLevelIndex < 0) {
      wx.showToast({ title: '请选择等级', icon: 'none' })
      return
    }

    const level = 10 - registerLevelIndex
    try {
      const data = await apiRequest('/users', {
        method: 'POST',
        data: { name: registerName.trim(), level }
      })
      const user = data.user || { name: registerName.trim(), level }
      app.setCurrentUser(user)
      this.stopDetection()
      wx.redirectTo({ url: '/pages/lobby/lobby' })
    } catch (err) {
      wx.showToast({ title: err.message || '注册失败', icon: 'none' })
    }
  },

  enterLobby() {
    wx.redirectTo({ url: '/pages/lobby/lobby' })
  },

  skipLogin() {
    app.setCurrentUser(null)
    wx.redirectTo({ url: '/pages/lobby/lobby' })
  }
})