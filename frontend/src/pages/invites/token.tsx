import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE_URL, buildHeaders } from '@/services/api';

// Define the shape of the invitation data
interface InviteData {
  email: string;
  role: 'student' | 'teacher' | 'parent'; // You can expand if needed
  token: string;
  is_used: boolean;
  created_at: string;
  expires_at: string;
}

const InvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchInvite = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/invitations/${token}`, {
          headers: await buildHeaders('GET'),
          credentials: 'include',
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.detail || 'Invalid or expired invitation link.');
        } else {
          setInvite(data);
        }
      } catch (err) {
        setError('Failed to load invitation.');
      }
    };

    fetchInvite();
  }, [token]);

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (!invite) {
    return <div>Loading invite...</div>;
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-2">
        You are invited as a <span className="capitalize">{invite.role}</span>
      </h2>
      <p>Email: {invite.email}</p>

      {/* 📝 Registration form will go here */}
    </div>
  );
};

export default InvitePage;
