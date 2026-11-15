// 실행: node tests/parse.test.js  (문서 HTML → 서버 표 추출 → 화면 파서까지 한 번에 확인)
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
const td=t=>`<td class="c8" colspan="1" rowspan="1">${t.map(x=>`<p class="c2"><span class="c0">${x}</span></p>`).join('')||'<p class="c2 c9"><span class="c0"></span></p>'}</td>`;
const tr=(...c)=>`<tr class="c3">${c.map(td).join('')}</tr>`;
const html=`<html><head><style>.c0{color:#000}</style></head><body><h1>테이블 1</h1><p>✍️ 안내 &amp; 설명</p><table class="c12"><tbody>`+
 tr(['① 이용 경험 나누기'],['예시 (이렇게 쓰면 돼요)'],['우리 테이블 답 ✍️'])+
 tr(['좋았던 점'],['아침마다 강변을 걸으면 물소리가 좋아요'],['산책로가 넓어요','밤에도 &quot;좋아요&quot; &#39;진짜&#39;'])+
 tr(['불편한 점'],['예시'],[])+`</tbody></table><table><tbody>`+
 tr(['④ 과제 2 실행방법'],['x'],['y'])+tr(['우리의 제안'],[],['공원&nbsp;이웃 &lt;모임&gt;'])+`</tbody></table></body></html>`;
const rows=JSON.parse(JSON.stringify(ctx.docRows_(html)));
console.log(JSON.stringify(rows));
assert.deepStrictEqual(rows[1][2],['산책로가 넓어요','밤에도 "좋아요" \'진짜\'']);
assert.deepStrictEqual(rows[2][2],[]);
assert.deepStrictEqual(rows[4][2],['공원 이웃 <모임>']);
// 브라우저 파서와 연결
global.window={addEventListener(){}};global.location={search:'?demo'};global.localStorage={getItem(){return null},setItem(){},removeItem(){}};
require('../assets/app.js');
const p=window.Agora.parseDoc(rows);
assert.deepStrictEqual(p.map(x=>x.cell+':'+x.text),['good0:산책로가 넓어요','good0:밤에도 "좋아요" \'진짜\'','prop1:공원 이웃 <모임>']);
console.log('ok');
