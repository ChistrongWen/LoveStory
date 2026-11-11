import * as THREE from 'three';
import { islandHeight } from './islandHeight.js';

// Original terrain and water are untouched. All placements sample its height.
export function createLoveIsland({ patchMaterial, reflectionLayer = 1 }) {
  const group = new THREE.Group();
  group.name = 'Fan & Chistrong — 2023.8.22';
  const bearing = 120 * Math.PI / 180;
  let radius = 180;
  while (radius < 500 && islandHeight(Math.cos(bearing) * radius, Math.sin(bearing) * radius) > 6) radius += 1;
  const center = new THREE.Vector3(Math.cos(bearing) * radius, 0, Math.sin(bearing) * radius);
  const angle = Math.atan2(center.x, center.z);
  const world = (x, z) => new THREE.Vector3(center.x + Math.cos(angle)*x + Math.sin(angle)*z, 0, center.z - Math.sin(angle)*x + Math.cos(angle)*z);
  const materials = new Map();
  function mat(color) {
    if (!materials.has(color)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0 });
      patchMaterial(m); materials.set(color,m);
    }
    return materials.get(color);
  }
  function mesh(parent, geo, color, x=0,y=0,z=0) {
    const o=new THREE.Mesh(geo, typeof color==='string'?mat(color):color);
    o.position.set(x,y,z); o.castShadow=o.receiveShadow=true; o.layers.enable(reflectionLayer); parent.add(o); return o;
  }
  const box=(p,w,h,d,c,x=0,y=0,z=0)=>mesh(p,new THREE.BoxGeometry(w,h,d),c,x,y,z);
  const ball=(p,r,c,x=0,y=0,z=0)=>mesh(p,new THREE.SphereGeometry(r,12,8),c,x,y,z);
  function beam(p,a,b,r,c) {
    const av=new THREE.Vector3(...a), bv=new THREE.Vector3(...b), delta=bv.clone().sub(av);
    const o=mesh(p,new THREE.CylinderGeometry(r,r,delta.length(),8),c);
    o.position.copy(av.add(bv).multiplyScalar(.5)); o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return o;
  }
  function site(name,x,z,w,d) {
    const p=world(x,z);
    let y=islandHeight(p.x,p.z);
    for(const dx of [-w/2,0,w/2])for(const dz of [-d/2,0,d/2]){
      const s=world(x+dx,z+dz);y=Math.max(y,islandHeight(s.x,s.z));
    }
    const g=new THREE.Group();g.name=name;g.position.set(p.x,y+.25,p.z);g.rotation.y=angle;group.add(g);
    if(w>0) {
      box(g,w,.5,d,'#d9c6a2',0,0,0);
      for(const dx of [-w/2+.5,w/2-.5])for(const dz of [-d/2+.5,d/2-.5]){
        const s=world(x+dx,z+dz),height=y-islandHeight(s.x,s.z)+.5;
        box(g,.65,height,.65,'#9a7855',dx,-height/2,dz);
      }
    }
    return g;
  }
  function textTexture(lines,background=null,color='#fff2d8') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const c=canvas.getContext('2d');
    if(background){c.fillStyle=background;c.fillRect(0,0,1024,512);}
    c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';
    lines.forEach((line,i)=>{c.font=(i===0?'bold 76px':'48px')+' Georgia, "Songti SC", serif';c.fillText(line,512,512*(i+1)/(lines.length+1),960);});
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;
    return t;
  }
  function plaque(p,lines,w,h,x,y,z) {
    box(p,w+.25,h+.25,.24,'#71523d',x,y,z);
    const m=new THREE.MeshStandardMaterial({map:textTexture(lines,'#315c59'),roughness:.9});
    patchMaterial(m);mesh(p,new THREE.PlaneGeometry(w,h),m,x,y,z+.13);
  }

  // Seaside cottage, pitched roof, porch and warm windows.
  const home=site('海边小屋',-12,-18,25,20);
  box(home,18,8,13,'#f4e4c7',0,4.25,-2);
  const roofShape=new THREE.Shape();roofShape.moveTo(-10,0);roofShape.lineTo(0,5);roofShape.lineTo(10,0);roofShape.closePath();
  const roof=mesh(home,new THREE.ExtrudeGeometry(roofShape,{depth:15,bevelEnabled:false}),'#b96354',0,8.25,-9.5);
  box(home,3,5,.25,'#537c79',0,2.75,4.65);
  for(const x of [-5.8,5.8]) {
    box(home,3.3,3,.3,'#fff3d7',x,4.7,4.7);
    box(home,.12,3.1,.35,'#735a43',x,4.7,4.9);
    box(home,3.4,.12,.35,'#735a43',x,4.7,4.9);
  }
  for(const x of [-10,10])beam(home,[x,.25,8],[x,7.5,8],.2,'#efe1c4');
  box(home,23,.35,5,'#bd7660',0,7.5,7);
  plaque(home,['Fan & Chistrong','OUR LITTLE HOME'],9,2.5,0,6,4.9);
  for(let i=0;i<3;i++)box(home,7,.25,1,'#e5cfad',0,-.12-i*.25,10.5+i);

  // Lighthouse on its own raised footing.
  const light=site('灯塔',43,-28,13,13);
  mesh(light,new THREE.CylinderGeometry(3,4.3,24,24),'#f4ead5',0,12.25,0);
  for(const y of [7,16])mesh(light,new THREE.CylinderGeometry(4.35-y*.055,4.6-y*.055,2.5,24),'#b96354',0,y,0);
  mesh(light,new THREE.CylinderGeometry(5,5,.6,24),'#537773',0,24.5,0);
  mesh(light,new THREE.CylinderGeometry(2.7,2.7,4,16),'#e6c57c',0,27,0);
  mesh(light,new THREE.ConeGeometry(4.5,4,24),'#b96354',0,31,0);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(light,[Math.cos(a)*4.5,25,Math.sin(a)*4.5],[Math.cos(a)*4.5,27,Math.sin(a)*4.5],.1,'#315c59');}
  plaque(light,['LOVE','2023.8.22'],3.5,3,0,4,4.1);

  // Trees: shared materials and simple crowns keep the scene light.
  [[-46,-28],[-39,-49],[-17,-46],[8,-48],[31,-51],[56,-48],[-48,2],[52,0]].forEach(([x,z],i)=>{
    const tree=site('海岛树木',x,z,0,0),h=8+i%3;
    beam(tree,[0,0,0],[.8,h,0],.65,'#8b6745');
    for(let j=0;j<4;j++){const a=j*Math.PI/2;const crown=ball(tree,3.6,'#577451',Math.cos(a)*2,h+Math.sin(j)*.6,Math.sin(a)*2);crown.scale.y=.8;}
    ball(tree,3.3,'#728c5a',0,h+2.4,0);
  });

  // Flower garden with individually grounded, instanced flowers.
  const flowerGeo=new THREE.SphereGeometry(.43,6,4);
  const flowerColors=['#e7a1aa','#f2cf79','#f1e9d8'];
  flowerColors.forEach((color,k)=>{
    const blooms=new THREE.InstancedMesh(flowerGeo,mat(color),60),m=new THREE.Matrix4();
    blooms.name='花园';blooms.layers.enable(reflectionLayer);
    for(let i=0;i<60;i++){
      const a=i*2.39996+k*.6,r=2+Math.sqrt(i/60)*8;
      const p=world(23+Math.cos(a)*r,-8+Math.sin(a)*r*.7);
      m.makeTranslation(p.x,islandHeight(p.x,p.z)+.48+(i%3)*.12,p.z);blooms.setMatrixAt(i,m);
    }
    blooms.computeBoundingSphere();group.add(blooms);
  });

  // Wooden swing.
  const swing=site('双人秋千',-37,12,11,8);
  for(const x of [-4,4]){
    beam(swing,[x,0,-3],[x,8,0],.25,'#a27a50');
    beam(swing,[x,0,3],[x,8,0],.25,'#a27a50');
  }
  beam(swing,[-4.7,8,0],[4.7,8,0],.3,'#a27a50');
  for(const x of [-2.5,2.5])beam(swing,[x,7.9,0],[x,2,0],.055,'#efe2be');
  box(swing,6,.3,1.8,'#bd7660',0,2,0);
  box(swing,6,1.5,.2,'#bd7660',0,2.8,-.8);

  // Sculpted heart and anniversary monument.
  const monument=site('爱心纪念雕塑',6,10,12,9);
  mesh(monument,new THREE.CylinderGeometry(3.7,4.3,1,24),'#f0dfbf',0,.75,0);
  const shape=new THREE.Shape();
  shape.moveTo(0,-1);shape.bezierCurveTo(-3,1,-3,3,-1.5,3);shape.bezierCurveTo(-.5,3,0,2,0,2);
  shape.bezierCurveTo(0,2,.5,3,1.5,3);shape.bezierCurveTo(3,3,3,1,0,-1);
  const heart=mesh(monument,new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.15,bevelThickness:.15,curveSegments:16}),'#d77b82',0,4,-.4);
  heart.scale.setScalar(1.6);
  plaque(monument,['Fan & Chistrong','2023.8.22'],10,3,0,2.3,3.6);

  // Stylised couple, standing together and holding hands.
  const couple=site('Fan & Chistrong 情侣人物',-8,17,0,0);
  function person(x,color,longHair) {
    const g=new THREE.Group();g.position.x=x;couple.add(g);
    for(const dx of [-.27,.27]){
      beam(g,[dx,.18,0],[dx,1.4,0],.16,'#48616a');
      box(g,.4,.25,.7,'#f4e9d7',dx,.15,.15);
    }
    mesh(g,longHair?new THREE.CylinderGeometry(.4,.72,1.35,12):new THREE.CylinderGeometry(.55,.5,1.35,12),color,0,1.9,0);
    ball(g,.46,'#e5b995',0,3,0);
    const hair=ball(g,.49,'#49362f',0,3.16,-.08);hair.scale.y=longHair?1.2:.7;
    for(const dx of [-.16,.16])ball(g,.045,'#49362f',dx,3,.43);
    beam(g,[-.48,2.3,0],[-.9,1.65,.15],.13,'#e5b995');
    beam(g,[.48,2.3,0],[.9,1.65,.15],.13,'#e5b995');
  }
  person(-.9,'#e5a6a1',true);person(.9,'#e9d8b7',false);

  // Transparent lettering follows the existing sand instead of floating on a board.
  const sandPoint=world(-5,28);
  const geo=new THREE.PlaneGeometry(29,12,58,24);geo.rotateX(-Math.PI/2);geo.rotateY(angle);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i)+sandPoint.x,z=pos.getZ(i)+sandPoint.z;pos.setXYZ(i,x,islandHeight(x,z)+.09,z);}
  geo.computeVertexNormals();
  const sandMat=new THREE.MeshStandardMaterial({map:textTexture(['Fan & Chistrong','2023.8.22','往后余生，与你一起'],null,'#73553b'),transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
  patchMaterial(sandMat);mesh(group,geo,sandMat).castShadow=false;

  const target=world(0,-5);target.y=islandHeight(target.x,target.z)+7;
  const camera=world(18,100);camera.y=target.y+48;
  const close=world(-2,42);close.y=islandHeight(close.x,close.z)+13;
  const coupleTarget=couple.position.clone().add(new THREE.Vector3(0,2,0));
  return {group,camera,target,close,coupleTarget};
}
