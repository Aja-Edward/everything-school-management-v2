/**
 * Invitation Service
 *
 * Provides access to all invitation endpoints including:
 * - Sending invitations to new users (students, parents, teachers)
 * - Retrieving invitation details
 * - Accepting invitations
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Invitation {
  id: number;
  email: string;
  role: 'student' | 'parent' | 'teacher' | 'admin';
  token: string;
  is_used: boolean;
  created_at: string;
  expires_at: string;
}

export interface SendInvitationData {
  email: string;
  role: 'student' | 'parent' | 'teacher' | 'admin';
}

export interface AcceptInvitationData {
  token: string;
  first_name: string;
  last_name: string;
  password: string;
}

// ============================================================================
// INVITATION SERVICE
// ============================================================================

export const InvitationService = {
  /**
   * Send an invitation to a new user
   * Only admins can send invitations
   */
  sendInvitation: (data: SendInvitationData) =>
    api.post('/api/invitations/send/', data),

  /**
   * Get invitation details by token
   * Used to display invitation information before accepting
   */
  getInvitation: (token: string) =>
    api.get(`/api/invitations/${token}/`),

  /**
   * Accept an invitation and create account
   * Creates a new user account with the invited role
   */
  acceptInvitation: (data: AcceptInvitationData) =>
    api.post('/api/invitations/accept/', data),
};

export default InvitationService;
