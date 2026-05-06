import * as SecureStore from "expo-secure-store";

const KEY_ACCESS_TOKEN = "psico_access_token";
const KEY_REFRESH_TOKEN = "psico_refresh_token";

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
