package com.kaybeefitness.app.services;

/**
 * Compatibility shim for the old service name.
 * Any intents still targeting com.kaybeefitness.app.services.WearableListenerService
 * will now be handled by KaybeeWearableListenerService.
 */
public class WearableListenerService extends KaybeeWearableListenerService {
}
