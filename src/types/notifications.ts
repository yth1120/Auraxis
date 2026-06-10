/** In-app notification (Agent completion / cron run / system). */
export interface AppNotification {
  id: string;
  kind: 'agent' | 'cron' | 'system';
  title: string;
  detail?: string;
  timestamp: number;
  read: boolean;
  /** Jump target: select this agent in the code surface. */
  agentId?: string;
}

export interface NotificationStore {
  items: AppNotification[];
  push: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}
