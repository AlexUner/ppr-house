/* =========================================================
   МОДЕЛЬ ДАННЫХ
   ========================================================= */
const model={
  W:2,       // ширина
  D:3,       // глубина
  side:2,    // длина ската
  angle:15,  // угол ската (если режим angle)
  roofMode:'fixed',
  supports:[] // промежуточные стойки (x-координаты 0..W)
};

/* =========================================================
   КОНСТАНТЫ
   ========================================================= */
const M=50; // Маштаб: 1 м = 50 px, для топ/сайд; фронт подбираем отдельно
const PIPE_MAX=3; // макс. длина трубы без муфты (м)

/* =========================================================
   ПОЛЕЗНЫЕ ФУНКЦИИ
   ========================================================= */
const rad=d=>d*Math.PI/180;
const dist=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
const history=[];
let historyIndex=-1;
function pushHistory(){
  history.splice(historyIndex+1);
  history.push(JSON.parse(JSON.stringify(model)));
  historyIndex=history.length-1;
}
function restoreState(state){
  Object.assign(model,state);
  refreshInputs();
  updateAll(false);
}
const safeNum=(v,def)=>{const n=parseFloat(v);return Number.isFinite(n)?n:def;};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

function roofHeight(){
  const half=model.W/2;
  if(model.roofMode==='fixed') return Math.sqrt(Math.max(model.side**2-half**2,0));
  return Math.tan(rad(model.angle))*half;
}

function getNodes(){
  const h=roofHeight();
  const half=model.W/2;
  return {
    lf:{x:0,y:0,z:0},
    rf:{x:model.W,y:0,z:0},
    lb:{x:0,y:model.D,z:0},
    rb:{x:model.W,y:model.D,z:0},
    af:{x:half,y:0,z:h},
    ab:{x:half,y:model.D,z:h},
    supports:model.supports.slice().sort((a,b)=>a-b)
      .map(x=>({x,y:0,z:0}))
  };
}
function drawGrid(layer,stage,scaleX,scaleY,pad,step=0.1){
  const w=stage.width()-pad*2;
  const h=stage.height()-pad*2;
  const stepX=scaleX*step;
  const stepY=(scaleY||scaleX)*step;
  for(let x=pad; x<=w+pad+1; x+=stepX){
    layer.add(new Konva.Line({points:[x,pad,x,pad+h],stroke:'var(--grid)',strokeWidth:1}));
  }
  for(let y=pad; y<=h+pad+1; y+=stepY){
    layer.add(new Konva.Line({points:[pad,y,pad+w,y],stroke:'var(--grid)',strokeWidth:1}));
  }
}

/* =========================================================
   ОБНОВЛЕНИЕ ПАРАМЕТРОВ UI → модель
   ========================================================= */
const $=id=>document.getElementById(id);
function refreshInputs(){
  $('inpWidth').value=model.W;
  $('inpDepth').value=model.D;
  $('inpSide').value=model.side.toFixed(2);
  $('inpAngle').value=model.angle.toFixed(1);
  $('roofMode').value=model.roofMode;
  $('fixedBox').style.display=model.roofMode==='fixed'?'block':'none';
  $('angleBox').style.display=model.roofMode==='angle'?'block':'none';
}
$('inpWidth').oninput=e=>{model.W=clamp(safeNum(e.target.value,model.W),1,10);updateAll();};
$('inpDepth').oninput=e=>{model.D=clamp(safeNum(e.target.value,model.D),1,10);updateAll();};
$('inpSide').oninput=e=>{model.side=clamp(safeNum(e.target.value,model.side),0.1,10);updateAll();};
$('inpAngle').oninput=e=>{model.angle=clamp(safeNum(e.target.value,model.angle),5,60);updateAll();};
$('roofMode').onchange=e=>{
  model.roofMode=e.target.value;
  $('fixedBox').style.display=model.roofMode==='fixed'?'block':'none';
  $('angleBox').style.display=model.roofMode==='angle'?'block':'none';
  updateAll();
};
$('btnAddSupport').onclick=()=>{
  // Добавляем стойку посередине проекции спереди
  const x=model.W/2;
  if(!model.supports.includes(x)) model.supports.push(x);
  updateAll();
};
$('btnRemoveSupport').onclick=()=>{
  model.supports.pop();
  updateAll();
};

function undo(){
  if(historyIndex>0){
    historyIndex--;restoreState(history[historyIndex]);
  }
}
function redo(){
  if(historyIndex<history.length-1){
    historyIndex++;restoreState(history[historyIndex]);
  }
}
window.addEventListener('keydown',e=>{
  if(e.ctrlKey && !e.shiftKey && e.key==='z'){e.preventDefault(); undo();}
  if((e.ctrlKey && e.shiftKey && e.key==='Z') || (e.ctrlKey && e.key==='y')){
    e.preventDefault(); redo();
  }
});

/* =========================================================
   ПОДГОТОВКА ХОЛСТОВ KONVA
   ========================================================= */
const stages={};
['front','side','top'].forEach(id=>{
  const container=id+'View';
  const stage=new Konva.Stage({container:container,width:340,height:260});
  const layer=new Konva.Layer();
  stage.add(layer);
  stages[id]={stage,layer};
});

// Вспомогательный тултип
const tooltipEl=$('tooltip');
function showTooltip(text,x,y){tooltipEl.textContent=text;tooltipEl.style.left=x+'px';tooltipEl.style.top=y+'px';tooltipEl.style.display='block';}
function hideTooltip(){tooltipEl.style.display='none';}

/* =========================================================
   СОЗДАНИЕ/ОБНОВЛЕНИЕ ПРОЕКЦИЙ
   ========================================================= */
function updateFront(){
  const {stage,layer}=stages.front;
  layer.destroyChildren();
  const pad=20; // отступ
  drawGrid(layer,stage,(stage.width()-2*pad)/model.W,null,pad);
  const nodes=getNodes();
  const h=roofHeight();
  // Холст‑scale: помещаем по ширине с паддингом
  const scale=(stage.width()-2*pad)/model.W;
  const baseY=stage.height()-pad;
  // базовые узлы
  const leftX=pad;
  const rightX=pad+model.W*scale;
  const apexX=pad+nodes.af.x*scale;
  const apexY=baseY-nodes.af.z*scale;

  // функция узла
  const makeNode=(x,y,draggable,name)=>{
    const c=new Konva.Circle({x,y,r:5,fill:'var(--node)',draggable,name});
    layer.add(c);
    if(draggable){
      c.on('dragmove',()=>{
        if(name==='apex'){
          c.x(apexX);
          const stepPx=scale*0.1;
          let y=Math.min(baseY-20,c.y());
          y=baseY-Math.round((baseY-y)/stepPx)*stepPx;
          c.y(y);
          updateModelFromFront();
        }
      });
      c.on('dragend',pushHistory);
      c.on('mouseenter',()=>stage.container().style.cursor='grab');
      c.on('mouseleave',()=>stage.container().style.cursor='default');
    }
    return c;
  };
  // Создаём объекты
  const leftNode = makeNode(leftX,baseY,false,'left');
  const rightNode= makeNode(rightX,baseY,false,'right');
  const apexNode = makeNode(apexX,apexY,true,'apex');
  // Линии скатов
  const slopeL=new Konva.Line({points:[leftX,baseY,apexX,apexY],stroke:'var(--line)',strokeWidth:2});
  const slopeR=new Konva.Line({points:[rightX,baseY,apexX,apexY],stroke:'var(--line)',strokeWidth:2});
  layer.add(slopeL,slopeR);
  // Вертикальные стойки основания + промежуточные
  const supports=[0,...model.supports.sort((a,b)=>a-b),model.W];
  const getTopY=xm=>{
    if(xm<=half)return baseY-(h*(xm/half))*scale;
    return baseY-(h*((model.W-xm)/half))*scale;
  };
  supports.forEach((xm,i)=>{
    const x=pad+xm*scale;
    const topY=getTopY(xm);
    const post=new Konva.Line({points:[x,baseY,x,topY],stroke:'var(--line)',strokeWidth:2});
    layer.add(post);
    if(i>0 && i<supports.length-1){
      const n=makeNode(x,baseY,true,'support'+i);
      n.on('dragmove',()=>{
        let nx=Math.min(model.W,Math.max(0,(n.x()-pad)/scale));
        const stepPx=scale*0.1;
        const px=pad+Math.round(nx*scale/stepPx)*stepPx;
        n.x(px);
        post.points([px,baseY,px,getTopY(nx)]);
      });
      n.on('dragend',()=>{
        model.supports[i-1]=clamp((n.x()-pad)/scale,0,model.W);
        updateAll();
      });
    }
  });
  // Длина ската label
  const len=model.roofMode==='fixed'?model.side:Math.hypot(model.W/2,h);
  const midX=(leftX+apexX)/2;
  const midY=(baseY+apexY)/2;
  const lbl=new Konva.Text({x:midX,y:midY-18,text:len.toFixed(2)+' м',fontSize:12,fill:'var(--dim)',padding:4});
  layer.add(lbl);
  layer.draw();
}

function updateSide(){
  const {stage,layer}=stages.side;
  layer.destroyChildren();
  const pad=20;
  const scale=(stage.width()-2*pad)/model.D;
  drawGrid(layer,stage,scale,null,pad);
  const baseY=stage.height()-pad;
  const h=roofHeight();

  const leftX=pad;
  const rightX=pad+model.D*scale;
  const apexY=baseY-h*scale;

  // контур
  const poly=new Konva.Line({points:[leftX,baseY,leftX,apexY,rightX,apexY,rightX,baseY],closed:true,stroke:'var(--line)',strokeWidth:2});
  layer.add(poly);
  const centerX=(leftX+rightX)/2;
  // обозначаем линии скатов пунктиром
  layer.add(new Konva.Line({points:[leftX,baseY,centerX,apexY],stroke:'var(--line)',strokeWidth:1,dash:[4,4]}));
  layer.add(new Konva.Line({points:[rightX,baseY,centerX,apexY],stroke:'var(--line)',strokeWidth:1,dash:[4,4]}));
  // длина глубины label
  const lbl=new Konva.Text({x:(leftX+rightX)/2-20,y:baseY+4,text:model.D.toFixed(2)+' м',fontSize:12,fill:'var(--dim)'});
  layer.add(lbl);
  layer.draw();
}

function updateTop(){
  const {stage,layer}=stages.top;
  layer.destroyChildren();
  const pad=20;
  const scale=(stage.width()-2*pad)/model.W;
  const scaleY=(stage.height()-2*pad)/model.D;
  drawGrid(layer,stage,scale,scaleY,pad);
  const baseX=pad;
  const baseY=pad;

  const rect=new Konva.Rect({x:baseX,y:baseY,width:model.W*scale,height:model.D*scaleY,stroke:'var(--line)',strokeWidth:2});
  layer.add(rect);
  // Размеры
  const lblW=new Konva.Text({x:baseX+model.W*scale/2-20,y:baseY-18,text:model.W.toFixed(2)+' м',fontSize:12,fill:'var(--dim)'});
  const lblD=new Konva.Text({x:baseX+model.W*scale+4,y:baseY+model.D*scaleY/2-6,text:model.D.toFixed(2)+' м',fontSize:12,fill:'var(--dim)'});
  layer.add(lblW,lblD);
  layer.draw();
}

/* =========================================================
   ПЕРЕСЧЁТ СПИСКА ТРУБ И МУФТ
   ========================================================= */
function calcPipes(){
  const list=[];
  const half=model.W/2;
  const h=roofHeight();
  const slope=Math.hypot(half,h);
  // основание (периметр)
  list.push({id:'baseW1',len:model.W});
  list.push({id:'baseW2',len:model.W});
  list.push({id:'baseD1',len:model.D});
  list.push({id:'baseD2',len:model.D});
  // стойки
  list.push({id:'postL',len:h});
  list.push({id:'postR',len:h});
  model.supports.forEach((x,i)=>list.push({id:'postS'+(i+1),len:h}));
  // конёк
  list.push({id:'ridge',len:model.D});
  // скаты
  list.push({id:'slopeL',len:slope});
  list.push({id:'slopeR',len:slope});
  return list;
}

function buildPipeUI(){
  const list=calcPipes();
  const cont=$('pipeList');
  cont.innerHTML='';
  list.forEach(p=>{
    const el=document.createElement('div');el.className='pipe';
    // mufts
    const seg=Math.ceil(p.len/PIPE_MAX);
    el.innerHTML=`<span>${p.id}</span><span>${p.len.toFixed(2)} м ${seg>1?`(${seg}×≤${PIPE_MAX})`:''}</span>`;
    cont.appendChild(el);
  });
}

function validateModel(){
  const warn=$('warning');
  const half=model.W/2;
  const h=roofHeight();
  const slope=Math.hypot(half,h);
  if(slope<half){
    warn.textContent='Длина ската слишком мала для заданной ширины';
  }else warn.textContent='';
}

/* =========================================================
   ОТНОШЕНИЕ ПЕРЕМЕЩЕНИЯ APEX → модель
   ========================================================= */
function updateModelFromFront(){
  const {stage,layer}=stages.front;
  const apex=layer.findOne('.apex');
  if(!apex) return;
  const pad=20;
  const scale=(stage.width()-2*pad)/model.W;
  const apexY=(apex.y());
  const baseY=stage.height()-pad;
  const h=(baseY-apexY)/scale; // м
  const half=model.W/2;
  if(model.roofMode==='fixed'){
    const newSide=Math.hypot(half,h);
    model.side=newSide;
    $('inpSide').value=newSide.toFixed(2);
  }else{
    const newAngle=rad2deg(Math.atan(h/half));
    model.angle=newAngle;
    $('inpAngle').value=newAngle.toFixed(1);
  }
  updateAll(false);
}
function rad2deg(r){return r*180/Math.PI;}

/* =========================================================
   ГЛАВНЫЙ ВХОД
   ========================================================= */
function updateAll(log=true){
  updateFront();
  updateSide();
  updateTop();
  buildPipeUI();
  validateModel();
  if(log) pushHistory();
}
updateAll(false);
pushHistory();

