// raw magenta-background pictures -> trimmed, transparent, downscaled PNGs + contact sheets (dev tool; needs: npm i --no-save @napi-rs/canvas)
// usage: node process.js <rawDir> <outDir> [tolerance=70] [id,id,...]
const ROOT=require('path').join(__dirname,'..','..');
const { createCanvas, loadImage } = require('@napi-rs/canvas'); const fs=require('fs');
require(ROOT+'/public/js/artstudio.js'); const GA=globalThis.GA; const { ITEMS } = require('./concept.js');
const [rawDir='raw', outDir='out', tol='70'] = process.argv.slice(2); fs.mkdirSync(outDir,{recursive:true});
const ids = process.argv[5] ? process.argv[5].split(',') : Object.keys(ITEMS);
(async()=>{
  const info={};
  for (const id of ids) {
    if(!fs.existsSync(`${rawDir}/${id}.png`)) continue;
    const im=await loadImage(`${rawDir}/${id}.png`), w=im.width, h=im.height;
    const c=createCanvas(w,h), x=c.getContext('2d'); x.drawImage(im,0,0);
    const d=x.getImageData(0,0,w,h); GA.cutBackground(d.data,w,h,+tol,false);
    // the art direction has NO purple/magenta: anything in that hue band is background bleeding into a glow -> neon cyan
    const q=d.data; for(let i=0;i<q.length;i+=4){ if(q[i+3]===0) continue; const r=q[i]/255,g=q[i+1]/255,b=q[i+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),df=mx-mn; if(df===0||mx<0.25) continue; const s2=df/mx; if(s2<0.3) continue;
      let hh=mx===r?((g-b)/df)%6:mx===g?(b-r)/df+2:(r-g)/df+4; hh=(hh*60+360)%360; if(hh<262||hh>348) continue;
      const nh=186/60, c=mx*s2, xx=c*(1-Math.abs(nh%2-1)), m2=mx-c; // hue 186 = between cyan and sky: (0,xx.. ) -> h in [3,4): r=0,g=c... use sector 3
      const rr=0+m2, gg=c*(1-Math.abs((nh%2)-1))*0+ (nh<4?c:xx)*1+m2, bb=(nh<4?xx:c)+m2; q[i]=Math.round(rr*255); q[i+1]=Math.round(Math.min(1,gg)*255); q[i+2]=Math.round(Math.min(1,bb)*255); }
    x.putImageData(d,0,0);
    const b=GA.alphaBounds(d.data,w,h,96); const m=Math.round(0.03*Math.max(b.w,b.h));
    const x0=Math.max(0,b.x-m),y0=Math.max(0,b.y-m),x1=Math.min(w,b.x+b.w+m),y1=Math.min(h,b.y+b.h+m);
    const cw=x1-x0,ch=y1-y0, side=ITEMS[id][0]==='BUILDING'?448:320, k=Math.min(1,side/Math.max(cw,ch));
    let cur=createCanvas(cw,ch); cur.getContext('2d').drawImage(c,x0,y0,cw,ch,0,0,cw,ch);
    const tw=Math.round(cw*k), th=Math.round(ch*k);
    while(cur.width>tw*2){const hf=createCanvas(Math.ceil(cur.width/2),Math.ceil(cur.height/2)),hx=hf.getContext('2d');hx.imageSmoothingQuality='high';hx.drawImage(cur,0,0,hf.width,hf.height);cur=hf;}
    const o=createCanvas(tw,th),ox=o.getContext('2d');ox.imageSmoothingQuality='high';ox.drawImage(cur,0,0,tw,th);
    const buf=o.toBuffer('image/png'); fs.writeFileSync(`${outDir}/${id}.png`,buf); info[id]={w:tw,h:th,kb:Math.round(buf.length/1024),src:w+'x'+h};
  }
  console.log(JSON.stringify(info));
  // contact sheets
  const draw=async(list,file)=>{const cols=4,cw=330,chh=290,rows=Math.ceil(list.length/cols);const s=createCanvas(cols*cw,rows*chh),sx=s.getContext('2d');
    for(let i=0;i<list.length;i++){const id=list[i];const cx=(i%cols)*cw,cy=Math.floor(i/cols)*chh;
      for(let yy=0;yy<chh;yy+=20)for(let xx=0;xx<cw;xx+=20){sx.fillStyle=((xx+yy)/20)&1?'#1a2536':'#131c2b';sx.fillRect(cx+xx,cy+yy,20,20);}
      if(!fs.existsSync(`${outDir}/${id}.png`))continue; const im=await loadImage(`${outDir}/${id}.png`);const k=Math.min(300/im.width,250/im.height);
      sx.drawImage(im,cx+(cw-im.width*k)/2,cy+(chh-20-im.height*k)/2,im.width*k,im.height*k); sx.fillStyle='#9fb0c8';sx.font='14px sans-serif';sx.fillText(id,cx+8,cy+chh-6);}
    fs.writeFileSync(file,s.toBuffer('image/png'));};
  await draw(ids.filter(i=>ITEMS[i][0]==='BUILDING'),'sheet_buildings.png'); await draw(ids.filter(i=>ITEMS[i][0]!=='BUILDING'),'sheet_units.png');
})();
