import * as SecureStore from "expo-secure-store";

const KEY_ACCESS_TOKEN = "psico_access_token";
const KEY_REFRESH_TOKEN = "psico_refresh_token";

// Sprint S43: remember the server-side DeviceToken row id so we can
// unregister it on logout. The Expo push token itself is not secret, but
// keeping it in SecureStore costs nothing.
const KEY_PUSH_DEVICE_ID = "psico_push_device_id";

export const pushIdStore = {
  async save(id: string): Promise<void> {
    await SecureStore.setItemAsync(KEY_PUSH_DEVICE_ID, id);
  },
  async load(): Promise<string | null> {
    return SecureStore.getItemAsync(KEY_PUSH_DEVICE_ID);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY_PUSH_DEVICE_ID);
  },
};

export const tokenStore = {
  async saveTokens(tokens: {
    accessToken: string;
    refreshToken: string;
  }): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(KEY_ACCESS_TOKEN, tokens.accessToken),
      SecureStore.setItemAsync(KEY_REFRESH_TOKEN, tokens.refreshToken),
    ]);
  },

  async loadTokens(): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
  }> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KEY_ACCESS_TOKEN),
      SecureStore.getItemAsync(KEY_REFRESH_TOKEN),
    ]);
    return { accessToken, refreshToken };
  },

  async clearTokens(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS_TOKEN),
      SecureStore.deleteItemAsync(KEY_REFRESH_TOKEN),
    ]);
  },
};
