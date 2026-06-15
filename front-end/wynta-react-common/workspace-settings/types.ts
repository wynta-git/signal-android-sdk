export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export type UserStatus = 'active' | 'pending' | 'inactive';
export type ConnectorStatus = 'connected' | 'disconnected' | 'error';
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'custom';

export interface WorkspaceInfo {
  name: string;
  slug: string;
  timezone: string;
  language: string;
  contactEmail: string;
  description: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  plan?: string;
  comingSoon?: boolean;
  category?: string;
  categoryColor?: string;
  categoryBg?: string;
}

export interface WorkspaceUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarInitial: string;
  avatarColor: string;
  joinedAt: string;
}

export interface Connector {
  id: string;
  name: string;
  category: string;
  categoryDescription?: string;
  icon: string;
  iconBg?: string;
  status: ConnectorStatus;
  lastSync?: string;
  description: string;
}

export interface AIModel {
  id: string;
  provider: string;
  createdOn: string;
  isDefault: boolean;
}

export interface WorkspaceSettingsTab {
  id: string;
  label: string;
  icon: string;
}
