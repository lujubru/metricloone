export type SocialProfile = {
  id: string;
  tenantId: string;
  userId: string | null;
  platform: string;
  profileId: string;
  username: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  parentProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Post = {
  id: string;
  tenantId: string;
  userId: string | null;
  socialProfileId: string;
  content: string;
  mediaUrls: string[];
  scheduledFor: string;
  status: string;
  publishedAt: string | null;
  facebookPostId?: string | null;
  errorMessage?: string | null;
  attempts?: number;
  createdAt: string;
  updatedAt: string;
  socialProfile?: SocialProfile;
};

export type FacebookPage = {
  id: string;
  name: string;
  access_token: string;
  category?: string;
};

export type InstagramAccountItem = {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  followersCount: number | null;
  pageId: string;
  pageName: string;
};
