'use strict';

// 시세 시뮬레이터: 국면(regime) 전환 + 점프가 있는 기하 랜덤워크
// 이게 "적정가(fair price)"를 만들고, MM이 그 주변에 호가를 깐다.
const REGIMES = {
  calm: { vol: 0.0008, drift: 0.00002 },
  bull: { vol: 0.0016, drift: 0.00045 },
  bear: { vol: 0.0016, drift: -0.00045 },
  wild: { vol: 0.0035, drift: 0 },
};

class MarketSim {
  constructor(startPrice = 100000) {
    this.fair = startPrice;
    this.regime = 'calm';
    this.history = [startPrice];
  }

  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  tick() {
    if (Math.random() < 0.004) { // 국면 전환 (평균 250틱마다)
      const keys = Object.keys(REGIMES);
      this.regime = keys[Math.floor(Math.random() * keys.length)];
    }
    const { vol, drift } = REGIMES[this.regime];
    let ret = drift + vol * this.gauss();
    if (Math.random() < 0.003) { // 점프 (급락/급등 이벤트)
      ret += (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.03);
    }
    this.fair = Math.round(this.fair * Math.exp(ret) / 10) * 10;
    this.fair = Math.max(10000, Math.min(500000, this.fair));
    this.history.push(this.fair);
    if (this.history.length > 600) this.history.shift();
  }

  price(nAgo = 0) {
    return this.history[this.history.length - 1 - nAgo] ?? this.fair;
  }

  ret(n) { // n틱 로그수익률
    const a = this.price(n), b = this.price(0);
    return a ? Math.log(b / a) : 0;
  }

  volatility(window = 20) {
    const n = Math.min(window, this.history.length - 1);
    if (n < 2) return 0.001;
    const rets = [];
    for (let i = n; i > 0; i--) {
      const cur = this.history[this.history.length - i];
      const prev = this.history[this.history.length - i - 1];
      rets.push(Math.log(cur / prev));
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
    return Math.sqrt(varr);
  }
}

module.exports = { MarketSim };
