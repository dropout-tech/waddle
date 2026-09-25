package com.lazylazy.huddle.widgets;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="HuddleWidgets")
public class HuddleWidgetsPlugin extends Plugin {
    @PluginMethod public void setAccount(PluginCall call){try{String epoch=WidgetStore.account(getContext(),call.getString("accountId",""));HuddleWidget.refresh(getContext());call.resolve(new JSObject().put("epoch",epoch));}catch(Exception e){call.reject("無法切換小工具帳號",e);}}
    @PluginMethod public void publish(PluginCall call){try{JSObject s=call.getObject("snapshot");if(s==null){call.reject("缺少資料");return;}WidgetStore.publish(getContext(),s);HuddleWidget.refresh(getContext());call.resolve();}catch(Exception e){call.reject("小工具資料已過期",e);}}
    @PluginMethod public void read(PluginCall call){try{call.resolve(new JSObject(WidgetStore.read(getContext()).toString()));}catch(Exception e){call.reject("無法讀取小工具",e);}}
    @PluginMethod public void acknowledge(PluginCall call){try{WidgetStore.acknowledge(getContext(),call.getString("accountId",""),call.getString("epoch",""),call.getArray("ids",new JSArray()));HuddleWidget.refresh(getContext());call.resolve();}catch(Exception e){call.reject("無法確認同步",e);}}
}
