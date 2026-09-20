/* Authored at 1920 × 1080. Rendering is a pure function of time; no randomness. */
(() => {
'use strict';
const canvas=document.getElementById('film'), c=canvas.getContext('2d');
const P={yellow:'#EDC747',ink:'#292B24',paper:'#F6F3E9',orange:'#D96540',sage:'#AEC3A5',rule:'#DEDACE',muted:'#6D6E61'};
const mascot=new Image();mascot.src='/huddle-mascot.png';
const loaded=new Promise((resolve,reject)=>{mascot.onload=resolve;mascot.onerror=reject});
const clamp=x=>Math.min(1,Math.max(0,x)), ease=x=>{x=clamp(x);return x*x*(3-2*x)}, progress=(t,a,b)=>ease((t-a)/(b-a)), lerp=(a,b,p)=>a+(b-a)*p;
const font=(size,weight=500)=>`${weight} ${size}px "PingFang TC", "Noto Sans TC", sans-serif`;
function text(s,x,y,size=28,color=P.ink,weight=500){c.fillStyle=color;c.font=font(size,weight);c.fillText(s,x,y)}
function box(x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
function line(x,y,x2,y2,color=P.rule,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke()}
function circle(x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}
function bez(a,b,d,p){const q=1-p;return{x:q*q*a.x+2*q*p*b.x+p*p*d.x,y:q*q*a.y+2*q*p*b.y+p*p*d.y}}
function star(x,y,r,angle=0,color=P.orange){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4;const k=i%2?r*.23:r;c.lineTo(Math.cos(a)*k,Math.sin(a)*k)}c.closePath();c.fill();c.restore()}
const notes=[
 {x:185,y:345,r:-.13,title:'寫企劃',sub:'先完成第一版',color:'#F6E09B'},
 {x:1674,y:341,r:.13,title:'回覆郵件',sub:'記得回覆！',color:'#E9B29C'},
 {x:1631,y:608,r:-.09,title:'閱讀半小時',sub:'留一點時間給自己',color:'#C7D5B9'},
 {x:254,y:699,r:.12,title:'整理靈感',sub:'想法先別忘記',color:'#E9B29C'},
];
const extraNotes=[
 {x:355,y:315,r:.12,title:'準備簡報',sub:'整理重點',color:'#C7D5B9'},
 {x:1762,y:491,r:-.10,title:'確認清單',sub:'再檢查一次',color:'#F6E09B'},
 {x:1658,y:817,r:.10,title:'整理檔案',sub:'歸檔一下',color:'#F6E09B'},
 {x:603,y:883,r:-.08,title:'寫下回顧',sub:'今天的小進展',color:'#E9B29C'},
];
function check(x,y,on,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);c.strokeStyle=P.ink;c.lineWidth=2;c.beginPath();c.roundRect(-9,-9,18,18,4);c.stroke();if(on){c.beginPath();c.moveTo(-5,0);c.lineTo(-1,4);c.lineTo(6,-4);c.stroke()}c.restore()}
function row(i,alpha=1,complete=false){c.save();c.globalAlpha=alpha;const y=420+i*76;box(500,y,340,60,9,i===0?P.yellow:'#E9E6DB');check(526,y+30,complete);text(notes[i].title,552,y+39,25,P.ink,600);if(complete)line(552,y+31,552+100,y+31,P.ink,2);c.restore()}
function card(x,y,w,h,title,sub,color=P.orange,alpha=1){c.save();c.globalAlpha=alpha;box(x,y,w,h,8,color);text(title,x+16,y+32,24,P.ink,600);if(sub)text(sub,x+16,y+58,18,P.ink);c.restore()}
function cursor(x,y,pressed=false){c.save();c.translate(x,y);if(pressed){c.strokeStyle=P.orange;c.lineWidth=3;c.beginPath();c.arc(0,0,23,0,Math.PI*2);c.stroke()}c.fillStyle=P.ink;c.strokeStyle=P.paper;c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(3,35);c.lineTo(13,26);c.lineTo(22,43);c.lineTo(31,38);c.lineTo(22,23);c.lineTo(35,20);c.closePath();c.fill();c.stroke();c.restore()}
function ui(t){
 const panel=progress(t,5,7.2), reveal=progress(t,8.3,10);
 // Physical monitor, not a web-page card.
 c.save();c.shadowColor='rgba(41,43,36,.16)';c.shadowBlur=45;c.shadowOffsetY=26;box(431,266,1158,602,27,P.ink);c.restore();
 box(449,284,1122,558,12,P.paper);box(923,865,174,78,8,P.ink);box(815,935,390,20,10,P.ink);
 circle(1010,855,4,'#807F71');
 c.save();c.beginPath();c.roundRect(449,284,1122,558,12);c.clip();
 box(449,284,1122,65,0,'#E9E6DB');circle(475,315,5,'#B3AFA0');circle(494,315,5,'#B3AFA0');circle(513,315,5,'#B3AFA0');text(panel>.5?'Huddle':'行事曆',542,325,25,P.ink,650);text('今天',1455,325,22,P.muted);
 const calX=lerp(482,883,panel),calW=lerp(1040,638,panel);
 if(panel>0){c.save();c.globalAlpha=panel; text('待辦任務',500,388,28,P.ink,650);text(t>=10?'還有 4 件待辦':'今天想完成的事',500,794,20,P.muted);line(862,366,862,815);c.restore()}
 text('9 月 21 日　星期一',calX,388,27,P.ink,650);
 const times=['09:00','10:00','11:00','12:00','13:00'];times.forEach((s,i)=>{text(s,calX,447+i*74,18,P.muted);line(calX+66,440+i*74,calX+calW,440+i*74)});
 const eventX=calX+80;
 card(eventX,520,calW-95,64,'團隊討論','10:00 – 10:45','#C7D5B9',1-reveal*.8);
 if(t>6){for(let i=0;i<4;i++){const p=progress(t,6.15+i*.54,7.9+i*.54);if(p>=1)row(i,i===0&&t>=11.9&&t<13.8?.45:1,t>=19.3&&i===0)}}
 // Scheduled task stays visible after the drag; later it changes its time slot.
 if(t>=13.8){const move=progress(t,15.4,17.2), y=lerp(443,666,move);card(966,y,542,68,'寫企劃',move<.5?'09:00 – 10:00':'12:00 – 13:00',t>=19.3?P.sage:P.yellow);if(t>=19.3){check(1477,y+27,true,1.1)}}
 if(t>=19.3){const p=progress(t,19.3,19.8);c.save();c.globalAlpha=p;text('已完成 1 項',500,762,24,P.muted);c.restore()}
 c.restore();
}
function physicalNotes(t){
 // Secondary notes join the scrollable list below its four visible rows.
 // They remain physical paper until the same gather action is under way.
 extraNotes.forEach((n,i)=>{
  const p=progress(t,7.75+i*.3,8.9+i*.3);if(p>=1)return;
  const dest={x:670,y:776};
  const pos=bez({x:n.x,y:n.y},{x:950+(i%2?160:-290),y:530+i*60},dest,p);
  const w=lerp(194,340,p),h=lerp(124,48,p);
  c.save();c.translate(pos.x,pos.y);c.rotate(n.r*(1-p));c.globalAlpha=1-progress(p,.72,1);
  c.shadowColor='rgba(41,43,36,.14)';c.shadowOffsetY=7*(1-p);c.shadowBlur=12*(1-p);
  box(-w/2,-h/2,w,h,lerp(0,8,p),n.color);c.shadowColor='transparent';
  if(p<.6){box(-30,-h/2-9,60,18,0,'rgba(246,243,233,.65)');text(n.title,-w/2+18,-h/2+49,25,P.ink,600);c.globalAlpha*=1-clamp(p*2);text(n.sub,-w/2+18,-h/2+86,18,P.ink)}
  else{text(n.title,-w/2+52,9,23,P.ink,600);check(-w/2+26,0,false)}c.restore();
 });
 notes.forEach((n,i)=>{
 const p=progress(t,6.15+i*.54,7.9+i*.54);if(p>=1)return;
 const dest={x:670,y:450+i*76};const pos=bez({x:n.x,y:n.y},{x:1050+(i%2?280:-400),y:350+i*25},dest,p);
 const w=lerp(240,340,p),h=lerp(156,60,p),angle=n.r*(1-p);
 c.save();c.translate(pos.x,pos.y);c.rotate(angle);c.shadowColor='rgba(41,43,36,.16)';c.shadowOffsetY=10*(1-p);c.shadowBlur=15*(1-p);box(-w/2,-h/2,w,h,lerp(0,9,p),p>.65?(i===0?P.yellow:'#E9E6DB'):n.color);c.shadowColor='transparent';
 if(p<.6){box(-42,-h/2-12,84,24,0,'rgba(246,243,233,.65)');text(n.title,-w/2+23,-h/2+58,29,P.ink,600);c.globalAlpha=1-clamp(p*2);text(n.sub,-w/2+23,-h/2+103,20,P.ink)}else{text(n.title,-w/2+52,9,25,P.ink,600);check(-w/2+26,0,false)}
 c.restore();
})}
function magic(t){if(t<4.8||t>10)return;const appear=progress(t,4.8,5.6)*(1-progress(t,8.7,10));
 // An authored ribbon travels from the original mascot to the task column.
 c.save();c.globalAlpha=appear;c.strokeStyle=P.orange;c.lineWidth=5;c.setLineDash([11,12]);c.lineDashOffset=-t*40;c.beginPath();c.moveTo(399,693);c.bezierCurveTo(255,385,1135,182,706,411);c.stroke();c.setLineDash([]);
 for(let i=0;i<12;i++){const p=((t-4.8)*.48+i/12)%1;const pos=bez({x:399,y:693},{x:940,y:88},{x:706,y:411},p);star(pos.x,pos.y,7+5*Math.sin(i+1),t*.5+i)}
 star(399,693,24,t,P.orange);c.restore()}
function character(t){const entrance=progress(t,3.1,4.7),exit=progress(t,10,11.3);if(entrance===0||exit===1)return;const x=lerp(-200,105,entrance)-exit*310,y=624+Math.sin(t*2.8)*4*entrance;
 c.save();c.translate(x+170,y+170);c.rotate(-.1*progress(t,4.4,5.2)+.11*progress(t,7.5,8.7));c.drawImage(mascot,-170,-170,340,340);c.restore();
 if(t>4.5){c.save();c.globalAlpha=progress(t,4.5,5);line(x+256,y+135,x+295,y+68,P.ink,9);star(x+297,y+62,19,t*.3);c.restore()}}
function interaction(t){
 if(t>=10.7&&t<14.6){const approach=progress(t,10.7,11.6),drag=progress(t,11.9,13.8);let x=lerp(1350,716,approach),y=lerp(785,453,approach);if(t>=11.9){x=lerp(710,1176,drag);y=lerp(450,473,drag);if(drag<1){c.save();c.shadowColor='rgba(41,43,36,.18)';c.shadowBlur=24;c.shadowOffsetY=12;card(x-210,y-30,lerp(340,542,drag),67,'寫企劃','09:00 – 10:00',P.yellow);c.restore()}c.save();c.globalAlpha=1-drag;line(877,442,1510,442,P.orange,4);c.restore()}cursor(x,y,t>=11.75&&t<14)}
 if(t>=14.6&&t<18.1){const p=progress(t,14.6,15.4),move=progress(t,15.4,17.2);cursor(lerp(1440,1280,p),lerp(575,472,p)+223*move,t>=15.4&&t<17.3)}
 if(t>=18.1&&t<20.3){const p=progress(t,18.1,19.1);cursor(lerp(1300,526,p),lerp(713,450,p),t>19.1&&t<19.6);if(t>19.2){c.save();c.globalAlpha=1-progress(t,19.2,20);star(525,450,lerp(5,45,progress(t,19.2,20)),0);c.restore()}}
}
function focus(t){const p=progress(t,20.4,21.7);if(p===0)return;c.save();c.globalAlpha=p;box(449,349,1122,493,0,P.ink);text('專注當下',516,418,28,P.paper,500);text('整理靈感',516,509,42,P.paper,650);text(t>=23.5?'24:59':'25:00',510,694,158,P.yellow,550);text('把注意力，留給眼前這件事。',520,761,26,P.paper);c.drawImage(mascot,1200,475,300,300);box(1253,379,246,57,9,P.yellow);text('開始專注',1305,417,25,P.ink,650);c.restore();if(t>=21.8&&t<23.1){const p=progress(t,21.8,22.6);cursor(lerp(1490,1395,p),lerp(721,411,p),t>22.55&&t<22.95)}if(t>=22.8){c.save();c.globalAlpha=progress(t,22.8,23.2);box(1253,379,246,57,9,P.sage);text('專注中',1317,417,25,P.ink,650);c.restore()}}
const headings=[{a:0,b:3.7,s:'事情很多，卻不知道放哪裡。'},{a:3.7,b:10.2,s:'讓散落的待辦，聚在一起。'},{a:10.2,b:14.6,s:'拖進行事曆，就有了時間。'},{a:14.6,b:18.1,s:'計畫變了，時間也能移動。'},{a:18.1,b:20.4,s:'完成一件，就輕一點。'},{a:20.4,b:25,s:'慢慢搖擺，把事情做完。'}];
// Playback runs at 4/3 speed; original story coordinates remain editable.
const DURATION=18, STORY_SCALE=.75;
function render(elapsed){let t=Math.max(0,Math.min(DURATION,elapsed))/STORY_SCALE;c.clearRect(0,0,1920,1080);box(0,0,1920,1080,0,P.yellow);
 text('Huddle',84,85,36,P.ink,700);text('把待辦放進今天',1538,84,24,P.ink,500);line(84,113,1836,113,P.ink,2);
 const h=headings.find(h=>t>=h.a&&t<h.b)||headings.at(-1);const fade=Math.min(progress(t,h.a,h.a+.38),1-progress(t,h.b-.28,h.b));c.save();c.globalAlpha=h.a===0&&t<.38?1:fade;text(h.s,84,214,64,P.ink,650);c.restore();
 const zoom=1+.06*progress(t,10,11.6);c.save();c.translate(1010,580);c.scale(zoom,zoom);c.translate(-1010,-580);ui(t);physicalNotes(t);character(t);magic(t);interaction(t);focus(t);c.restore();
 line(84,1000,1836,1000,P.ink,2);text('任務 × 行事曆 × 專注',84,1042,24,P.ink,600);text('情境示意｜便條紙轉換為視覺隱喻',1324,1041,22,P.ink,500);
 document.getElementById('seek').value=elapsed;document.getElementById('time').textContent=`00:${String(Math.floor(elapsed)).padStart(2,'0')} / 00:18`;
}
let playing=false,start=0,at=0,frame=0;
function pause(){playing=false;cancelAnimationFrame(frame);document.getElementById('play').textContent='播放'}
function setTime(t){pause();at=Math.max(0,Math.min(DURATION,Number(t)||0));render(at)}
function tick(now){if(!playing)return;at=Math.min(DURATION,(now-start)/1000);render(at);if(at===DURATION)pause();else frame=requestAnimationFrame(tick)}
function play(){if(at>=DURATION)at=0;playing=true;start=performance.now()-at*1000;document.getElementById('play').textContent='暫停';frame=requestAnimationFrame(tick)}
const ready=Promise.all([loaded,document.fonts.ready]).then(()=>{render(0);window.__FILM_READY__=true});
window.HuddleFilm={duration:DURATION,fps:30,ready,setTime,play,pause};
document.getElementById('play').onclick=()=>playing?pause():play();document.getElementById('seek').oninput=e=>setTime(e.target.value);
if(new URLSearchParams(location.search).get('capture')==='1')document.body.dataset.capture='true';
})();
