'use strict';

// 커뮤니티 피드 (인메모리)
let _pid = 1;

class Feed {
  constructor() {
    this.posts = [];
  }

  add(author, text, replyTo = null) {
    const post = {
      id: _pid++,
      authorId: author.id,
      name: author.name,
      emoji: author.emoji,
      text,
      replyTo: replyTo ? replyTo.id : null,
      replyToName: replyTo ? replyTo.name : null,
      t: Date.now(),
    };
    this.posts.push(post);
    if (this.posts.length > 300) this.posts.shift();
    return post;
  }
}

module.exports = { Feed };
