package com.kaybeefitness.app;

import android.os.BatteryManager;
import android.os.Build;
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

@CapacitorPlugin(name = "WearPlugin")
public class WearPlugin extends Plugin implements MessageClient.OnMessageReceivedListener {

    @Override
    public void load() {
        super.load();
        Wearable.getMessageClient(getContext()).addListener(this);
        Log.d("WearPlugin", "WearPlugin loaded and listener added");
    }

    @Override
    protected void handleOnDestroy() {
        Wearable.getMessageClient(getContext()).removeListener(this);
        super.handleOnDestroy();
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        Log.d("WearPlugin", "Received message: " + path);
        
        if (path.equals("/health-data")) {
            String dataString = new String(messageEvent.getData());
            try {
                JSObject ret = new JSObject(dataString);
                notifyListeners("onHealthUpdate", ret);
            } catch (Exception e) {
                Log.e("WearPlugin", "Error parsing health data", e);
            }
        } else if (path.equals("/request-sync")) {
            JSObject ret = new JSObject();
            ret.put("requested", true);
            notifyListeners("onRequestSync", ret);
        } else if (path.equals("/pair-success")) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            notifyListeners("onPairSuccess", ret);
        } else if (path.equals("/status-update")) {
            String dataString = new String(messageEvent.getData());
            try {
                JSObject ret = new JSObject(dataString);
                notifyListeners("onStatusUpdate", ret);
            } catch (Exception e) {
                Log.e("WearPlugin", "Error parsing status data", e);
            }
        }
    }

    @PluginMethod
    public void getConnectedNodes(PluginCall call) {
        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                JSObject ret = new JSObject();
                if (!nodes.isEmpty()) {
                    Node node = nodes.get(0);
                    ret.put("connected", true);
                    ret.put("name", node.getDisplayName());
                    ret.put("id", node.getId());
                    // On demande à la montre de nous envoyer sa batterie
                    Wearable.getMessageClient(getContext()).sendMessage(node.getId(), "/request-battery", null);
                } else {
                    ret.put("connected", false);
                }
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void pairWatch(PluginCall call) {
        String pairingCode = call.getString("pairingCode");
        String userId = call.getString("userId");

        Log.d("WearPlugin", "pairWatch called with code: " + pairingCode + " for user: " + userId);

        if (pairingCode == null || userId == null) {
            call.reject("Pairing code and User ID are required");
            return;
        }

        JSObject data = new JSObject();
        data.put("pairingCode", pairingCode);
        data.put("userId", userId);
        String dataString = data.toString();

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                Log.d("WearPlugin", "Found " + nodes.size() + " connected nodes");
                if (nodes.isEmpty()) {
                    call.reject("Aucune montre connectée en Bluetooth");
                    return;
                }
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), "/pair", dataString.getBytes()));
                    Log.d("WearPlugin", "Sent pairing message to node: " + node.getDisplayName());
                }
                call.resolve();
            } catch (Exception e) {
                Log.e("WearPlugin", "Pairing error", e);
                call.reject("Erreur jumelage: " + e.getMessage());
            }
        }).start();
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
