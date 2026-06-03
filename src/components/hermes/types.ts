export interface HermesOverlayProps {
  /** Current tenant identifier — used to fetch tenant-specific data */
  tenantId?: string;
  /** Current user identifier */
  userId?: string;
  /** Display name of current user */
  userName?: string;
  /** Port of the Hermes Agent mini-service (default: 3004) */
  servicePort?: number;
  /** Display name for the agent (default: "Hermes") */
  agentName?: string;
  /** Maximum visible notifications (default: 3) */
  maxVisibleNotifications?: number;
  /** Agent greeting override */
  greeting?: string;
  /** Whether to show the agent (default: true) */
  visible?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'hermes';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface HermesNotification {
  id: string;
  type: 'reminder' | 'deadline' | 'info';
  title: string;
  description?: string;
  dueDate?: string;
  read?: boolean;
}

export interface HermesConfig {
  enabled: boolean;
  personality: 'professional' | 'friendly' | 'concise';
  greeting?: string;
}
