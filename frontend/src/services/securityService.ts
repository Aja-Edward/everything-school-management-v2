// src/services/securityService.ts
import api from './api';

export interface AuditLogEntry {
  id: number;
  action: string;
  user: string;
  target_user: string | null;
  ip_address: string | null;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface LoginAttempt {
  email: string;
  ip_address: string | null;
  success: boolean;
  timestamp: string;
}

export const securityService = {
  getAuditLogs: (): Promise<AuditLogEntry[]> =>
    api.get('/security/audit-logs/'),

  getLoginAttempts: (): Promise<LoginAttempt[]> =>
    api.get('/security/login-attempts/'),

  unlockAccount: (userId: number): Promise<{ message: string }> =>
    api.post('/security/unlock-account/', { user_id: userId }),
};