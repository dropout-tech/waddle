package com.lazylazy.huddle.widgets;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.widget.*;
public class WidgetConfigureActivity extends Activity {
    @Override public void onCreate(Bundle state){super.onCreate(state);setResult(RESULT_CANCELED);
        int id=getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);if(id==AppWidgetManager.INVALID_APPWIDGET_ID){finish();return;}
        LinearLayout page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);page.setPadding(32,48,32,24);page.setBackgroundColor(0xfffcf8ee);
        TextView title=new TextView(this);title.setText("選擇 Huddle 小工具");title.setTextSize(23);title.setTextColor(0xff3e3e35);page.addView(title);
        ListView list=new ListView(this);list.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_list_item_1,HuddleWidget.NAMES));page.addView(list);setContentView(page);
        list.setOnItemClickListener((parent,view,pos,row)->{getSharedPreferences("huddle_widget_config",0).edit().putString("kind_"+id,HuddleWidget.KINDS[pos]).apply();HuddleWidget.render(this,AppWidgetManager.getInstance(this),id);setResult(RESULT_OK,new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish();});
    }
}
