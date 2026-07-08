const app = getApp()
const { apiRequest, uploadPoseFrame, DIFFICULTY_LEVELS, LEVEL_NAMES } = require('../../utils/api')

const TARGET_RADIUS = 40
const HIT_TOLERANCE = 40
const SHOULDER_WIDTH_MIN = 0.12
const SHOULDER_WIDTH_MAX = 0.42

Page({
  data: {
    showCamera: true,
    gameRunning: false,
    isPaused: false,
    isLoading: true,
    showCountdown: false,
    countdownText: '准备',
    checkStatus: '',
    showResult: false,
    showBodyWarning: false,
    hit: 0,
    miss: 0,
    remain: 0,
    rate: 0,
    handHit: 0,
    footHit: 0,
    resultRate: 0,
    resultLevel: '',
    resultMsg: ''
  },

  _cameraCtx: null,
  _canvas: null,
  _ctx: null,
  _canvasWidth: 0,
  _canvasHeight: 0,
  _gameLevel: 10,
  _targetCount: 20,
  _targetDuration: 3000,
  _targetType: 'random',
  _side: 'random',
  _targets: [],
  _particles: [],
  _totalGenerated: 0,
  _lastSpawnTime: 0,
  _spawnInterval: 500,
  _shoulderWidth: null,
  _shoulderCenterX: null,
  _shoulderCenterY: null,
  _detectTimer: null,
  _detecting: false,
  _gameLoopTimer: null,
  _countdownTimer: null,
  _lastPoseLandmarks: null,
  _lastLandmarkTime: 0,

  onLoad(options) {
    this._gameLevel = Number(options.level || 10)
    this._targetCount = Number(options.count || 20)
    this._targetDuration = Number(options.duration || 3000)
    this._targetType = options.targetType || 'random'
    this._side = options.side || 'random'
  },

  onReady() {
    this.initCanvas()
  },

  onUnload() {
    this.stopGame()
    this.stopDetection()
  },

  initCanvas() {
    const query = wx.createSelectorQuery()
    query.select('#gameCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        const info = wx.getWindowInfo()
        canvas.width = info.windowWidth * dpr
        canvas.height = info.windowHeight * dpr
        ctx.scale(dpr, dpr)
        this._canvas = canvas
        this._ctx = ctx
        this._canvasWidth = info.windowWidth
        this._canvasHeight = info.windowHeight
        this.setData({ isLoading: false })
        this.startPrecheck()
      })
  },

  onCameraReady() {
    this._cameraCtx = wx.createCameraContext()
  },

  onCameraError(err) {
    console.error('Camera error:', err)
    wx.showToast({ title: '摄像头启动失败', icon: 'none' })
  },

  startPrecheck() {
    this.setData({ showCountdown: true, countdownText: '准备', checkStatus: '正在检测身体...' })
    this.startPoseDetection()
    this._countdownTimer = setTimeout(() => {
      this.beginCountdown()
    }, 3000)
  },

  skipPrecheck() {
    if (this._countdownTimer) clearTimeout(this._countdownTimer)
    this.beginCountdown()
  },

  beginCountdown() {
    let count = 3
    this.setData({ showCountdown: true, countdownText: String(count), checkStatus: '' })
    const timer = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(timer)
        this.setData({ showCountdown: false })
        this.startGame()
      } else {
        this.setData({ countdownText: String(count) })
      }
    }, 1000)
  },

  startGame() {
    this._targets = []
    this._particles = []
    this._totalGenerated = 0
    this._lastSpawnTime = 0
    this._shoulderWidth = null
    this.setData({
      gameRunning: true,
      isPaused: false,
      showResult: false,
      hit: 0,
      miss: 0,
      remain: this._targetCount,
      rate: 0,
      handHit: 0,
      footHit: 0
    })
    this.startPoseDetection()
    this.startGameLoop()
  },

  startGameLoop() {
    const FPS = 30
    const interval = 1000 / FPS
    this._gameLoopTimer = setInterval(() => {
      if (!this.data.isPaused) {
        this.gameLoop()
      }
    }, interval)
  },

  gameLoop() {
    const now = Date.now()

    if (this._totalGenerated < this._targetCount) {
      if (now - this._lastSpawnTime > this._spawnInterval) {
        this.spawnTarget(now)
        this._lastSpawnTime = now
      }
    }

    this.updateTargets(now)
    this.checkCollisions()
    this.updateParticles()
    this.render()
  },

  spawnTarget(now) {
    const type = this._targetType === 'random'
      ? (Math.random() > 0.5 ? 'hand' : 'foot')
      : this._targetType

    let x, y
    const margin = TARGET_RADIUS + 20
    const side = this._side === 'random'
      ? (Math.random() > 0.5 ? 'left' : 'right')
      : this._side

    if (this._shoulderWidth && this._shoulderCenterX) {
      const halfShoulder = this._shoulderWidth * 1.5
      if (side === 'left') {
        x = this._shoulderCenterX - halfShoulder - Math.random() * 80
      } else {
        x = this._shoulderCenterX + halfShoulder + Math.random() * 80
      }
      y = this._shoulderCenterY + (Math.random() - 0.5) * 200
    } else {
      const leftBound = margin
      const rightBound = this._canvasWidth - margin
      if (side === 'left') {
        x = leftBound + Math.random() * (rightBound / 2 - leftBound)
      } else {
        x = rightBound / 2 + Math.random() * (rightBound - rightBound / 2)
      }
      y = 120 + Math.random() * (this._canvasHeight - 240)
    }

    x = Math.max(margin, Math.min(this._canvasWidth - margin, x))
    y = Math.max(120, Math.min(this._canvasHeight - margin, y))

    this._targets.push({
      id: this._totalGenerated,
      x, y,
      type,
      spawnTime: now,
      duration: this._targetDuration,
      hit: false,
      expired: false
    })
    this._totalGenerated++
  },

  updateTargets(now) {
    let missCount = 0
    this._targets = this._targets.filter(t => {
      if (t.hit) return false
      if (now - t.spawnTime > t.duration) {
        t.expired = true
        missCount++
        return false
      }
      return true
    })

    if (missCount > 0) {
      const newMiss = this.data.miss + missCount
      const total = this.data.hit + newMiss
      const rate = total > 0 ? Math.round(this.data.hit / total * 100) : 0
      this.setData({
        miss: newMiss,
        remain: this._targetCount - this._totalGenerated + this._targets.length,
        rate
      })
    }

    if (this._totalGenerated >= this._targetCount && this._targets.length === 0 && missCount === 0) {
      this.finishGame()
    }
  },

  checkCollisions() {
    if (!this._lastPoseLandmarks) return

    const lm = this._lastPoseLandmarks
    const w = this._canvasWidth
    const h = this._canvasHeight

    const handPoints = [
      lm[19] ? { x: (1 - lm[19].x) * w, y: lm[19].y * h } : null,
      lm[20] ? { x: (1 - lm[20].x) * w, y: lm[20].y * h } : null
    ]
    const footPoints = [
      lm[31] ? { x: (1 - lm[31].x) * w, y: lm[31].y * h } : null,
      lm[32] ? { x: (1 - lm[32].x) * w, y: lm[32].y * h } : null
    ]

    this._targets.forEach(target => {
      if (target.hit || target.expired) return

      let hitPoints = target.type === 'hand' ? handPoints : footPoints
      for (const pt of hitPoints) {
        if (!pt) continue
        const dx = pt.x - target.x
        const dy = pt.y - target.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < TARGET_RADIUS + HIT_TOLERANCE) {
          target.hit = true
          this.onTargetHit(target)
          break
        }
      }
    })
  },

  onTargetHit(target) {
    const newHit = this.data.hit + 1
    const newHandHit = this.data.handHit + (target.type === 'hand' ? 1 : 0)
    const newFootHit = this.data.footHit + (target.type === 'foot' ? 1 : 0)
    const total = newHit + this.data.miss
    const rate = total > 0 ? Math.round(newHit / total * 100) : 0

    this.addParticles(target.x, target.y, target.type === 'hand' ? '#ff4466' : '#4488ff')

    this.setData({
      hit: newHit,
      handHit: newHandHit,
      footHit: newFootHit,
      remain: this._targetCount - this._totalGenerated + this._targets.filter(t => !t.hit && !t.expired).length,
      rate
    })
  },

  addParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i
      const speed = 2 + Math.random() * 4
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        color,
        size: 3 + Math.random() * 4
      })
    }
  },

  updateParticles() {
    this._particles = this._particles.filter(p => {
      p.x += p.vx
      p.y += p.vy
      p.life -= p.decay
      return p.life > 0
    })
  },

  render() {
    const ctx = this._ctx
    if (!ctx) return
    const w = this._canvasWidth
    const h = this._canvasHeight

    ctx.clearRect(0, 0, w, h)

    const now = Date.now()
    this._targets.forEach(target => {
      if (target.hit || target.expired) return
      const elapsed = now - target.spawnTime
      const progress = elapsed / target.duration
      const alpha = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1

      ctx.save()
      ctx.globalAlpha = alpha

      ctx.beginPath()
      ctx.arc(target.x, target.y, TARGET_RADIUS, 0, Math.PI * 2)
      if (target.type === 'hand') {
        ctx.fillStyle = '#ff4466'
        ctx.strokeStyle = '#ff6688'
      } else {
        ctx.fillStyle = '#4488ff'
        ctx.strokeStyle = '#66aaff'
      }
      ctx.fill()
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(target.x, target.y, TARGET_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(target.type === 'hand' ? '拳' : '脚', target.x, target.y)

      ctx.restore()
    })

    this._particles.forEach(p => {
      ctx.save()
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })

    if (this._lastPoseLandmarks) {
      const lm = this._lastPoseLandmarks
      const drawLandmark = (idx, color) => {
        if (!lm[idx]) return
        const px = (1 - lm[idx].x) * w
        const py = lm[idx].y * h
        ctx.beginPath()
        ctx.arc(px, py, 8, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
      drawLandmark(19, '#ff4466')
      drawLandmark(20, '#ff4466')
      drawLandmark(31, '#4488ff')
      drawLandmark(32, '#4488ff')
    }
  },

  startPoseDetection() {
    this.stopDetection()
    this._detectTimer = setInterval(() => {
      if (this._detecting || this.data.isPaused) return
      this.detectPose()
    }, 200)
  },

  stopDetection() {
    if (this._detectTimer) {
      clearInterval(this._detectTimer)
      this._detectTimer = null
    }
  },

  detectPose() {
    if (!this._cameraCtx || this._detecting) return
    this._detecting = true

    this._cameraCtx.takePhoto({
      quality: 'low',
      success: (res) => {
        wx.getFileSystemManager().readFile({
          filePath: res.tempImagePath,
          encoding: 'base64',
          success: (fileRes) => {
            uploadPoseFrame(fileRes.data).then(result => {
              this.handlePoseResult(result)
            }).catch(err => {
              console.warn('Pose detect error:', err)
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

  handlePoseResult(result) {
    if (!result || !result.landmarks) return

    const landmarks = result.landmarks
    this._lastPoseLandmarks = landmarks
    this._lastLandmarkTime = Date.now()

    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    if (leftShoulder && rightShoulder) {
      const dx = rightShoulder.x - leftShoulder.x
      const dy = rightShoulder.y - leftShoulder.y
      const width = Math.sqrt(dx * dx + dy * dy)
      if (width >= SHOULDER_WIDTH_MIN && width <= SHOULDER_WIDTH_MAX) {
        this._shoulderWidth = width * this._canvasWidth
        this._shoulderCenterX = (1 - (leftShoulder.x + rightShoulder.x) / 2) * this._canvasWidth
        this._shoulderCenterY = ((leftShoulder.y + rightShoulder.y) / 2) * this._canvasHeight
      }
    }

    const leftWrist = landmarks[19]
    const rightWrist = landmarks[20]
    const leftAnkle = landmarks[31]
    const rightAnkle = landmarks[32]
    const bodyVisible = leftWrist && rightWrist && leftAnkle && rightAnkle
    this.setData({ showBodyWarning: !bodyVisible && this.data.gameRunning })
  },

  togglePause() {
    this.setData({ isPaused: !this.data.isPaused })
  },

  endGame() {
    this.finishGame()
  },

  finishGame() {
    this.stopGame()
    this.stopDetection()

    const total = this.data.hit + this.data.miss
    const rate = total > 0 ? Math.round(this.data.hit / total * 100) : 0
    const levelName = LEVEL_NAMES[this._gameLevel] || LEVEL_NAMES[10]

    let msg = '太棒了！继续加油！'
    if (rate >= 90) msg = '🌟 空手道大师！完美表现！'
    else if (rate >= 70) msg = '💪 非常出色！你在进步！'
    else if (rate >= 50) msg = '👍 不错，继续练习！'
    else if (rate >= 30) msg = '🎯 还需努力，别放弃！'
    else msg = '💪 再接再厉！'

    this.setData({
      gameRunning: false,
      showResult: true,
      resultRate: rate,
      resultLevel: levelName,
      resultMsg: msg
    })

    this.saveGameRecord(rate)
  },

  saveGameRecord(rate) {
    const user = app.getCurrentUser()
    if (!user) return

    apiRequest('/records', {
      method: 'POST',
      data: {
        name: user.name,
        userId: user.id,
        userLevel: user.level,
        gameLevel: this._gameLevel,
        hit: this.data.hit,
        miss: this.data.miss,
        rate,
        handHit: this.data.handHit,
        footHit: this.data.footHit,
        clientDate: Date.now()
      }
    }).catch(err => console.warn('Save record failed:', err))
  },

  stopGame() {
    if (this._gameLoopTimer) {
      clearInterval(this._gameLoopTimer)
      this._gameLoopTimer = null
    }
  },

  restartGame() {
    this.setData({ showResult: false })
    this.startGame()
  },

  goHome() {
    wx.navigateBack()
  }
})