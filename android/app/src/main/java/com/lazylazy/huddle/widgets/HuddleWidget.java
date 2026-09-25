package com.lazylazy.huddle.widgets;
import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.*;
import com.lazylazy.huddle.MainActivity;
import com.lazylazy.huddle.R;

public class HuddleWidget extends AppWidgetProvider {
    public static final String[] KINDS={"overview","calendar","agenda","tasks","top-three","whiteboard","notebook","focus-note","focus","water","shortcuts"};
    public static final String[] NAMES={"月曆＋今日任務","可視化小月曆","近期行程","任務清單","今天三件事","白板","記事本","專注記事","專注計時","喝水提醒","隨手記入口"};
    public static void refresh(Context c){AppWidgetManager m=AppWidgetManager.getInstance(c);for(int id:m.getAppWidgetIds(new ComponentName(c,HuddleWidget.class)))render(c,m,id);}
    @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids)render(c,m,id);}
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){render(c,m,id);}
    @Override public void onDeleted(Context c,int[] ids){for(int id:ids)c.getSharedPreferences("huddle_widget_config",0).edit().remove("kind_"+id).apply();}
    @Override public void onReceive(Context c,Intent intent){super.onReceive(c,intent);if("com.lazylazy.huddle.WIDGET_COMPLETE".equals(intent.getAction())){try{WidgetStore.complete(c,intent.getStringExtra("accountId"),intent.getStringExtra("epoch"),intent.getStringExtra("taskId"));refresh(c);}catch(Exception ignored){}}}
    static PendingIntent open(Context c,int widget,String kind,JSONObject s,String id,String date){
        Uri.Builder u=new Uri.Builder().scheme("huddle").authority("widget").appendPath(kind);
        if(s!=null){u.appendQueryParameter("accountId",s.optString("accountId"));u.appendQueryParameter("epoch",s.optString("epoch"));}
        if(id!=null)u.appendQueryParameter("id",id);if(date!=null)u.appendQueryParameter("date",date);
        Intent i=new Intent(c,MainActivity.class).setAction(Intent.ACTION_VIEW).setData(u.build()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c,widget,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static void text(RemoteViews v,int id,String value){v.setTextViewText(id,value);}
    static void addText(Context c,RemoteViews v,String title,String sub,PendingIntent click){RemoteViews row=new RemoteViews(c.getPackageName(),R.layout.huddle_widget_row);text(row,R.id.row_title,title);text(row,R.id.row_subtitle,sub);row.setViewVisibility(R.id.row_check,View.GONE);row.setOnClickPendingIntent(R.id.row_text,click);v.addView(R.id.widget_content,row);}
    static void rows(Context c,RemoteViews v,int id,String kind,JSONObject s,JSONArray items,int limit,boolean tasks,JSONArray pending)throws JSONException {
        if(items==null||items.length()==0){addText(c,v,"這裡還有空間，慢慢安排。","",open(c,id,kind,s,null,null));return;}
        for(int n=0;n<Math.min(items.length(),limit);n++){
            JSONObject item=items.getJSONObject(n);String taskId=item.optString("id");boolean waiting=false;
            for(int j=0;j<pending.length();j++)if(pending.getJSONObject(j).optString("taskId").equals(taskId))waiting=true;
            RemoteViews row=new RemoteViews(c.getPackageName(),R.layout.huddle_widget_row);
            text(row,R.id.row_title,(item.has("time")?item.optString("time")+"  ":"")+item.optString("title"));text(row,R.id.row_subtitle,waiting?"待同步":item.optString("subtitle"));
            PendingIntent link=open(c,id,kind,s,taskId,item.optString("date",null));row.setOnClickPendingIntent(R.id.row_text,link);
            if(tasks){text(row,R.id.row_check,waiting?"◷":item.optBoolean("completed")?"✓":"□");
                if(item.optBoolean("actionable")&&!item.optBoolean("completed")&&!waiting){Intent action=new Intent(c,HuddleWidget.class).setAction("com.lazylazy.huddle.WIDGET_COMPLETE").setData(Uri.parse("huddle-action://"+id+"/"+taskId+"/"+s.optString("epoch"))).putExtra("taskId",taskId).putExtra("accountId",s.optString("accountId")).putExtra("epoch",s.optString("epoch"));row.setOnClickPendingIntent(R.id.row_check,PendingIntent.getBroadcast(c,id,action,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));}else row.setOnClickPendingIntent(R.id.row_check,link);
            }else row.setViewVisibility(R.id.row_check,View.GONE);
            v.addView(R.id.widget_content,row);
        }
    }
    public static void render(Context c,AppWidgetManager m,int id){
        String kind=c.getSharedPreferences("huddle_widget_config",0).getString("kind_"+id,"overview");int index=java.util.Arrays.asList(KINDS).indexOf(kind);if(index<0){kind="overview";index=0;}
        RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.huddle_widget);text(v,R.id.widget_title,NAMES[index]);v.removeAllViews(R.id.widget_content);
        JSONObject state=WidgetStore.read(c),s=state.optJSONObject("snapshot");JSONArray pending=state.optJSONArray("actions");if(pending==null)pending=new JSONArray();
        v.setOnClickPendingIntent(R.id.widget_root,open(c,id,kind,s,null,null));
        int height=m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,180),limit=height>260?5:2;
        try {
            if(s==null){addText(c,v,"開啟 Huddle 登入","讓今天的安排來到手邊",open(c,id,kind,null,null,null));text(v,R.id.widget_updated,"");m.updateAppWidget(id,v);return;}
            if(kind.equals("calendar")||kind.equals("overview")){
                addText(c,v,s.optString("today").substring(0,7),"",open(c,id,"calendar",s,null,null));JSONArray days=s.optJSONArray("days");
                RemoteViews week=new RemoteViews(c.getPackageName(),R.layout.huddle_widget_week);
                for(String day:new String[]{"日","一","二","三","四","五","六"}){RemoteViews cell=new RemoteViews(c.getPackageName(),R.layout.huddle_widget_day);text(cell,R.id.day_text,day);week.addView(R.id.week_cells,cell);}v.addView(R.id.widget_content,week);
                if(days!=null)for(int row=0;row<6;row++){week=new RemoteViews(c.getPackageName(),R.layout.huddle_widget_week);for(int col=0;col<7;col++){JSONObject d=days.getJSONObject(row*7+col);RemoteViews cell=new RemoteViews(c.getPackageName(),R.layout.huddle_widget_day);text(cell,R.id.day_text,String.valueOf(d.optInt("day"))+(d.optInt("count")>0?"·":""));boolean today=d.optString("date").equals(s.optString("today"));cell.setTextColor(R.id.day_text,today?0xffa44933:d.optBoolean("inMonth")?0xff3e3e35:0xff78766f);cell.setOnClickPendingIntent(R.id.day_text,open(c,id,"calendar",s,null,d.optString("date")));week.addView(R.id.week_cells,cell);}v.addView(R.id.widget_content,week);}
            }
            switch(kind){
                case "tasks":rows(c,v,id,kind,s,s.optJSONArray("tasks"),limit,true,pending);addText(c,v,"＋ 新增任務","",open(c,id,"tasks",s,"new",null));break;
                case "top-three":JSONArray remaining=new JSONArray(),all=s.optJSONArray("tasks");if(all!=null)for(int n=0;n<all.length();n++)if(!all.getJSONObject(n).optBoolean("completed"))remaining.put(all.getJSONObject(n));rows(c,v,id,kind,s,remaining,3,true,pending);break;
                case "overview":if(height>260)rows(c,v,id,"tasks",s,s.optJSONArray("tasks"),2,true,pending);break;
                case "agenda":rows(c,v,id,kind,s,s.optJSONArray("agenda"),limit,false,pending);break;
                case "notebook":rows(c,v,id,kind,s,s.optJSONArray("notes"),limit,false,pending);addText(c,v,"＋ 新增筆記","",open(c,id,kind,s,"new",null));break;
                case "whiteboard":rows(c,v,id,kind,s,s.optJSONArray("boards"),1,false,pending);addText(c,v,"開啟白板 ↗","",open(c,id,kind,s,null,null));break;
                case "focus-note":JSONObject f=s.optJSONObject("focus");addText(c,v,f==null?"想法來了，先留下來。":f.optString("title"),f==null?"":f.optString("note"),open(c,id,kind,s,null,null));addText(c,v,"記一筆 ↗","",open(c,id,kind,s,null,null));break;
                case "focus":JSONObject focus=s.optJSONObject("focus");int seconds=focus==null?1500:focus.optInt("seconds",1500);if(focus!=null&&focus.optString("state").equals("running")&&!focus.isNull("endAt"))seconds=(int)Math.max(0,(focus.optDouble("endAt")-System.currentTimeMillis())/1000);addText(c,v,String.format(java.util.Locale.ROOT,"%02d:%02d",seconds/60,seconds%60),focus==null?"專注":focus.optString("title"),open(c,id,kind,s,null,null));addText(c,v,"開啟計時控制 ↗","",open(c,id,kind,s,null,null));break;
                case "water":addText(c,v,"喝口水，休息一下","喝了 ／ 稍後提醒 ↗",open(c,id,kind,s,null,null));break;
                case "shortcuts":for(String k:new String[]{"whiteboard","notebook","focus-note"})addText(c,v,NAMES[java.util.Arrays.asList(KINDS).indexOf(k)]+" ↗","",open(c,id,k,s,null,null));break;
            }
            text(v,R.id.widget_updated,pending.length()>0?"待同步 · 開啟 Huddle":"更新 "+s.optString("generatedAt").substring(0,10));
        }catch(Exception e){text(v,R.id.widget_updated,"開啟 Huddle 重新整理");}
        m.updateAppWidget(id,v);
    }
}
