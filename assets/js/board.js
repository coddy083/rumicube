export const colors = ['red', 'blue', 'black', 'orange'];
export const colorNames = {
  red: '빨강',
  blue: '파랑',
  black: '검정',
  orange: '초록'
};
export const symbols = {
  red: '◆',
  blue: '●',
  black: '■',
  orange: '▲'
};
export const effective = t => ({
  color: t.joker ? t.asColor : t.color,
  number: t.joker ? t.asNumber : t.number
});
export function resolveGroup(tiles) {
  if (tiles.length < 3 || tiles.length > 13) return null;
  const normal = tiles.filter(t => !t.joker), jokers = tiles.filter(t => t.joker);
  if (normal.some(t => !colors.includes(t.color) || !Number.isInteger(t.number) || t.number < 1 || t.number > 13)) return null;
  const nums = normal.map(t => t.number), cs = normal.map(t => t.color);
  if (tiles.length <= 4 && new Set(nums).size <= 1 && new Set(cs).size === normal.length) {
    const missing = colors.filter(c => !cs.includes(c));
    return {type:'그룹', values:new Map([...normal.map(t => [t.id, effective(t)]), ...jokers.map((t,i) => [t.id,{color:missing[i],number:nums[0] ?? 13}])])};
  }
  if (new Set(cs).size <= 1 && new Set(nums).size === normal.length) {
    for (let start = 14-tiles.length; start >= 1; start--) {
      const range = Array.from({length:tiles.length},(_,i) => start+i);
      if (!nums.every(n => range.includes(n))) continue;
      const missing = range.filter(n => !nums.includes(n));
      return {type:'연속', values:new Map([...normal.map(t => [t.id,effective(t)]), ...jokers.map((t,i) => [t.id,{color:cs[0] ?? 'red',number:missing[i]}])])};
    }
  }
  return null;
}
export const validateGroup = tiles => resolveGroup(tiles)?.type ?? null;
function sortTiles(tiles) {
  const resolved = resolveGroup(tiles);
  const number = t => resolved?.values.get(t.id)?.number ?? (t.joker ? 14 : t.number);
  tiles.sort((a,b) => number(a)-number(b));
}
export class Editor {
  constructor(state) {
    this.baseRevision = state.revision;
    this.board = structuredClone(state.board);
    this.rack = structuredClone(state.rack);
    this.originalOwn = new Set(state.rack.map(t => t.id));
    this.originalBoard = new Set(state.board.flatMap(g => g.tiles.map(t => t.id)));
    this.selected = [];
    this.history = [];
    this.changed = false;
  }
  all() {
    return [...this.rack, ...this.board.flatMap(g => g.tiles)];
  }
  tile(id) {
    return this.all().find(t => t.id === id);
  }
  checkpoint() {
    this.history.push(structuredClone({
      board: this.board,
      rack: this.rack
    }));
    if (this.history.length > 50) this.history.shift();
    this.changed = true;
  }
  undo() {
    const old = this.history.pop();
    if (!old) return;
    Object.assign(this, old);
    this.selected = [];
    this.changed = this.history.length > 0;
  }
  toggle(id) {
    if (this.selected.includes(id)) this.selected = this.selected.filter(x => x !== id);
    else this.selected.push(id);
  }
  moveSelection(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= this.selected.length) return;
    [this.selected[index], this.selected[next]] = [this.selected[next], this.selected[index]];
  }
  place(groupId = null, prepend = false) {
    if (!this.selected.length) return;
    const selectedTiles = this.selected.map(id => this.tile(id));
    const oldIndex = this.board.findIndex(g => g.id === groupId);
    this.checkpoint();
    this.rack = this.rack.filter(t => !this.selected.includes(t.id));
    this.board = this.board.map(g => ({
      ...g,
      tiles: g.tiles.filter(t => !this.selected.includes(t.id))
    })).filter(g => g.tiles.length || g.id === groupId);
    let group = this.board.find(g => g.id === groupId);
    if (!group) {
      group = {
        id: groupId || `g-${crypto.randomUUID?.() || Date.now()}`,
        tiles: []
      };
      this.board.splice(oldIndex >= 0 ? oldIndex : this.board.length, 0, group);
    }
    group.tiles = prepend ? [...selectedTiles, ...group.tiles] : [...group.tiles, ...selectedTiles];
    this.selected = [];
  }
  // 드래그 위치에 타일을 삽입한다. 같은 줄 안에서 옮길 때 제거된 타일 수만큼 위치를 보정한다.
  moveTiles(ids, destination) {
    ids = [...new Set(ids)];
    const items = ids.map(id => this.tile(id));
    if (!ids.length || items.some(t => !t)) throw new Error('옮길 타일을 다시 선택해 주세요.');
    if (destination.zone === 'rack' && ids.some(id => this.originalBoard.has(id))) {
      throw new Error('공용 게임판의 타일은 손패로 가져갈 수 없어요. 다른 조합으로 옮겨 주세요.');
    }
    const target = destination.zone === 'rack' ? this.rack : this.board.find(g => g.id === destination.groupId)?.tiles;
    if (destination.zone === 'group' && !target) throw new Error('옮길 조합이 바뀌었어요. 다시 시도해 주세요.');
    let index = target ? Math.min(destination.index ?? target.length, target.length) : 0;
    if (target) index -= target.slice(0,index).filter(t => ids.includes(t.id)).length;
    const rackOnly = destination.zone === 'rack' && ids.every(id => this.rack.some(t => t.id === id));
    if (!rackOnly) this.checkpoint();
    this.rack = this.rack.filter(t => !ids.includes(t.id));
    this.board = this.board.map(g => ({...g, tiles:g.tiles.filter(t => !ids.includes(t.id))}))
      .filter(g => g.tiles.length || g.id === destination.groupId);
    if (destination.zone === 'rack') {
      this.rack.splice(Math.max(0,index),0,...items);
    } else {
      let group = this.board.find(g => g.id === destination.groupId);
      if (!group) {group = {id:`g-${crypto.randomUUID?.() || Date.now()}`,tiles:[]};this.board.push(group);}
      group.tiles.splice(Math.max(0,index),0,...items);
      if (validateGroup(group.tiles) === '연속') sortTiles(group.tiles);
    }
    this.selected = [];
  }
  toRack() {
    if (!this.selected.length) return;
    if (this.selected.some(id => this.originalBoard.has(id))) throw new Error('기존 게임판의 타일은 손패로 가져갈 수 없어요.');
    const items = this.selected.map(id => this.tile(id));
    this.checkpoint();
    this.rack = this.rack.filter(t => !this.selected.includes(t.id)).concat(items);
    this.board = this.board.map(g => ({
      ...g,
      tiles: g.tiles.filter(t => !this.selected.includes(t.id))
    })).filter(g => g.tiles.length);
    this.selected = [];
  }
  sortRack(mode) {
    this.rack.sort((a, b) => {
      if (a.joker !== b.joker) return a.joker ? 1 : -1;
      const x = effective(a),
        y = effective(b);
      return mode === 'color' ? colors.indexOf(x.color) - colors.indexOf(y.color) || x.number - y.number : x.number - y.number || colors.indexOf(x.color) - colors.indexOf(y.color);
    });
  }
  sortGroup(id) {
    this.checkpoint();
    sortTiles(this.board.find(g => g.id === id).tiles);
  }
  serialize() {
    return {
      board: this.board.map(g => ({
        id: g.id,
        tiles: g.tiles.map(t => ({id: t.id}))
      }))
    };
  }
}

