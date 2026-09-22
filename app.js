import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {STLLoader} from './vendor/STLLoader.js';
import {lessons} from './lessons.js';
import {assemblySteps} from './assembly.js';
let assemblyIndex=0;
const $=id=>document.getElementById(id),host=$('viewport'),loader=new STLLoader();
let data,renderer,scene,camera,controls,ready=false,moduleId=1,phase=-1,selected=null,partMesh=null,requestId=0,nodes=[],labels=[],animation=null;
const raycaster=new THREE.Raycaster();
const materials={print:new THREE.MeshStandardMaterial({color:0xc9d8de,roughness:.7}),hardware:new THREE.MeshStandardMaterial({color:0x63798a,roughness:.4,metalness:.35}),shell:new THREE.MeshStandardMaterial({color:0xb7d6df,transparent:true,opacity:.16,depthWrite:false,roughness:.7}),current:new THREE.MeshStandardMaterial({color:0x25b79c,roughness:.55}),selected:new THREE.MeshStandardMaterial({color:0xf1a73d,roughness:.5})};
const group=()=>data.groups.find(g=>g.id===moduleId),members=()=>nodes.filter(n=>n.userData.group===moduleId),number=n=>String(n.userData.index+1).padStart(2,'0');
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
function clearPart(){requestId++;if(partMesh){scene.remove(partMesh);partMesh.geometry.dispose();partMesh=null;} $('printReturn').hidden=true;}
function setModule(id){
 if(id===0){setAssembly(assemblyIndex);return;}
 if(!ready)return;clearPart();$('homeDetail').hidden=true;$('instructions').scrollTop=0;animation=null;moduleId=id;phase=-1;selected=null;
 $('greenLegend').textContent='本小步';$('orangeLegend').textContent='选中';$('explodeLabel').textContent='零件展开';$('collapse').textContent='合拢 / 本步归位';$('explode').value=id?70:0;$('isolate').checked=false;$('explode').disabled=!id;$('isolate').disabled=!id;$('labels').disabled=!id;
 document.querySelectorAll('nav button').forEach(b=>{const on=Number(b.dataset.module)===id;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'step':'false');});
 $('moduleDetail').hidden=!id;$('overviewDetail').hidden=!!id;
 if(!id){$('sceneLabel').textContent='整机连接 · 点击模块进入内部';$('stepCounter').textContent='15 个模块 / 逐件拆解';$('stepTitle').textContent='选择一个模块开始';$('stepDescription').textContent='点击左侧模块或模型，查看组成零件、安装位置和分解试装步骤。';}
 else{
  $('nextModule').textContent=id<15?`下一模块 · ${String(id+1).padStart(2,'0')} ${data.groups.find(g=>g.id===id+1).label} →`:'模块已装好 · 开始合体组装 →';
  const g=group(),l=lessons[id],prints=g.components.filter(c=>c.kind==='打印件').length;
  $('sceneLabel').textContent=`${String(id).padStart(2,'0')} ${g.label} · 内部零件`;$('stepCounter').textContent=`模块 ${String(id).padStart(2,'0')} / 15`;$('stepTitle').textContent=g.label;$('stepDescription').textContent=l.join;
  $('compositionSummary').textContent=`本模块模型含 ${g.components.length} 件：打印件 ${prints}，外购 / 占位 ${g.components.length-prints}。编号与图中一一对应。`;
  $('gapNote').hidden=!l.gap;$('gapNote').textContent=l.gap||'';$('sourceLink').href=`manual.pdf#page=${l.page}`;$('sourceLink').textContent=`原装配说明书 · 第 ${l.page} 页 ↗`;
  $('referenceImages').replaceChildren();for(const p of id===1?[5]:id===10?[14,15]:[]){const a=document.createElement('a');a.href=`reference/page-${p}.png`;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=a.href;img.alt=`机械行者Robo 装配说明书第 ${p} 页，点击放大`;a.append(img);$('referenceImages').append(a);}
  renderStages();renderComposition();renderSelected();renderPhase();
 }updateMeshes();rebuildLabels();fitVisible();
}
function renderStages(){
 $('stageList').replaceChildren();const full=text('button','全部零件拆解');full.onclick=()=>setPhase(-1);full.dataset.phase='-1';$('stageList').append(full);
 lessons[moduleId].stages.forEach((s,i)=>{const b=text('button',`${i+1}. ${s.title}`);b.dataset.phase=i;b.onclick=()=>setPhase(i);$('stageList').append(b);});
}
function renderComposition(){
 $('componentList').replaceChildren();for(const n of members()){const c=n.userData.component,b=document.createElement('button');b.className='component-row';b.dataset.component=n.userData.uid;
 b.append(text('b',number(n),'number'),text('span',`${c.label}${!c.servoId&&group().components.filter(x=>x.key===c.key).length>1?' · '+c.occurrence:''}`),text('small',c.kind==='打印件'?'打印':'外购'));b.onclick=()=>selectComponent(n);$('componentList').append(b);}
}
function selectComponent(n){if(partMesh)return;selected=n;if(phase>=0&&n.userData.phase>phase)phase=n.userData.phase;renderPhase();renderSelected();updateMeshes();rebuildLabels();if($('isolate').checked)fitVisible();}
function renderSelected(){
 $('selectedPart').hidden=!selected;document.querySelectorAll('.component-row').forEach(b=>b.classList.toggle('selected',b.dataset.component===selected?.userData.uid));if(!selected)return;
 const c=selected.userData.component;$('selectedName').textContent=`${number(selected)} · ${c.label}`;$('selectedFile').textContent=c.key;$('selectedAdvice').textContent=`属于小步 ${selected.userData.phase+1}：${lessons[moduleId].stages[selected.userData.phase].title}。橙色为此件；“合拢”可看最终连接位置。`;
 const p=data.parts.find(p=>p.key===c.key);$('downloadPart').hidden=!p;if(p){$('downloadPart').href=p.file;$('downloadPart').download=p.original;$('downloadPart').textContent=`下载原始 STL · 整机清单 ×${p.quantity}`;}
}
function setPhase(index){if(!moduleId||!ready)return;clearPart();animation=null;phase=index;selected=null;$('isolate').checked=false;$('explode').disabled=false;$('isolate').disabled=false;$('explode').value=index<0?70:65;renderPhase();renderSelected();updateMeshes();rebuildLabels();fitVisible();}
function renderPhase(){
 if(!moduleId)return;const l=lessons[moduleId],s=l.stages[phase];document.querySelectorAll('#stageList button').forEach(b=>{const on=Number(b.dataset.phase)===phase;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 $('phaseTitle').textContent=s?`${phase+1} / ${l.stages.length} · ${s.title}`:'先认件，再逐步试装';$('phaseAction').textContent=s?s.action:'图中每个编号都是独立零件。点击编号或清单定位；选“小步 1”开始，后续零件会逐步加入，已加入的零件保持归位。';
 $('checkpoint').textContent=s?s.check:'绿色是当前加入的件，灰色是已归位件，橙色是选中的件。展开只为看清组成，不代表实际插入路径。';$('phaseParts').textContent=s?'本小步：'+members().filter(n=>n.userData.phase===phase).map(n=>`${number(n)} ${n.userData.component.label}`).join('、'):'';
 $('prev').disabled=phase<0;$('next').disabled=phase===l.stages.length-1;$('next').textContent=phase<0?'从第 1 小步开始 →':'下一小步 →';$('stageProgress').textContent=phase<0?`${l.stages.length} 个内部小步`:`已显示 ${members().filter(n=>n.userData.phase<=phase).length} / ${members().length} 件`;
}
function updateMeshes(){
 const amount=Number($('explode').value)/100;if(moduleId===0){updateAssembly(amount);return;}$('explodeValue').textContent=`${Math.round(amount*100)}%`;
 for(const n of nodes){const c=n.userData.component;n.visible=!partMesh&&(!moduleId||n.userData.group===moduleId&&(phase<0||n.userData.phase<=phase));if(moduleId&&selected&&$('isolate').checked)n.visible=n.visible&&n===selected;const moving=moduleId&&(phase<0||n.userData.phase===phase);n.position.copy(n.userData.offset).multiplyScalar(moving?amount:0);n.material=n===selected?materials.selected:$('transparentShell').checked&&c.key.includes('shell')?materials.shell:phase>=0&&moving?materials.current:c.kind==='打印件'?materials.print:materials.hardware;}
}
function rebuildLabels(){
 $('modelLabels').replaceChildren();labels=[];if(partMesh)return;if(!moduleId){assemblyLabels();return;}
 for(const n of members()){const c=n.userData.component;const b=text('button',c.servoId?`ID ${c.servoId}`:`${number(n)} ${c.label}`,c.servoId?'model-label servo-label':'model-label');b.title=c.label;b.onclick=()=>selectComponent(n);b.setAttribute('aria-label',`定位 ${number(n)} ${n.userData.component.label}`);$('modelLabels').append(b);labels.push({node:n,button:b,isServo:!!c.servoId});}
}
function placeLabels(){
 const placed=[],width=host.clientWidth,height=host.clientHeight;
 for(const item of labels){const {node,button,anchor,isServo}=item,p=(anchor||node.userData.center).clone().add(node.position).project(camera);
 const visible=node.visible&&(isServo?$('servoIds').checked:$('labels').checked)&&(isServo||moduleId===0||Number($('explode').value)>12||node===selected)&&p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;button.hidden=!visible;
 if(item.line)item.line.hidden=true;
 if(!visible)continue;
 const ax=(p.x+1)*width/2,ay=(1-p.y)*height/2;
 let x=Math.max(44,Math.min(width-44,ax)),y=Math.max(110,Math.min(height-32,ay));
 if(isServo){
 const w=button.offsetWidth/2+5,h=button.offsetHeight/2+4;
 const free=(cx,cy)=>placed.every(r=>Math.abs(cx-r.x)>=w+r.w||Math.abs(cy-r.y)>=h+r.h);
 if(!free(x,y)){
 let found=false;
 for(let radius=28;radius<Math.max(width,height)&&!found;radius+=14){for(let i=0;i<16;i++){const angle=i*Math.PI/8,cx=Math.max(w,Math.min(width-w,x+Math.cos(angle)*radius)),cy=Math.max(110,Math.min(height-32,y+Math.sin(angle)*radius));if(free(cx,cy)){x=cx;y=cy;found=true;break;}}}
 }
 placed.push({x,y,w,h});
 if(!item.line){item.line=text('span','','servo-leader');$('modelLabels').prepend(item.line);}
 const dx=x-ax,dy=y-ay;item.line.hidden=false;item.line.style.cssText=`left:${ax}px;top:${ay}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)`;
 }
 button.style.left=`${x}px`;button.style.top=`${y}px`;button.classList.toggle('selected',node===selected);
 }
}
function fitBox(box,view='iso'){
 if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,.000001),distance=radius*2.2/Math.min(camera.aspect,1),dirs={iso:[1.9,-.85,.6],front:[1,0,0],side:[0,-1,0],top:[0,-.001,1]};
 controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...dirs[view]).normalize().multiplyScalar(distance));camera.near=Math.max(.000001,radius/1000);camera.far=radius*50;camera.updateProjectionMatrix();controls.minDistance=radius*.08;controls.maxDistance=radius*15;controls.update();
}
function fitVisible(view='iso'){const box=new THREE.Box3();if(partMesh)box.setFromObject(partMesh);else for(const n of nodes)if(n.visible)box.union(n.geometry.boundingBox.clone().translate(n.position));fitBox(box,view);}
function createComponents(g,geometry){
 const source=geometry.getAttribute('position').array,allBox=new THREE.Box3(),list=[];
 for(let i=0;i<g.components.length;i++){const c=g.components[i],part=new THREE.BufferGeometry();part.setAttribute('position',new THREE.BufferAttribute(source.slice(c.start*3,(c.start+c.count)*3),3));part.computeVertexNormals();part.computeBoundingBox();const n=new THREE.Mesh(part,materials.print);
 const match=lessons[g.id].stages.map((s,i)=>s.keys.some(k=>{const [key,num]=k.split(':');return key===c.key&&(!num||Number(num)===c.occurrence);})?i:-1).filter(i=>i>=0);if(match.length!==1)throw new Error(`零件工序覆盖错误 ${g.id}/${c.key}/${c.occurrence}`);
 n.userData={group:g.id,index:i,uid:`${g.id}-${i}`,component:c,phase:match[0],center:part.boundingBox.getCenter(new THREE.Vector3()),offset:new THREE.Vector3()};allBox.union(part.boundingBox);list.push(n);nodes.push(n);scene.add(n);}
 // Parts tray preserves rotations; slider=0 restores exact world coordinates.
 const center=allBox.getCenter(new THREE.Vector3()),columns=Math.ceil(Math.sqrt(list.length)),rows=Math.ceil(list.length/columns),cell=Math.max(...list.flatMap(n=>n.userData.component.size),35)*1.45;
 list.forEach((n,i)=>{const target=center.clone().add(new THREE.Vector3(0,((columns-1)/2-i%columns)*cell,((rows-1)/2-Math.floor(i/columns))*cell));n.userData.offset.copy(target.sub(n.userData.center));});geometry.dispose();
}
async function inspectPrint(p){
 if(!ready)return;const req=++requestId;$('partsDialog').close();$('status').textContent=`载入 ${p.label}…`;
 try{const geometry=await loader.loadAsync(p.file);if(req!==requestId){geometry.dispose();return;}if(partMesh){scene.remove(partMesh);partMesh.geometry.dispose();}geometry.computeVertexNormals();geometry.center();geometry.computeBoundingBox();partMesh=new THREE.Mesh(geometry,materials.current);scene.add(partMesh);nodes.forEach(n=>n.visible=false);$('sceneLabel').textContent=`${p.label} · 原始打印 STL · 全机 ×${p.quantity}`;$('status').textContent='';$('explode').disabled=true;$('isolate').disabled=true;$('modelLabels').replaceChildren();labels=[];fitVisible();$('printReturn').hidden=false;}
 catch(e){$('status').textContent='零件加载失败，请重试。';console.error(e);}
}

function setAssembly(index){
 if(!ready)return;clearPart();$('homeDetail').hidden=true;animation=null;moduleId=0;phase=-1;selected=null;assemblyIndex=Math.max(0,Math.min(15,index));
 const a=assemblySteps[assemblyIndex],complete=assemblyIndex===15;
 $('instructions').scrollTop=0;$('moduleDetail').hidden=true;$('overviewDetail').hidden=false;
 $('greenLegend').textContent='待装模块';$('orangeLegend').textContent='连接对象';$('explodeLabel').textContent='模块间距';$('collapse').textContent=complete?'整机合拢':'本模块归位';$('explode').value=a.parent?100:0;$('explode').disabled=!complete&&!a.parent;$('isolate').checked=false;$('isolate').disabled=true;$('labels').disabled=false;
 document.querySelectorAll('nav button').forEach(b=>{const on=Number(b.dataset.module)===0;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'step':'false');});
 $('stepCounter').textContent=complete?'机械总装演示完成':`总装 ${assemblyIndex+1} / 15`;
 $('stepTitle').textContent=complete?'整机合体完成':'模块合体组装';$('stepDescription').textContent='躯干 → 左腿 → 颈头 → 右腿。每次接入一个已组装完成的模块。';
 $('sceneLabel').textContent=complete?'15 个模块全部归位':`${String(a.id).padStart(2,'0')} · ${a.title}`;
 $('assemblyTitle').textContent=a.title;$('assemblyAction').textContent=a.action;$('assemblyCheck').textContent=a.check;
 const label=id=>data.groups.find(g=>g.id===id)?.label;
 $('assemblyConnection').textContent=complete?'15 个模块 / 70 个模型实例':a.parent?`${String(a.id).padStart(2,'0')} ${label(a.id)} → ${String(a.parent).padStart(2,'0')} ${label(a.parent)}`:'01 躯干主体 → 工作台支承基准';
 $('assemblyPrev').disabled=assemblyIndex===0;$('assemblyNext').disabled=complete;$('assemblyNext').textContent=assemblyIndex===14?'进入整机复核 →':'下一模块 →';
 $('assemblyInternal').disabled=complete;$('assemblyDock').disabled=!a.parent;
 $('assemblyStages').replaceChildren();assemblySteps.forEach((item,i)=>{const b=text('button',i===15?'整机复核':`${String(item.id).padStart(2,'0')} ${data.groups.find(g=>g.id===item.id).label}`);b.dataset.assembly=i;b.classList.toggle('active',i===assemblyIndex);b.setAttribute('aria-pressed',String(i===assemblyIndex));b.onclick=()=>setAssembly(i);$('assemblyStages').append(b);});
 updateMeshes();rebuildLabels();fitVisible();
}
function updateAssembly(amount){
 const a=assemblySteps[assemblyIndex],end=a.id||15,complete=assemblyIndex===15;
 // Accumulate each connection's spacing so every child separates from its parent.
 const offsets=new Map();if(complete)for(const step of assemblySteps.slice(0,15)){offsets.set(step.id,new THREE.Vector3(...step.offset).add(offsets.get(step.parent)||new THREE.Vector3()));}
 for(const n of nodes){const current=n.userData.group===a.id,parent=n.userData.group===a.parent,c=n.userData.component;
 n.visible=!partMesh&&n.userData.group<=end;
 if(complete)n.position.copy(offsets.get(n.userData.group)).multiplyScalar(amount);else n.position.set(...a.offset).multiplyScalar(current?amount:0);
 n.material=current?materials.current:parent?materials.selected:$('transparentShell').checked&&c.key.includes('shell')?materials.shell:c.kind==='打印件'?materials.print:materials.hardware;
 }
 $('explodeValue').textContent=`${Math.round(amount*100)}%`;
 if(complete){$('sceneLabel').textContent=amount>0?`整机模块展开 · ${Math.round(amount*100)}%`:'15 个模块全部归位';$('assemblyAction').textContent=amount>0?'拖动模块间距查看各模块的连接关系；每个模块内部保持装配完整。调回 0% 或点击“整机合拢”恢复完整整机。':assemblySteps[15].action;}
 $('assemblyProgress').textContent=complete?(amount>0?`15 / 15 模块已显示 · 展开 ${Math.round(amount*100)}%`:'15 / 15 模块已归位 · 整机机械复核'):amount>0?`${end-1} / 15 模块已归位 · 第 ${end} 模块等待归位`:`${end} / 15 模块已归位`;
}
function assemblyLabels(){
 for(const n of nodes.filter(n=>n.userData.component.servoId)){const c=n.userData.component,b=text('button',`ID ${c.servoId}`,'model-label servo-label');b.title=c.label;b.setAttribute('aria-label',`定位舵机 ID ${c.servoId} ${c.servoPart} ${c.servoAction}`);b.onclick=()=>focusServo(c.servoId);$('modelLabels').append(b);labels.push({node:n,button:b,isServo:true});}
 const a=assemblySteps[assemblyIndex];for(const id of [a.parent,a.id].filter(Boolean)){
 const members=nodes.filter(n=>n.userData.group===id),node=members[0],box=new THREE.Box3();for(const m of members)box.union(m.geometry.boundingBox);
 const b=text('button',`模块 ${String(id).padStart(2,'0')} ${data.groups.find(g=>g.id===id).label}${id===a.id?' · 本步':' · 连接对象'}`,'model-label');
 b.onclick=()=>setModule(id);b.setAttribute('aria-label',`查看模块 ${id} 内部组装`);$('modelLabels').append(b);labels.push({node,button:b,anchor:box.getCenter(new THREE.Vector3())});
 }
}
function dockAssembly(){
 const a=assemblySteps[assemblyIndex];if(!ready||moduleId!==0||partMesh)return;
 if(assemblyIndex===15){animation={start:performance.now(),from:Number($('explode').value)};return;}
 if(!a.parent)return;
 if(Number($('explode').value)===0){$('explode').value=100;updateMeshes();fitVisible();}
 animation={start:performance.now(),from:Number($('explode').value)};
}
function beginAssembly(){setModule(1);setPhase(0);}
function showHome(){if(!ready)return;setAssembly(15);$('overviewDetail').hidden=true;$('homeDetail').hidden=false;$('stepCounter').textContent='整机预览 / 15 个模块';$('stepTitle').textContent='完整整机展示';$('stepDescription').textContent='先看整体，再从 01 开始逐件组装。';document.querySelectorAll('nav button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-current','false');});}
$('assemblyEntry').onclick=beginAssembly;$('startAssembly').onclick=beginAssembly;$('homeView').onclick=showHome;
$('nextModule').onclick=()=>{if(moduleId<15){setModule(moduleId+1);setPhase(0);}else setAssembly(0);};
$('assemblyPrev').onclick=()=>setAssembly(assemblyIndex-1);$('assemblyNext').onclick=()=>setAssembly(assemblyIndex+1);
$('assemblyDock').onclick=dockAssembly;$('assemblyRestart').onclick=()=>setAssembly(0);$('assemblyComplete').onclick=()=>setAssembly(15);
$('assemblyInternal').onclick=()=>{const id=assemblySteps[assemblyIndex].id;if(id)setModule(id);};


function focusServo(id){
 if(!ready)return;const n=nodes.find(n=>n.userData.component.servoId===id);if(!n)return;
 $('servoDialog').close();setModule(n.userData.group);$('servoIds').checked=true;selectComponent(n);
}
function renderServoTable(){
 $('servoTable').replaceChildren();for(const servo of data.servos){const tr=document.createElement('tr'),td=document.createElement('td'),b=text('button',`ID ${servo.id}`);b.onclick=()=>focusServo(servo.id);td.append(b);tr.append(td,text('td',servo.part),text('td',servo.action),text('td',`${String(servo.group).padStart(2,'0')} ${data.groups.find(g=>g.id===servo.group).label}`));$('servoTable').append(tr);}
}
$('servoButton').onclick=()=>$('servoDialog').showModal();$('closeServos').onclick=()=>$('servoDialog').close();
$('allServoIds').onclick=()=>{if(!ready)return;$('servoDialog').close();$('servoIds').checked=true;setAssembly(15);};

function renderInventory(){
 const entries=data.groups.flatMap(g=>g.components.map(c=>({g,c}))),prints=entries.filter(e=>e.c.kind==='打印件');
 $('inventorySummary').textContent=`15 个模块 · ${entries.length} 个模型零件实例（打印件 ${prints.length}、舵机 ${data.servos.length}、其他 ${entries.length-prints.length-data.servos.length}）· 打印备料 ${data.parts.length} 种 / ${data.parts.reduce((sum,p)=>sum+p.quantity,0)} 件`;
 const locations=list=>[...new Set(list.map(e=>`${String(e.g.id).padStart(2,'0')} ${e.g.label}`))].join('、');
 const row=(target,values)=>{const tr=document.createElement('tr');values.forEach(v=>tr.append(text('td',String(v))));$(target).append(tr);};
 $('inventoryPrints').replaceChildren();for(const p of data.parts){const list=entries.filter(e=>e.c.key===p.key);row('inventoryPrints',[p.label,p.quantity,list.length,locations(list)||'当前装配模型未包含']);}
 const hardware=new Map();for(const e of entries.filter(e=>e.c.kind!=='打印件')){if(!hardware.has(e.c.key))hardware.set(e.c.key,[]);hardware.get(e.c.key).push(e);}
 $('inventoryHardware').replaceChildren();for(const [key,list] of hardware){row('inventoryHardware',[key==='xl330'?'XL330 舵机':list[0].c.label,list.length,key==='xl330'?'ID '+list.map(e=>e.c.servoId).sort((a,b)=>a-b).join('、'):locations(list)]);}
 $('inventoryModules').replaceChildren();for(const g of data.groups){const detail=document.createElement('details');detail.className='inventory-module';detail.append(text('summary',`${String(g.id).padStart(2,'0')} ${g.label} · ${g.components.length} 件`));const list=document.createElement('div');for(const n of nodes.filter(n=>n.userData.group===g.id)){const c=n.userData.component,b=text('button',`${number(n)} · ${c.label} · ×1 · ${c.kind}`);b.onclick=()=>{$('inventoryDialog').close();setModule(g.id);selectComponent(n);};list.append(b);}detail.append(list);$('inventoryModules').append(detail);}
}
$('inventoryButton').onclick=()=>$('inventoryDialog').showModal();$('closeInventory').onclick=()=>$('inventoryDialog').close();

async function start(){try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,10000);camera.up.set(0,0,1);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;scene.add(new THREE.HemisphereLight(0xffffff,0x6c8090,2.3));
 for(const [pos,intensity] of [[[300,-400,500],2.5],[[-300,200,150],1.2]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.set(...pos);scene.add(l);}
 const resize=()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(host);resize();
 renderer.setAnimationLoop(()=>{if(animation){const t=Math.min(1,(performance.now()-animation.start)/650);$('explode').value=animation.from*(1-t)*(1-t);updateMeshes();if(t===1){animation=null;fitVisible();}}controls.update();renderer.render(scene,camera);placeLabels();});
 let down;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!ready||partMesh||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=raycaster.intersectObjects(nodes.filter(n=>n.visible))[0];if(hit){if(!moduleId)setModule(hit.object.userData.group);else selectComponent(hit.object);}});
 const response=await fetch('data.json', {cache:'no-store'});if(!response.ok)throw new Error('数据加载失败');data=await response.json();let done=0;await Promise.all(data.groups.map(async g=>{const geometry=await loader.loadAsync(g.file);createComponents(g,geometry);$('status').textContent=`拆解模型 ${++done} / 15`;}));nodes.sort((a,b)=>a.userData.group-b.userData.group||a.userData.index-b.userData.index);
 for(const g of [...data.groups,{id:0,label:'最后 · 合体组装'}]){const b=document.createElement('button');b.dataset.module=g.id;b.append(text('b',g.id===0?'终':String(g.id).padStart(2,'0')),text('span',g.label));if(g.components)b.append(text('small',`${g.components.length} 件`));b.onclick=()=>g.id===0?setAssembly(0):setModule(g.id);$('stepList').append(b);}
 for(const p of data.parts){const b=document.createElement('button');b.append(text('span',p.label),text('small',`×${p.quantity}`));b.onclick=()=>inspectPrint(p);$('partsList').append(b);}
 renderServoTable();renderInventory();$('totalPieces').textContent=`已拆出 ${nodes.length} 个独立模型实例`;ready=true;$('status').textContent='';showHome();
 }catch(e){$('status').textContent='模型载入失败，请刷新；若直接打开 HTML，请使用启动教程.cmd。';console.error(e);}}
$('prev').onclick=()=>setPhase(Math.max(-1,phase-1));$('next').onclick=()=>{if(moduleId)setPhase(Math.min(lessons[moduleId].stages.length-1,phase+1));};$('overview').onclick=()=>setModule(0);$('printReturn').onclick=()=>setModule(moduleId);
$('explode').oninput=()=>{animation=null;updateMeshes();if(moduleId===0&&assemblyIndex===15)fitVisible();};$('explode').onchange=()=>fitVisible();$('transparentShell').onchange=updateMeshes;$('collapse').onclick=()=>{if(ready&&!partMesh){if(moduleId===0)dockAssembly();else animation={start:performance.now(),from:Number($('explode').value)};}};
$('isolate').onchange=()=>{if(!selected&&moduleId){selected=members().find(n=>n.visible)||members()[0];renderSelected();}updateMeshes();rebuildLabels();fitVisible();};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(ready)fitVisible(b.dataset.view);});$('partsButton').onclick=()=>$('partsDialog').showModal();$('closeParts').onclick=()=>$('partsDialog').close();start();
