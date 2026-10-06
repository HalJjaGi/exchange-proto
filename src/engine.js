'use strict';

// ── 주문 ────────────────────────────────────────────────────────
let _nextOrderId = 1;

class Order {
  constructor({ side, price, qty, owner }) {
    if (side !== 'buy' && side !== 'sell') throw new Error('side must be buy|sell');
    if (!Number.isInteger(price) || price <= 0) throw new Error('price must be positive integer');
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('qty must be positive integer');
    this.id = _nextOrderId++;
    this.side = side;       // 'buy' | 'sell'
    this.price = price;     // 정수 틱 가격
    this.qty = qty;         // 남은 수량 (부분체결 시 감소)
    this.owner = owner;     // 계좌 id ('user' | 'mm' | 봇 id)
    this.time = Date.now();
  }
}

// ── 호가창 (Order Book) ─────────────────────────────────────────
// 가격 레벨별 FIFO 큐 → 가격-시간 우선(price-time priority) 매칭
class OrderBook {
  constructor() {
    this.bids = new Map(); // price -> [Order...] 매수
    this.asks = new Map(); // price -> [Order...] 매도
  }

  bestAsk() {
    let best = null;
    for (const [price, q] of this.asks) {
      if (!q.length) continue;
      if (best === null || price < best.price) {
        best = { price, qty: q.reduce((s, o) => s + o.qty, 0) };
      }
    }
    return best;
  }

  bestBid() {
    let best = null;
    for (const [price, q] of this.bids) {
      if (!q.length) continue;
      if (best === null || price > best.price) {
        best = { price, qty: q.reduce((s, o) => s + o.qty, 0) };
      }
    }
    return best;
  }

  // 주문 접수: 반대편 호가와 매칭 → 체결, 잔여 수량은 호가에 체류
  place(order) {
    const fills = [];
    const opposite = order.side === 'buy' ? this.asks : this.bids;
    const comparable = order.side === 'buy'
      ? (p) => p <= order.price   // 매수: 매도 최저가가 내 가격 이하면 체결
      : (p) => p >= order.price;  // 매도: 매수 최고가가 내 가격 이상이면 체결

    const prices = [...opposite.keys()].sort((a, b) =>
      order.side === 'buy' ? a - b : b - a
    );

    for (const p of prices) {
      if (order.qty <= 0 || !comparable(p)) break;
      const queue = opposite.get(p);
      while (queue.length && order.qty > 0) {
        const maker = queue[0]; // 같은 가격이면 먼저 들어온 주문부터
        const fillQty = Math.min(order.qty, maker.qty);
        fills.push({
          price: p,
          qty: fillQty,
          taker: order.owner,
          maker: maker.owner,
          makerOrderId: maker.id,
          takerSide: order.side,
          time: Date.now(),
        });
        order.qty -= fillQty;
        maker.qty -= fillQty;
        if (maker.qty === 0) queue.shift();
      }
      if (!queue.length) opposite.delete(p);
    }

    let resting = null;
    if (order.qty > 0) {
      const own = order.side === 'buy' ? this.bids : this.asks;
      if (!own.has(order.price)) own.set(order.price, []);
      own.get(order.price).push(order);
      resting = order;
    }
    return { fills, resting };
  }

  cancel(orderId) {
    for (const map of [this.bids, this.asks]) {
      for (const [price, q] of map) {
        const i = q.findIndex((o) => o.id === orderId);
        if (i >= 0) {
          q.splice(i, 1);
          if (!q.length) map.delete(price);
          return true;
        }
      }
    }
    return false;
  }

  levels(side, depth = 10) {
    const map = side === 'bid' ? this.bids : this.asks;
    const out = [];
    for (const [price, q] of map) {
      out.push({ price, qty: q.reduce((s, o) => s + o.qty, 0) });
    }
    out.sort((a, b) => (side === 'bid' ? b.price - a.price : a.price - b.price));
    return out.slice(0, depth);
  }
}

module.exports = { Order, OrderBook };
