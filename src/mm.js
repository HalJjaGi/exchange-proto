'use strict';

// 마켓메이커(MM): 항상 양방향 호가를 깔아 유동성 공급.
// - 중심가 = 최근 체결가(0.7) + 시뮬레이터 적정가(0.3)
//   → 이용자가 대량 매수하면 체결가가 올라가고 MM 호가도 따라 올라감 (가격 발견)
// - 변동성이 크면 스프레드 확대
// - 인벤토리(재고)가 쌓이면 호가를 아래로 기울여서 털어냄
const { Order } = require('./engine');

class MarketMaker {
  constructor(owner = 'mm') {
    this.owner = owner;
    this.quoteIds = [];
    this.inventory = 0; // 양수: 순보유 / 음수: 공매 형태 (프로토타입에선 허용)
  }

  onFill(f) {
    const mmIsBuyer = (f.takerSide === 'buy' ? f.maker : f.taker) === 'mm';
    this.inventory += mmIsBuyer ? f.qty : -f.qty;
  }

  requote(world) {
    for (const id of this.quoteIds) world.cancelOrder(id);
    this.quoteIds = [];

    const center0 = 0.7 * (world.lastPrice ?? world.sim.fair) + 0.3 * world.sim.fair;
    const half0 = 20 + world.sim.volatility() * 30000 + Math.random() * 10;
    const half = Math.max(10, Math.round(half0 / 10) * 10);
    const skew = Math.max(-40, Math.min(40, -Math.round(this.inventory / 120) * 10));
    const center = Math.round(center0 / 10) * 10;

    let bid = center - half + skew;
    let ask = center + half + skew;
    if (ask <= bid) { bid -= 10; ask += 10; }

    const r = (n) => Math.floor(Math.random() * n);
    const bidQty = 250 + Math.max(0, this.inventory) + r(90);
    const askQty = 250 + Math.max(0, -this.inventory) + r(90);

    const b = world.placeRaw(new Order({ side: 'buy', price: bid, qty: bidQty, owner: 'mm' }));
    if (b.resting) this.quoteIds.push(b.resting.id);
    const s = world.placeRaw(new Order({ side: 'sell', price: ask, qty: askQty, owner: 'mm' }));
    if (s.resting) this.quoteIds.push(s.resting.id);
  }
}

module.exports = { MarketMaker };
