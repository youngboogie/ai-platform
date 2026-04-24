export interface UserProfile {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface LoginResponse {
  message: string;
  token: string;
}

export interface RegisterResponse {
  message: string;
  userId?: string;
}

export interface AuthMeResponse {
  message: string;
  user: UserProfile;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSource {
  chunkId?: string;
  fileName?: string;
  similarity?: number;
  searchType?: string;
  hybridScore?: number;
  content?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata?: {
    sources?: ChatSource[];
  } | null;
  createdAt: string;
}

export interface ChatSendResponse {
  userId: string;
  yourMessage: string;
  reply: string;
  sources?: ChatSource[];
}

export interface DocumentItem {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  content?: string | null;
  createdAt: string;
  _count?: {
    chunks: number;
  };
}
