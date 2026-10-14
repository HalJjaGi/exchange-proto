'use strict';

// World: 엔진 + 시뮬레이터 + MM + 봇 + 피드를 묶는 오케스트레이터.
// 1틱(1초) = 시세 생성 → MM 재호가 → 봇 행동 → 이벤트 트리거
const { OrderBook, Order } = require('./engine');
const { MarketSim } = require('./sim');
const { MarketMaker } = require('./mm');
const { Bot, PERSONAS } = require('./bots');
const { Feed } = require('./feed');
const { CandleAggregator } = require('./candles');

const CANDLE_PERIOD_TICKS = 30; // 1틱=1초 → 30초봉

class World {
  constructor() {
    this.accounts = {
      user: { id: 'user', name: '나', cash: 100_000_000, shares: 0, avg: 0, realized: 0 },
      mm: { id: 'mm', name: 'MM', cash: 1e15, shares: 100_000_000, avg: 0, realized: 0 },
    };
    for (const p of PERSONAS) {
      this.accounts[p.id] = { id: p.id, name: p.name, cash: p.capital, shares: 0, avg: 0, realized: 0 };
    }
    this.book = new OrderBook();
    this.sim = new MarketSim(100000);
    this.mmBot = new MarketMaker();
    this.bots = PERSONAS.map((p) => new Bot(p, this));
    this.feed = new Feed();
    this.candles = new CandleAggregator(CANDLE_PERIOD_TICKS);
    this.trades = [];
    this.lastPrice = null;
    this.tickCount = 0;
    this.open = 100000;
    this._lastEventTick = -999;
  }

  tick() {
    this.tickCount++;
    this.sim.tick();
    this.mmBot.requote(this);
    // 캔들 집계: 매 틱 호가 중간가(mid)를 반영 → 봉이 틱마다 살아 움직임
    // (체결은 applyFill에서 onTrade로 반영: 거래량 + 체결가 h/l/c)
    const bb = this.book.bestBid(), ba = this.book.bestAsk();
    const mid = bb && ba ? Math.round((bb.price + ba.price) / 2) : (this.lastPrice ?? this.sim.fair);
    this.candles.onTick(this.tickCount, mid);
    for (const b of this.bots) {
      if (this.tickCount >= b.nextAct) {
        b.nextAct = this.tickCount + b.speed + Math.floor(Math.random() * b.speed);
        b.act();
      }
      b.checkPnlMilestone();
    }
    this.checkMarketEvent();
  }

  checkMarketEvent() {
    const r5 = this.sim.ret(5);
    if (Math.abs(r5) >= 0.009 && this.tickCount - this._lastEventTick > 40) {
      this._lastEventTick = this.tickCount;
      for (const b of this.bots) b.react(r5);
    }
  }

  // 잔고 검증 포함 주문 (이용자/봇용)
  place(ownerId, side, price, qty) {
    const acc = this.accounts[ownerId];
    if (!acc) return { error: 'unknown account' };
    price = Math.round(price);
    qty = Math.round(qty);
    if (!Number.isInteger(price) || price <= 0 || !Number.isInteger(qty) || qty <= 0) {
      return { error: '가격/수량이 올바르지 않습니다' };
    }
    if (side === 'buy' && acc.cash < price * qty) return { error: '주문 가능 금액이 부족합니다' };
    if (side === 'sell' && acc.shares < qty) return { error: '보유 수량이 부족합니다' };
    return this.placeRaw(new Order({ side, price, qty, owner: ownerId }));
  }

  // 검증 없이 엔진에 직접 (MM용)
  placeRaw(order) {
    const res = this.book.place(order);
    for (const f of res.fills) this.applyFill(f);
    return res;
  }

  cancelOrder(id) {
    return this.book.cancel(id);
  }

  applyFill(f) {
    this.lastPrice = f.price;
    this.candles.onTrade(f.price, f.qty);
    this.trades.push({ ...f });
    if (this.trades.length > 500) this.trades.shift();

    const buyer = this.accounts[f.takerSide === 'buy' ? f.taker : f.maker];
    const seller = this.accounts[f.takerSide === 'buy' ? f.maker : f.taker];
    const cost = f.price * f.qty;

    // 매수자
    buyer.cash -= cost;
    const prevShares = buyer.shares;
    buyer.shares += f.qty;
    buyer.avg = (buyer.avg * prevShares + cost) / buyer.shares;

    // 매도자 (실현손익은 평단 기준)
    seller.cash += cost;
    seller.realized += (f.price - seller.avg) * f.qty;
    seller.shares -= f.qty;
    if (seller.shares <= 0) { seller.shares = Math.max(0, seller.shares); seller.avg = 0; }

    if (f.maker === 'mm' || f.taker === 'mm') this.mmBot.onFill(f);
    for (const b of this.bots) {
      if (f.taker === b.id || f.maker === b.id) b.onOwnFill(f);
    }
  }

  // 피드에 글 올리기 (다른 봇의 댓글 트리거 포함)
  post(bot, text, replyTo = null) {
    const p = this.feed.add(bot, text, replyTo);
    for (const b of this.bots) b.maybeReply(p);
    return p;
  }

  userPost(text) {
    const p = this.feed.add({ id: 'user', name: '나', emoji: '🙂' }, text);
    for (const b of this.bots) b.maybeReply(p);
    return p;
  }

  snapshot() {
    const me = this.accounts.user;
    const myOrders = [];
    for (const map of [this.book.bids, this.book.asks]) {
      for (const [, q] of map) {
        for (const o of q) {
          if (o.owner === 'user') {
            myOrders.push({ id: o.id, side: o.side, price: o.price, qty: o.qty, time: o.time });
          }
        }
      }
    }
    const px = this.lastPrice ?? this.sim.fair;
    const pnl = me.shares > 0 ? (px - me.avg) * me.shares : 0;
    const change = px - this.open;
    return {
      t: this.tickCount,
      serverTime: Date.now(),
      symbol: 'JNF',
      price: px,
      open: this.open,
      changePct: (change / this.open) * 100,
      book: { asks: this.book.levels('ask', 8), bids: this.book.levels('bid', 8) },
      trades: this.trades.slice(-15).map((t) => ({ time: t.time, price: t.price, qty: t.qty, side: t.takerSide })),
      me: {
        cash: me.cash,
        shares: me.shares,
        avg: Math.round(me.avg),
        pnl: Math.round(pnl),
        realized: Math.round(me.realized),
        orders: myOrders,
      },
      feed: this.feed.posts.slice(-40),
      chart: this.sim.history.slice(-240),
      candles: this.candles.all().slice(-120),
      candlePeriod: CANDLE_PERIOD_TICKS,
      mmInventory: this.mmBot.inventory,
    };
  }
}

module.exports = { World };
