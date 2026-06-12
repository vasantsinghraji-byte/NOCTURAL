package com.nocturnal.healthcare;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NocturnalBackgroundPermissionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
