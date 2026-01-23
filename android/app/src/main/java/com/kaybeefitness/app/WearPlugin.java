package com.kaybeefitness.app;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.util.List;

@CapacitorPlugin(name = "WearConnectivity")
public class WearPlugin extends Plugin implements MessageClient.OnMessageReceivedListener {

    @Override
    public void load() {
        super.load();
        Wearable.getMessageClient(getContext()).addListener(this);
    }

    @Override
    protected void handleOnDestroy() {
        Wearable.getMessageClient(getContext()).removeListener(this);
        super.handleOnDestroy();
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (messageEvent.getPath().equals("/health-data")) {
            String dataString = new String(messageEvent.getData());
            try {
                JSObject ret = new JSObject(dataString);
                notifyListeners("onHealthUpdate", ret);
            } catch (Exception e) {
                Log.e("WearPlugin", "Error parsing health data", e);
            }
        }
    }

    @PluginMethod
    public void sendDataToWatch(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data");

        if (path == null || data == null) {
            call.reject("Path et Data requis");
            return;
        }

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), path, data.getBytes()));
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Erreur envoi: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void sendStartSignal(PluginCall call) {
        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), "/start-session", "GO".getBytes()));
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Erreur envoi montre: " + e.getMessage());
            }
        }).start();
    }
}
