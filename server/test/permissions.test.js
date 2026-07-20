// Тесты правил видимости/прав по ролям (зеркало «описание UI.txt»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canCreatePub, canSeeAll, canManageUsers, canApprove, planTabsFor,
  allowedStatusTransitions, pubVisibilityWhere, canViewPub, canEditPub,
  CUSTOMER_STATUSES,
} from '../src/permissions.js';

const owner = { id: 'o1', role: 'owner', rights: {} };
const makerFull = { id: 'm1', role: 'maker', rights: { createPub: true, seeAll: true, createTask: true } };
const makerLimited = { id: 'm2', role: 'maker', rights: { createPub: false, seeAll: false, createTask: false } };
const customer = { id: 'c1', role: 'customer', rights: {} };

test('создание публикаций', () => {
  assert.equal(canCreatePub(owner), true);
  assert.equal(canCreatePub(makerFull), true);
  assert.equal(canCreatePub(makerLimited), false);
  assert.equal(canCreatePub(customer), false);
});

test('видеть общий контент-план (вкладка «Все»)', () => {
  assert.equal(canSeeAll(owner), true);
  assert.equal(canSeeAll(makerFull), true);
  assert.equal(canSeeAll(makerLimited), false);
});

test('управление пользователями и согласование — только владелец', () => {
  assert.equal(canManageUsers(owner), true);
  assert.equal(canManageUsers(makerFull), false);
  assert.equal(canApprove(owner), true);
  assert.equal(canApprove(makerFull), false);
});

test('состав вкладок раздела «План»', () => {
  assert.deepEqual(planTabsFor(owner), ['control', 'all', 'calendar']);
  assert.deepEqual(planTabsFor(makerFull), ['tasks', 'all', 'calendar']);
  assert.deepEqual(planTabsFor(makerLimited), ['tasks', 'calendar']);
  assert.deepEqual(planTabsFor(customer), ['calendar', 'list']);
});

test('переходы статусов контент-мейкера — только по своим задачам', () => {
  const ownPub = { id: 'p1', ownerId: 'm1', status: 'draft' };
  const foreignPub = { id: 'p2', ownerId: 'x', status: 'draft' };
  assert.deepEqual(allowedStatusTransitions(makerFull, ownPub), ['work']);
  assert.deepEqual(allowedStatusTransitions(makerFull, foreignPub), []);
  // из review контент-мейкер сам согласовать не может
  assert.deepEqual(allowedStatusTransitions(makerFull, { ownerId: 'm1', status: 'review' }), []);
});

test('владелец может любой переход', () => {
  const t = allowedStatusTransitions(owner, { status: 'review' });
  assert.ok(t.includes('ready') && t.includes('fixes') && t.includes('canceled'));
});

test('видимость публикаций: заказчик — только рабочие/готовые/опубликованные', () => {
  const where = pubVisibilityWhere(customer);
  assert.deepEqual(where.status, { in: CUSTOMER_STATUSES });
  assert.equal(pubVisibilityWhere(owner).status, undefined);
});

test('заказчик не видит черновик, видит опубликованное', () => {
  assert.equal(canViewPub(customer, { status: 'draft', archived: false }), false);
  assert.equal(canViewPub(customer, { status: 'published', archived: false }), true);
});

test('редактирование: мейкер только свои, заказчик — никогда', () => {
  assert.equal(canEditPub(makerFull, { ownerId: 'm1' }), true);
  assert.equal(canEditPub(makerFull, { ownerId: 'other' }), false);
  assert.equal(canEditPub(customer, { ownerId: 'c1' }), false);
  assert.equal(canEditPub(owner, { ownerId: 'anyone' }), true);
});
