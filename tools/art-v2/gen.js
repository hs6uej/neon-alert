// Draws the V2 pictures (public/sets/v2) with Google Gemini, 3 at a time, as raw pictures on a magenta background.
// usage: GEMINI_API_KEY=... node gen.js gemini-3.1-flash-image <outDir> <id...>   (optional env STYLEREF=file.png = style reference)
// then:  node process.js <outDir> <outDir>/out  -> cuts the background, crops, downsizes; copy the result to public/sets/v2/
const https=require('https'),fs=require('fs'); const { prompt, ITEMS } = require('./concept.js');
const [model,outDir,...ids]=process.argv.slice(2); fs.mkdirSync(outDir,{recursive:true});
const key=process.env.GEMINI_API_KEY, styleRef=process.env.STYLEREF;
function gen(id){return new Promise((res,rej)=>{
  const parts=[{text:prompt(id,!!styleRef)}]; if(styleRef) parts.push({inline_data:{mime_type:'image/png',data:fs.readFileSync(styleRef).toString('base64')}});
  const body=JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:['TEXT','IMAGE']}});
  const r=https.request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'x-goog-api-key':key}},(s)=>{const c=[];s.on('data',x=>c.push(x));s.on('end',()=>{let j;try{j=JSON.parse(Buffer.concat(c))}catch(e){return rej(new Error('bad json'))}
    if(j.error)return rej(new Error(String(j.error.message).replace(/AIza\S+/g,'<key>').slice(0,160)));
    const p=((j.candidates||[])[0]?.content?.parts||[]).find(p=>p.inlineData);if(!p)return rej(new Error('no image: '+JSON.stringify(j.candidates?.[0]?.finishReason||j.promptFeedback)));
    fs.writeFileSync(`${outDir}/${id}.png`,Buffer.from(p.inlineData.data,'base64'));res(j.usageMetadata&&j.usageMetadata.candidatesTokenCount);});});
  r.setTimeout(150000,()=>r.destroy(new Error('timeout')));r.on('error',rej);r.end(body);});}
(async()=>{ const q=[...ids]; const worker=async()=>{ while(q.length){const id=q.shift(); for(let a=1;a<=3;a++){ try{const t=await gen(id);console.log('ok',id,t);break;}catch(e){console.log('retry',id,a,e.message); if(a===3)console.log('FAILED',id);} } } };
  await Promise.all([worker(),worker(),worker()]); })();
