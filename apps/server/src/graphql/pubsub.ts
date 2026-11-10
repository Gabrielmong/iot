import { PubSub, type PubSubEngine } from "graphql-subscriptions";
import { CAMERA_GROUPS_CHANGED, DEVICE_STATE, DEVICES_CHANGED, ROUTINE_RUN, ROUTINES_CHANGED, type DeviceStatePayload, type RoutineRunPayload } from "../devices/topics.js";

/** In-process PubSub shared by the device manager (publisher) and the subscriptions (consumers). */
export function createPubSub(): PubSub {
  return new PubSub();
}

/** Tells clients to refetch `devices`: the device list, a grant, a room or a role changed. */
export function publishDevicesChanged(pubsub: PubSubEngine): Promise<void> {
  return pubsub.publish(DEVICES_CHANGED, {});
}

/** Tells clients to refetch `routines`. */
export function publishRoutinesChanged(pubsub: PubSubEngine): Promise<void> {
  return pubsub.publish(ROUTINES_CHANGED, {});
}

export function routinesChangedEvents(pubsub: PubSubEngine): AsyncIterableIterator<unknown> {
  return pubsub.asyncIterableIterator(ROUTINES_CHANGED);
}

export function routineRunEvents(pubsub: PubSubEngine): AsyncIterableIterator<RoutineRunPayload> {
  return pubsub.asyncIterableIterator<RoutineRunPayload>(ROUTINE_RUN);
}

/** Tells clients to refetch camera groups. */
export function publishCameraGroupsChanged(pubsub: PubSubEngine): Promise<void> {
  return pubsub.publish(CAMERA_GROUPS_CHANGED, {});
}

export function cameraGroupsChangedEvents(pubsub: PubSubEngine): AsyncIterableIterator<unknown> {
  return pubsub.asyncIterableIterator(CAMERA_GROUPS_CHANGED);
}

export function deviceStateEvents(pubsub: PubSubEngine): AsyncIterableIterator<DeviceStatePayload> {
  return pubsub.asyncIterableIterator<DeviceStatePayload>(DEVICE_STATE);
}

export function devicesChangedEvents(pubsub: PubSubEngine): AsyncIterableIterator<unknown> {
  return pubsub.asyncIterableIterator(DEVICES_CHANGED);
}
