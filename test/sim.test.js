'use strict';
// 헤드리스 검증: 서버 없이 World를 돌려서 엔진/봇/MM 정상작동을 확인
const assert = require('assert');

// ── 1) 엔진 단위 테스트: 가격-시간 우선 + 부분체결 ──
{
  const { OrderBook, Order } = require('../src/engine');
  const b = new OrderBook();
  b.place(new Order({ side: 'buy', price: 1000, qty: 5, owner: 'A' }));
  b.place(new Order({ side: 'buy', price: 1000, qty: 5, owner: 'B' }));
  b.place(new Order({ side: 'buy', price: 990, qty: 5, owner: 'C' }));
  const r = b.place(new Order({ side: 'sell', price: 990, qty: 12, owner: 'D' }));

  assert.strictEqual(r.fills.length, 3, '3번 체결되어야 함');
  assert.strictEqual(r.fills[0].price, 1000, '높은 매수가부터');
  assert.strictEqual(r.fills[0].maker, 'A', '같은 가격이면 선착순 (A가 B보다 먼저)');
  assert.strictEqual(r.fills[1].maker, 'B');
  assert.strictEqual(r.fills[2].price, 990);
  assert.strictEqual(b.bestBid().price, 990, '남은 매도는 없고 C의 매수만 남음');
  console.log('✔ 엔진 단위 테스트 통과 (가격-시간 우선, 부분체결)');
}

// ── 2) 헤드리스 시뮬레이션: 4000틱 ──
const { World } = require('../src/world');
const w = new World();

let quoted = 0, sampled = 0;
for (let i = 0; i < 4000; i++) {
  w.tick();
  if (i % 10 === 0) {
    sampled++;
    if (w.book.bestAsk() && w.book.bestBid()) quoted++;
  }
  if (i % 50 === 0) {
    for (const [id, a] of Object.entries(w.accounts)) {
      if (id !== 'mm') assert.ok(a.cash >= -1 && a.shares >= 0, `잔고 음수 불가 (${id})`);
    }
  }
}

assert.ok(w.trades.length >= 100, `체결이 충분해야 함 (현재 ${w.trades.length})`);
assert.ok(quoted / sampled > 0.95, `MM 양방향 호가 유지율 ${quoted}/${sampled}`);
assert.ok(w.feed.posts.length >= 20, `커뮤니티 글 부족 (${w.feed.posts.length})`);
assert.ok(w.feed.posts.filter((p) => p.replyTo).length >= 1, '댓글 최소 1개');
assert.ok(w.lastPrice > 20000 && w.lastPrice < 400000, `가격 밴드 이탈 (${w.lastPrice})`);

console.log('✔ 시뮬레이션 4000틱 통과');
console.log(`  최종가 ${w.lastPrice.toLocaleString()} (시가 100,000) | 총 체결 ${w.trades.length}건`);

const by = {};
for (const p of w.feed.posts) by[p.name] = (by[p.name] || 0) + 1;
console.log('  글쓴이별:', Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', '));

const botsPnl = w.bots.map((b) => {
  const a = w.accounts[b.id];
  const px = w.lastPrice;
  const total = a.realized + (a.shares > 0 ? (px - a.avg) * a.shares : 0);
  return `${b.emoji}${b.name} ${(total >= 0 ? '+' : '') + Math.round(total / 10000)}만원`;
});
console.log('  봇 손익:', botsPnl.join(' | '));

console.log('  ── 커뮤니티 글 샘플 ──');
for (const p of w.feed.posts.slice(-8)) {
  const prefix = p.replyTo ? `  ↳ (to ${p.replyToName})` : '  ';
  console.log(`${prefix} ${p.emoji} ${p.name}: ${p.text}`);
}
console.log('\n🎉 전체 통과');
