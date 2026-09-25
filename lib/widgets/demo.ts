import { monthDays, type WidgetSnapshot } from './model'
export function widgetDemo():WidgetSnapshot {
  return {schemaVersion:1,accountId:'demo',epoch:'demo',generatedAt:'2026-09-25T01:00:00Z',today:'2026-09-25',locale:'zh-TW',
    days:monthDays(new Date(2026,8,25)).map(d=>({...d,count:[8,11,16,23,25].includes(d.day)&&d.inMonth?1:0})),
    tasks:[{id:'a',title:'整理提案',subtitle:'工作',completed:false,actionable:true},{id:'b',title:'回覆客戶',subtitle:'工作 · 15:00',completed:false,actionable:true},{id:'c',title:'閱讀 20 分鐘',subtitle:'生活',completed:false,actionable:true},{id:'d',title:'散步一下',subtitle:'留一點時間給自己',completed:true,actionable:true}],
    agenda:[{id:'e',title:'設計討論',subtitle:'工作',date:'2026-09-25',time:'14:00'},{id:'f',title:'散步一下',subtitle:'生活',date:'2026-09-25',time:'16:30'}],
    notes:[{id:'n',title:'旅行靈感',subtitle:'海邊、一本書，與沒有安排的午後。'},{id:'n2',title:'這週想做的事',subtitle:'把那個放在心裡的想法，慢慢寫出來。'}],
    boards:[{id:'2026-09-25',title:'下一個作品',subtitle:'靈感 · 整理架構 · 完成初稿',date:'2026-09-25'}],
    focus:{state:'paused',title:'整理提案',endAt:null,seconds:1122,note:'先把核心想法寫清楚。\n下一步，補上兩個例子。'},water:{enabled:true,nextAt:new Date('2026-09-25T03:00:00Z').getTime(),count:2}}
}
