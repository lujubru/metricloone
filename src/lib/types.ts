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
  /** `POST` (publicación normal) o `STORY` (Historia de Instagram). */
  postType?: string;
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

export type InboxAttachment = { type: string; url: string };

export type InboxMessageItem = {
  id: string;
  direction: string;
  authorName: string | null;
  body: string;
  attachments: InboxAttachment[] | null;
  permalink: string | null;
  isRead: boolean;
  createdAt: string;
};

export type InboxThreadSummary = {
  id: string;
  platform: string;
  kind: string;
  subject: string | null;
  permalink: string | null;
  participantName: string | null;
  participantAvatar: string | null;
  lastMessageAt: string;
  unread: number;
  account: string;
  lastMessage: { id: string; direction: string; body: string; createdAt: string } | null;
};

export type InboxThreadDetail = {
  id: string;
  platform: string;
  kind: string;
  subject: string | null;
  permalink: string | null;
  participantName: string | null;
  participantAvatar: string | null;
  participantExternalId: string | null;
  account: string;
  messages: InboxMessageItem[];
};

export type InboxSetup = {
  callbackUrl: string;
  verifyTokenConfigured: boolean;
  appId: string | null;
  webhookFields: string[];
  accounts: {
    id: string;
    platform: string;
    account: string;
    profileId: string;
    subscribedFields: string[] | null;
    missingFields: string[] | null;
    error: string | null;
  }[];
};
