import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleSessions } from '../src/session-compat.ts';
import { selectedSessionId, type Sessions } from '../src/activity.ts';
import type { CreationSessions } from '../src/creation.ts';

test('打开会话优先 uiWorkspace.openSession，否则回退 sessions.open', () => {
  const opened: string[] = [];
  const fallback: string[] = [];
  const withNavigate = compatibleSessions({
    list: {},
    binding: () => undefined,
    open(id: string) { fallback.push(id); },
    async create() { return 's'; },
  } as unknown as Sessions, id => opened.push(id));
  withNavigate.open!('s1');
  assert.deepEqual(opened, ['s1']);
  assert.equal(fallback.length, 0);
  const legacy = compatibleSessions({
    list: {},
    binding: () => undefined,
    open(id: string) { fallback.push(id); },
    async create() { return 's'; },
  } as unknown as Sessions);
  legacy.open!('s2');
  assert.deepEqual(fallback, ['s2']);
});

test('binding 缺失时用 retain 补观察引用，离开目录后释放', () => {
  const released: string[] = [];
  const session = { getSnapshot: () => ({ running: false, lastAgentError: 'boom' }), subscribe: () => () => {} };
  const eventSource = { getSnapshot: () => ({ revision: 0, change: { kind: 'replace', entries: [] } }), subscribe: () => () => {} };
  const list = { ids: ['s1'], byId: { s1: { id: 's1', running: true } } };
  const listeners = new Set<() => void>();
  const sessions = compatibleSessions({
    list: { getSnapshot: () => list, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); } },
    binding: () => undefined,
    retain(id: string, options: { source: string }) {
      assert.equal(id, 's1');
      assert.equal(options.source, 'controllerOperation');
      return { binding: { session, eventSource }, ready: Promise.resolve(), release() { released.push(id); } };
    },
  } as unknown as Sessions);
  const bound = sessions.binding('s1');
  assert.equal(bound?.session.getSnapshot().lastAgentError, 'boom');
  list.ids = [];
  for (const listener of listeners) listener();
  sessions.binding('gone');
  assert.deepEqual(released, ['s1']);
});

test('当前会话优先 retainedBy.mainView，否则回退 list.current', () => {
  assert.equal(selectedSessionId({
    current: 'old',
    ids: ['a', 'b'],
    byId: { a: { id: 'a', running: false }, b: { id: 'b', running: true, retainedBy: { mainView: 1 } } },
  }), 'b');
  assert.equal(selectedSessionId({
    current: 'old',
    ids: ['a'],
    byId: { a: { id: 'a', running: true } },
  }), 'old');
});

test('停止的任务立即释放观察引用，卸载释放剩余引用和订阅',()=>{
  const listeners=new Set<()=>void>(),released:string[]=[];
  const state={ids:['idle','running'],byId:{idle:{id:'idle',running:false},running:{id:'running',running:true}}};
  const sessions=compatibleSessions({list:{getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);}},binding:()=>undefined,
    retain(id:string){return {binding:{session:{getSnapshot:()=>({running:true,lastAgentError:null}),subscribe:()=>()=>{}}},ready:Promise.resolve(),release(){released.push(id);}};}} as unknown as Sessions);
  assert.equal(sessions.binding('idle'),undefined);assert.ok(sessions.binding('running'));
  state.byId.running.running=false;for(const fn of listeners)fn();assert.deepEqual(released,['running']);
  state.byId.running.running=true;assert.ok(sessions.binding('running'));sessions.dispose();
  assert.deepEqual(released,['running','running']);assert.equal(listeners.size,0);
  assert.equal(sessions.binding('running'),undefined);sessions.dispose();assert.equal(released.length,2);
});

test('旧版时间线不重播历史完成，增量保留取消原因并复用绑定', () => {
  const start = { seq: 1, type: 'turn/start' };
  const turns = new Map<number, any>([[1, { start, end: { seq: 2, type: 'turn/end', data: { reason: { kind: 'completed' } } } }]]);
  const binding = { session: { getSnapshot: () => ({ chat: { timeline: { turns } } }), subscribe: () => () => {} } };
  const raw = { list: {}, binding: () => binding, open() {}, async create() { return 's'; } } as unknown as Sessions & CreationSessions;
  const sessions = compatibleSessions(raw);
  const adapted = sessions.binding('s')!;
  assert.equal(adapted, sessions.binding('s'));
  assert.equal(adapted.eventSource!.getSnapshot().change.kind, 'replace');
  turns.set(2, { start: { seq: 3, type: 'turn/start' }, end: { seq: 4, type: 'turn/end', data: { reason: { kind: 'cancelled' } } } });
  const snapshot = adapted.eventSource!.getSnapshot();
  assert.equal(snapshot.change.kind, 'append');
  assert.equal(snapshot.change.entries.length, 2);
  assert.equal(snapshot.change.entries[1].event.data?.reason?.kind, 'cancelled');
  assert.equal(adapted.eventSource!.getSnapshot(), snapshot);
  const modern = { ...binding, eventSource: adapted.eventSource };
  const newer = compatibleSessions({ ...raw, binding: () => modern } as unknown as Sessions & CreationSessions);
  assert.equal(newer.binding('s'), modern);
});

test('旧版冷会话随后加载历史时不伪造完成事件', () => {
  let state: any = { openState: 'cold', chat: { timeline: { turns: new Map() } } };
  const binding = { session: { getSnapshot: () => state, subscribe: () => () => {} } };
  const sessions = compatibleSessions({ list: {}, binding: () => binding } as unknown as Sessions & CreationSessions);
  const source = sessions.binding('s')!.eventSource!;
  source.getSnapshot();
  state = { openState: 'open', chat: { timeline: { turns: new Map([[1, { end: { seq: 20, type: 'turn/end', data: { reason: { kind: 'completed' } } } }]]) } } };
  assert.equal(source.getSnapshot().change.kind, 'replace');
});
