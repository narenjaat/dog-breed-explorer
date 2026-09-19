/**
 * Network reachability.
 *
 * Wraps expo-network so the rest of the app depends on a two-field snapshot
 * rather than the SDK's shape, and so tests can drive connectivity directly.
 */

import * as Network from 'expo-network';

export interface NetworkSnapshot {
  /** The device has a network interface up. */
  readonly isConnected: boolean;
  /**
   * The OS believes that interface can actually reach the internet. On some
   * Android versions this is undefined, in which case we fall back to
   * `isConnected` rather than declaring the app offline.
   */
  readonly isInternetReachable: boolean;
}

export type NetworkListener = (snapshot: NetworkSnapshot) => void;

function toSnapshot(state: Network.NetworkState): NetworkSnapshot {
  const isConnected = state.isConnected ?? false;
  return {
    isConnected,
    isInternetReachable: state.isInternetReachable ?? isConnected,
  };
}

/** Reads current connectivity. Assumes online if the check itself fails, so a
 *  probe error cannot strand the user in a permanent "offline" state. */
export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  try {
    const state = await Network.getNetworkStateAsync();
    return toSnapshot(state);
  } catch {
    return { isConnected: true, isInternetReachable: true };
  }
}

/**
 * Subscribes to connectivity changes. Returns an unsubscribe function.
 */
export function subscribeToNetwork(listener: NetworkListener): () => void {
  const subscription = Network.addNetworkStateListener((state) => {
    listener(toSnapshot(state));
  });
  return () => {
    subscription.remove();
  };
}

/** True when the snapshot indicates the app can reach the API. */
export function isOnline(snapshot: NetworkSnapshot): boolean {
  return snapshot.isConnected && snapshot.isInternetReachable;
}
