// 네이티브 HTML 드래그에 의존하지 않아 iPhone·Android 터치와 마우스를 함께 처리한다.
export class TileDrag {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.current = null;
    this.suppressUntil = 0;
    root.addEventListener('pointerdown',event=>this.down(event));
    document.addEventListener('pointermove',event=>this.move(event),{passive:false});
    document.addEventListener('pointerup',event=>this.up(event));
    root.addEventListener('pointercancel',()=>this.cancel());
    root.addEventListener('lostpointercapture',event=>{
      // 터치는 타일에 암시적 캡처가 생긴다. main으로 넘길 때 타일에서 발생하는 해제는 취소가 아니다.
      if(event.target===root && this.current?.pointer===event.pointerId)this.cancel();
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape')this.cancel();});
  }
  get suppressed() {return performance.now()<this.suppressUntil;}
  down(event) {
    if (!event.isPrimary || event.button !== 0 || this.current) return;
    this.suppressUntil=0;
    const source = event.target.closest('[data-action="tile"]');
    if (!source || source.disabled) return;
    const id = source.dataset.id;
    this.current = {pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,source,id,touch:event.pointerType==='touch' && getComputedStyle(source).touchAction.includes('pan-x'),active:false};
    // 눌렀다 놓으면 기존 타일 선택, 일정 거리 이상 움직이면 드래그로 전환한다.
  }
  move(event) {
    const c = this.current;
    if (!c || c.pointer !== event.pointerId) return;
    c.x=event.clientX;c.y=event.clientY;
    if (!c.active && Math.hypot(c.x-c.startX,c.y-c.startY)<7) return;
    // Mobile tiles reserve horizontal gestures for the native hand/meld scroller.
    // Vertical gestures still drag; taps continue to select tiles as before.
    if (!c.active && c.touch && Math.abs(c.x-c.startX)>Math.abs(c.y-c.startY)) {
      this.cancel();
      return;
    }
    if (!c.active) {
      const ids=this.options.getIds(c.id);
      const blocked=ids.map(id=>this.options.canDrag(id)).find(Boolean);
      if(blocked){this.suppressUntil=performance.now()+400;this.options.onBlocked(blocked);this.cancel();return;}
      c.ids=ids;c.active=true;
      this.root.setPointerCapture(event.pointerId);
      c.ghost=c.source.cloneNode(true);
      c.ghost.removeAttribute('id');c.ghost.removeAttribute('data-action');c.ghost.removeAttribute('data-id');
      c.ghost.classList.add('drag-ghost');c.ghost.setAttribute('aria-hidden','true');
      c.ghost.disabled=false;c.ghost.tabIndex=-1;
      if(ids.length>1){const badge=document.createElement('span');badge.className='drag-count';badge.textContent=String(ids.length);c.ghost.append(badge);}
      document.body.append(c.ghost);
      this.root.querySelectorAll('[data-action="tile"]').forEach(tile=>tile.classList.toggle('drag-source',ids.includes(tile.dataset.id)));
      document.body.classList.add('tile-dragging');
      c.marker=document.createElement('div');c.marker.className='drop-marker';c.marker.setAttribute('aria-hidden','true');document.body.append(c.marker);
      this.tick();
    }
    event.preventDefault();
    this.update();
  }
  update() {
    const c=this.current;if(!c?.active)return;
    c.ghost.style.left=`${c.x-24}px`;c.ghost.style.top=`${c.y-38}px`;
    const hit=document.elementFromPoint(c.x,c.y);
    const group=hit?.closest('[data-group]');
    const rack=hit?.closest('[data-rack]');
    const board=hit?.closest('.table-area');
    this.root.querySelectorAll('.drop-target,.drop-blocked').forEach(el=>el.classList.remove('drop-target','drop-blocked'));
    c.destination=null;c.marker.hidden=true;
    if (rack) {
      const position=this.insertion(rack,c.x,c.y,true);
      c.destination={zone:'rack',index:position.index};rack.classList.add('drop-target');this.mark(position);
    } else if (group) {
      const position=this.insertion(group.querySelector('.meld-tiles'),c.x,c.y,false);
      c.destination={zone:'group',groupId:group.dataset.group,index:position.index};
      group.classList.add(group.dataset.dropAllowed==='true'?'drop-target':'drop-blocked');
      this.mark(position);
    } else if (board) {
      c.destination={zone:'new'};
      (board.querySelector('[data-new-meld]')||board).classList.add('drop-target');
    }
  }
  insertion(container,x,y,wrap) {
    const all=[...container.querySelectorAll('[data-action="tile"]')].map((el,index)=>({index,rect:el.getBoundingClientRect()}));
    if(!all.length){const rect=container.getBoundingClientRect();return {index:0,x:rect.left+6,y:rect.top+4,height:52};}
    let row=all;
    if(wrap){
      const nearest=all.reduce((best,item)=>Math.abs(y-(item.rect.top+item.rect.height/2))<Math.abs(y-(best.rect.top+best.rect.height/2))?item:best);
      row=all.filter(item=>Math.abs(item.rect.top-nearest.rect.top)<8);
    }
    const before=row.find(item=>x<item.rect.left+item.rect.width/2);
    if(before)return {index:before.index,x:before.rect.left-3,y:before.rect.top,height:before.rect.height};
    const last=row.at(-1);return {index:last.index+1,x:last.rect.right+3,y:last.rect.top,height:last.rect.height};
  }
  mark(position) {
    const marker=this.current.marker;marker.hidden=false;
    marker.style.left=`${position.x}px`;marker.style.top=`${position.y}px`;marker.style.height=`${position.height}px`;
  }
  tick() {
    const c=this.current;if(!c?.active)return;
    // 받침대에서 위쪽 게임판까지 끌 때 화면 가장자리에서 스크롤한다.
    const edge=64;
    const speed=c.y<edge?-10:c.y>innerHeight-edge?10:0;
    if(speed){window.scrollBy(0,speed);this.update();}
    c.frame=requestAnimationFrame(()=>this.tick());
  }
  up(event) {
    const c=this.current;if(!c||c.pointer!==event.pointerId)return;
    if(!c.active){this.cancel();return;}
    event.preventDefault();this.suppressUntil=performance.now()+400;
    this.update();
    const drop=c.destination?{ids:[...c.ids],destination:c.destination}:null;
    this.cancel();
    if(drop)this.options.onDrop(drop);
  }
  cancel() {
    const c=this.current;if(!c)return;
    this.current=null;
    if(c.frame)cancelAnimationFrame(c.frame);
    c.ghost?.remove();c.marker?.remove();
    this.root.querySelectorAll('.drag-source,.drop-target,.drop-blocked').forEach(el=>el.classList.remove('drag-source','drop-target','drop-blocked'));
    document.body.classList.remove('tile-dragging');
    if(this.root.hasPointerCapture(c.pointer))this.root.releasePointerCapture(c.pointer);
  }
}
