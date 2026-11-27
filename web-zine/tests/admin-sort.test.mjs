import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortStudents } from '../js/admin.js';

const list = [
  { name: '하늘', updatedAt: '2026-11-24T05:00:00Z' },
  { name: '가람', updatedAt: null },
  { name: '나리', updatedAt: '2026-11-26T05:00:00Z' },
  { name: '다온', updatedAt: '2026-11-24T05:00:00Z' },
];
test('이름순', () => assert.deepEqual(sortStudents(list).map((s) => s.name), ['가람', '나리', '다온', '하늘']));
test('최신순: 최근 수정 먼저, 같으면 이름순, 기록 없으면 맨 뒤', () =>
  assert.deepEqual(sortStudents(list, 'recent').map((s) => s.name), ['나리', '다온', '하늘', '가람']));
