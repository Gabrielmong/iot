/** App links an Android TV opens its apps from (RemoteAppLinkLaunchRequest). */
export const ANDROID_APP_LINKS = {
  YOUTUBE: 'https://www.youtube.com',
  NETFLIX: 'https://www.netflix.com/title',
  PRIME_VIDEO: 'https://app.primevideo.com',
  DISNEY_PLUS: 'https://www.disneyplus.com',
  SPOTIFY: 'spotify://',
} as const;

export type AndroidAppName = keyof typeof ANDROID_APP_LINKS;
