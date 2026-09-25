package com.lazylazy.huddle.widgets;
import android.content.Context;
import org.json.*;
import java.util.UUID;

public final class WidgetStore {
    private WidgetStore(){}
    public static synchronized JSONObject read(Context c) {
        try{return new JSONObject(c.getSharedPreferences("huddle_widgets",Context.MODE_PRIVATE).getString("state","{}"));}catch(JSONException e){return new JSONObject();}
    }
    private static void save(Context c,JSONObject state) {
        if(!c.getSharedPreferences("huddle_widgets",Context.MODE_PRIVATE).edit().putString("state",state.toString()).commit()) throw new IllegalStateException("Widget storage unavailable");
    }
    public static synchronized String account(Context c,String id)throws JSONException {
        JSONObject s=read(c);
        if(!s.optString("accountId").equals(id)||!s.has("epoch")) s=new JSONObject().put("accountId",id).put("epoch",UUID.randomUUID().toString()).put("actions",new JSONArray());
        save(c,s);return s.getString("epoch");
    }
    public static synchronized void publish(Context c,JSONObject snapshot)throws JSONException {
        JSONObject s=read(c);
        if(snapshot.optString("accountId").isEmpty()||!s.optString("accountId").equals(snapshot.optString("accountId"))||!s.optString("epoch").equals(snapshot.optString("epoch"))||snapshot.optInt("schemaVersion")!=1) throw new SecurityException("Stale widget snapshot");
        s.put("snapshot",snapshot);save(c,s);
    }
    public static synchronized void complete(Context c,String account,String epoch,String taskId)throws JSONException {
        JSONObject s=read(c);
        if(account==null||account.isEmpty()||!s.optString("accountId").equals(account)||!s.optString("epoch").equals(epoch))return;
        JSONObject snap=s.optJSONObject("snapshot");if(snap==null)return;
        JSONArray tasks=snap.optJSONArray("tasks"),actions=s.optJSONArray("actions");if(tasks==null)return;if(actions==null)actions=new JSONArray();
        for(int n=0;n<actions.length();n++)if(actions.getJSONObject(n).optString("taskId").equals(taskId))return;
        if(actions.length()>=50)return;
        for(int n=0;n<tasks.length();n++) {JSONObject t=tasks.getJSONObject(n);if(t.optString("id").equals(taskId)&&t.optBoolean("actionable")&&!t.optBoolean("completed")&&t.has("revision")){
            actions.put(new JSONObject().put("id",UUID.randomUUID().toString()).put("taskId",taskId).put("revision",t.getString("revision")).put("accountId",account).put("epoch",epoch));s.put("actions",actions);save(c,s);return;
        }}
    }
    public static synchronized void acknowledge(Context c,String owner,String epoch,JSONArray ids)throws JSONException {
        JSONObject s=read(c);if(!s.optString("accountId").equals(owner)||!s.optString("epoch").equals(epoch))return;
        JSONArray old=s.optJSONArray("actions"),next=new JSONArray();if(old==null)return;
        for(int i=0;i<old.length();i++){JSONObject a=old.getJSONObject(i);boolean remove=false;for(int j=0;j<ids.length();j++)if(ids.getString(j).equals(a.optString("id")))remove=true;if(!remove)next.put(a);}
        s.put("actions",next);save(c,s);
    }
}
