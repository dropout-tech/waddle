package com.lazylazy.huddle;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.lazylazy.huddle.widgets.HuddleWidgetsPlugin;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle state) { registerPlugin(HuddleWidgetsPlugin.class); super.onCreate(state); }
}
