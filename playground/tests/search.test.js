import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSearchLocale } from '../lib/search.js';

describe('detectSearchLocale', () => {
  it('detects Chinese query', () => {
    const { gl, hl } = detectSearchLocale('尚界Z7主要卖点');
    assert.equal(gl, 'cn');
    assert.equal(hl, 'zh-cn');
  });

  it('detects English query', () => {
    const { gl, hl } = detectSearchLocale('best React hooks practices');
    assert.equal(gl, 'us');
    assert.equal(hl, 'en');
  });

  it('detects explicit country hint: 美国', () => {
    const { gl } = detectSearchLocale('搜美国的电动车品牌');
    assert.equal(gl, 'us');
  });

  it('detects explicit country hint: 日本', () => {
    const { gl } = detectSearchLocale('日本的动漫推荐');
    assert.equal(gl, 'jp');
  });

  it('detects explicit language hint: 英文资料', () => {
    const { hl } = detectSearchLocale('查英文资料关于机器学习');
    assert.equal(hl, 'en');
  });

  it('detects explicit language hint: 用中文', () => {
    const { hl } = detectSearchLocale('用中文搜索 React');
    assert.equal(hl, 'zh-cn');
  });

  it('combines country + language hints', () => {
    const { gl, hl } = detectSearchLocale('用中文搜美国的新能源政策');
    assert.equal(gl, 'us');
    assert.equal(hl, 'zh-cn');
  });

  it('defaults to en/us for mixed alphanumeric', () => {
    const { gl, hl } = detectSearchLocale('Node.js v22 release notes');
    assert.equal(gl, 'us');
    assert.equal(hl, 'en');
  });
});
