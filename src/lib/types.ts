export type SocialProfile = {
  id: string;
  userId: string;
  platform: string;
  profileId: string;
  username: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Post = {
  id: string;
  userId: string;
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
