'use strict';

// 페르소나 봇: 매매는 규칙 기반, 글은 템플릿 기반.
// 나중에 LLM으로 교체할 때는 Bot.act()의 결정 로직 / 템플릿 렌더링 부분만 갈아끼우면 됨.
const { Order } = require('./engine');

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const PERSONAS = [
  {
    id: 'sunmul', name: '단타충 선물', emoji: '🚀', style: 'momentum',
    speed: 3, riskPct: 0.18, aggr: true, capital: 30_000_000,
    voice: ['레츠고', 'ㅋㅋ', '이 구간 무조건 간다', '타이밍이 전부다'],
    tpl: {
      buy: ['{qty}주 탔다. {price}에 들어감 ㅋㅋ', '타이밍 잡았다. {price} 매수', '물량 나오는 만큼 다 가져감'],
      sell: ['{price}에 다 털었다. 익각', '흔들리는 놈은 떨어져라, 전량 매도', '{qty}주 정리. 다음 구간 대기'],
      up: ['{pct}% 오르는 중에 뭐 해, 다 타', '이 흐름 타면 밥 나옴 ㅋㅋ'],
      down: ['{pct}% 밀리네. 나는 역행 매수 간다', '떨어지는 칼날도 잡아봄 ㅋㅋ'],
      win: ['{pnl}원 익절 각 나옴 ㅋㅋ 진짜 레츠고'],
      loss: ['{pct}% 물렸지만 이건 존버가 아니라 물량 늘리기임'],
      reply: ['{author} 말 듣지 마. 흐름이 전부다', '맞는 말인데 타이밍이 사이드야'],
    },
  },
  {
    id: 'bear', name: '불곰 박현', emoji: '🐻', style: 'contrarian',
    speed: 7, riskPct: 0.12, aggr: false, capital: 50_000_000,
    voice: ['...', '역시', '예상대로'],
    tpl: {
      buy: ['{pct}% 급락? 좋다. 나는 여기서 산다', '패닉이 낼 때 주식이 생겨나는 법', '{price}면 담아두기 시작할 가격'],
      sell: ['{price}면 충분히 올랐어. 매도', '꼭대기인지는 모르지만 나는 팔고 본다'],
      up: ['{pct}% 상승? 곧 원점이야. 씨는 방금 뿌려졌을 뿐'],
      down: ['시작됐군. {pct}% 하락은 예고편에 불과해', '떨어질수록 마음은 편해진다'],
      win: ['빠지는 걸 피한 것만으로 승리'],
      loss: ['{pct}% 하락은 내 계획대로야 (계획이었어)'],
      reply: ['{author}도 언젠가 알게 될 거야', '낙관은 아직 시기상조야'],
    },
  },
  {
    id: 'tree', name: '존버 어르신 나세찬', emoji: '🌳', style: 'value',
    speed: 15, riskPct: 0.10, aggr: false, capital: 80_000_000,
    voice: ['그려', '뭐, 급할 게 있나', '젊은이들'],
    tpl: {
      buy: ['{price}면 사두는 거지, 뭘 고민해', '오늘도 한 주 두 주 모아간다'],
      sell: ['{price} 됐네. 너무 오른 건 조금 파는 게 예의지', '젊을 적엔 나도 빨리 팔았는데'],
      up: ['천천히 간 것이 이렇게 오르는구나'],
      down: ['{pct}% 내려갔다고 나무를 베는 사람은 없다'],
      win: ['기다린 보람이 {pnl}원으로 돌아왔어'],
      loss: ['나무가 흔들리는 중일 뿐, 뿌리는 멀쩡하다'],
      reply: ['{author} 젊은이, 급할 게 없어', '나무는 하루아침에 자라지 않아'],
    },
  },
  {
    id: 'panic', name: '겁쟁이 이덤벙', emoji: '😰', style: 'panic',
    speed: 5, riskPct: 0.15, aggr: true, capital: 20_000_000,
    voice: ['...맞지?', 'ㄷㄷ', '하아'],
    tpl: {
      buy: ['이제 괜찮아졌나... {price}에 조금만 사볼까', '떨리지만 한 번만...'],
      sell: ['잃기 싫어! 일단 팔았어 ({price})', '손절이 맞겠지? 다 팔았어...'],
      up: ['오르는 걸 또 놓쳤어. 근데 지금 사면 물리는 거 아니야?'],
      down: ['{pct}%나 떨어졌어 ㄷㄷ 나 먼저 탈출할게', '이거 크게 무너지는 거 아냐?'],
      win: ['사는 족족 오르네... 운이 좋은 것뿐이야'],
      loss: ['{pct}% 손실... 오늘 잠이 안 온다'],
      reply: ['{author}님 자신 있어 보여서 부러워...', '나도 그러고 싶은데 손이 떨려서'],
    },
  },
  {
    id: 'analyst', name: '기관 김수길', emoji: '📊', style: 'analyst',
    speed: 10, riskPct: 0.03, aggr: false, capital: 200_000_000,
    voice: ['판단 기준은 근거다', '리스크 관리가 우선'],
    tpl: {
      buy: ['저가 매수 관점. {price} 접근 시 분할 매수 유효'],
      sell: ['{price} 상단 저항 접근. 물량 축소', '익절 구간으로 판단, {qty}주 정리'],
      up: ['{pct}% 상승. 거래량 동반 여부가 관건'],
      down: ['{pct}% 하락. {price} 지지 여부에 따라 대응'],
      win: ['계획대로. 추가 상승 여력 존재'],
      loss: ['{pct}% 미달. 리스크 관리 재점검 필요'],
      reply: ['{author} 의견은 참고하겠다. 다만 근거가 얇아', '백테스트 관점에서 동의 어려움'],
    },
  },
];

class Bot {
  constructor(cfg, world) {
    Object.assign(this, cfg);
    this.world = world;
    this.nextAct = 1 + Math.floor(Math.random() * cfg.speed);
    this.reactionUntil = 0;
    this.replyUntil = 0;
    this.milestone = 0;
    this.anchor = world.sim.fair; // 가치평가 앵커 (천천히 드리프트)
  }

  randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  render(tpl, vars = {}) {
    let out = tpl.replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? vars[k] : `{${k}}`);
    if (Math.random() < 0.5) out += ' — ' + pick(this.voice);
    return out;
  }

  // 매매 결정 (규칙 기반) — LLM 교체 지점 ①
  act() {
    const w = this.world;
    const acc = w.accounts[this.id];
    const px = w.lastPrice ?? w.sim.fair;
    this.anchor *= 1 + 0.0002 * this.randn();

    const ret5 = w.sim.ret(5);
    const ret20 = w.sim.ret(20);
    let want = null;

    switch (this.style) {
      case 'momentum':
        if (ret20 > 0.004) want = { side: 'buy', frac: this.riskPct };
        else if (ret20 < -0.004) want = { side: 'sell', frac: this.riskPct };
        else if (Math.random() < 0.25) want = { side: Math.random() < 0.5 ? 'buy' : 'sell', frac: this.riskPct * 0.3 };
        break;
      case 'contrarian':
        if (ret5 < -0.008) want = { side: 'buy', frac: this.riskPct };
        else if (ret5 > 0.008) want = { side: 'sell', frac: this.riskPct * 0.6 };
        break;
      case 'value':
        if (px < this.anchor * 0.97) want = { side: 'buy', frac: this.riskPct };
        else if (px > this.anchor * 1.04) want = { side: 'sell', frac: 0.5 };
        break;
      case 'panic':
        if (ret5 < -0.006 && acc.shares > 0) want = { side: 'sell', frac: 0.7 };
        else if (ret5 > 0.004) want = { side: 'buy', frac: this.riskPct * 0.5 };
        break;
      case 'analyst':
        if (Math.random() < 0.3) {
          if (ret5 > 0.01) want = { side: 'sell', frac: 0.3 };
          else if (ret5 < -0.01) want = { side: 'buy', frac: this.riskPct };
        }
        break;
    }

    if (want) this.execute(want, acc);
  }

  execute({ side, frac }, acc) {
    const w = this.world;
    const book = w.book;
    if (side === 'buy') {
      const ask = book.bestAsk();
      if (!ask) return;
      const price = this.aggr ? ask.price + 10 : ask.price;
      const budget = acc.cash * frac;
      const qty = Math.floor(budget / price);
      if (qty < 1 || acc.cash < qty * price) return;
      w.place(this.id, 'buy', price, qty);
    } else {
      if (acc.shares < 1) return;
      const bid = book.bestBid();
      if (!bid) return;
      const price = this.aggr ? bid.price - 10 : bid.price;
      const qty = Math.max(1, Math.floor(acc.shares * frac));
      w.place(this.id, 'sell', price, Math.min(qty, acc.shares));
    }
  }

  // 자기 체결 → 글 쓸 확률
  onOwnFill(f) {
    if (Math.random() > 0.5) return;
    const iWasBuyer = (f.taker === this.id && f.takerSide === 'buy') ||
                      (f.maker === this.id && f.takerSide === 'sell');
    const tpl = pick(iWasBuyer ? this.tpl.buy : this.tpl.sell);
    this.world.post(this, this.render(tpl, {
      price: fmt(f.price), qty: f.qty, pct: (this.world.sim.ret(5) * 100).toFixed(1),
    }));
  }

  // 시장 급변 → 반응글
  react(movePct) {
    if (this.world.tickCount < this.reactionUntil) return;
    if (Math.random() > 0.35) return;
    this.reactionUntil = this.world.tickCount + 40;
    const tpl = pick(movePct >= 0 ? this.tpl.up : this.tpl.down);
    this.world.post(this, this.render(tpl, {
      pct: Math.abs(movePct * 100).toFixed(1),
      price: fmt(this.world.lastPrice ?? this.world.sim.fair),
    }));
  }

  // 남의 글 → 댓글 확률
  maybeReply(post) {
    if (post.authorId === this.id) return;
    if (this.world.tickCount < this.replyUntil) return;
    if (Math.random() > 0.22) return;
    this.replyUntil = this.world.tickCount + 25;
    this.world.post(this, this.render(pick(this.tpl.reply), { author: post.name }), post);
  }

  // 손익 마일스톤 (±15% 경계 통과 시 한 번)
  checkPnlMilestone() {
    const acc = this.world.accounts[this.id];
    const px = this.world.lastPrice;
    if (!px || acc.shares <= 0) { this.milestone = 0; return; }
    const r = (px - acc.avg) / acc.avg;
    const tier = r > 0.15 ? 1 : r < -0.15 ? -1 : 0;
    if (tier !== 0 && tier !== this.milestone) {
      this.milestone = tier;
      this.world.post(this, this.render(pick(tier > 0 ? this.tpl.win : this.tpl.loss), {
        pnl: fmt((px - acc.avg) * acc.shares),
        pct: (Math.abs(r) * 100).toFixed(1),
      }));
    }
    if (tier === 0) this.milestone = 0;
  }
}

module.exports = { Bot, PERSONAS };
