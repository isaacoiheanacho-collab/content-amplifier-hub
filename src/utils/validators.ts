export const isValidFacebookUrl = (url: string): boolean => {
  const facebookRegex = /^(https?:\/\/)?(www\.)?facebook\.com\/(?:[A-Za-z0-9.]+\/)?(?:posts|videos|photo\.php|watch\?v=)[^/]+/i;
  return facebookRegex.test(url);
};

export const isValidTikTokUrl = (url: string): boolean => {
  const tiktokRegex = /^(https?:\/\/)?(www\.)?(tiktok\.com\/@[\w.-]+\/video\/\d+|vm\.tiktok\.com\/\w+)/i;
  return tiktokRegex.test(url);
};

export const isValidYouTubeUrl = (url: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|channel\/|c\/|user\/)|youtu\.be\/)[\w-]+/i;
  return youtubeRegex.test(url);
};

export const validateBoostUrl = (url: string, platform: string): boolean => {
  switch (platform.toLowerCase()) {
    case 'facebook':
      return isValidFacebookUrl(url);
    case 'tiktok':
      return isValidTikTokUrl(url);
    case 'youtube':
      return isValidYouTubeUrl(url);
    default:
      return false;
  }
};