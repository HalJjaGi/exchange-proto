'use strict';

// 캔들(OHLCV) 집계기.
// 1틱 = 1초, period=30 → 30초봉. 버킷은 tickCount 기준이라 헤드리스 테스트에서도 결정적.
// 봉의 가격은 실제 체결가(lastPrice), 거래량은 체결 수량 기준.
// 체결 없는 구간은 직전 가격으로 flat 봉 유지 → 시계열 끊김 없음.
class CandleAggregator {
  constructor(period = 30, maxCandles = 300) {
    this.period = period;
    this.maxCandles = maxCandles;
    this.candles = []; // 완성된 봉들
    this.cur = null;   // 만들어지는 중인 봉
  }

  onTick(tickCount, price) {
    const bucket = Math.floor(tickCount / this.period);
    if (!this.cur || this.cur.t !== bucket) {
      if (this.cur) {
        this.candles.push(this.cur);
        if (this.candles.length > this.maxCandles) this.candles.shift();
      }
      this.cur = { t: bucket, o: price, h: price, l: price, c: price, v: 0 };
    } else {
      this.cur.h = Math.max(this.cur.h, price);
      this.cur.l = Math.min(this.cur.l, price);
      this.cur.c = price;
    }
  }

  onTrade(price, qty) {
    if (!this.cur) return;
    this.cur.h = Math.max(this.cur.h, price);
    this.cur.l = Math.min(this.cur.l, price);
    this.cur.c = price; // 종가는 마지막 체결가
    this.cur.v += qty;
  }

  all() {
    return this.cur ? [...this.candles, this.cur] : [...this.candles];
  }
}

module.exports = { CandleAggregator };
