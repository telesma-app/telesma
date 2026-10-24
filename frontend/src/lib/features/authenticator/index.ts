import { readonly } from "svelte/store";

import * as state from "$lib/features/authenticator/state.js";

export const devices = readonly(state.devices);

export const selectedSelector = readonly(state.selectedSelector);

export const selectedDevice = readonly(state.selectedDevice);

export const authenticatorStatus = readonly(state.authenticatorStatus);

export const authenticatorGetInfo = readonly(state.authenticatorGetInfo);

export const authenticatorBusy = readonly(state.authenticatorBusy);

export { rediscoverAfterFactoryReset, shutdownWorkbench } from "$lib/authenticator-controller.js";

export const endpoints = readonly(state.endpoints);
export const selectedEndpointId = readonly(state.selectedEndpointId);
export const selectedPhysicalDevice = readonly(state.selectedPhysicalDevice);
export const selectedDeviceEndpoints = readonly(state.selectedDeviceEndpoints);
