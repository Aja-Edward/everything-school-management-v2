// Utility to check authentication status and debug classroom form issues
export const checkAuthStatus = () => {
  const userData = localStorage.getItem('userData');

  if (userData) {
    try {
      const user = JSON.parse(userData);
      console.log('User role:', user.role);
      console.log('User email:', user.email);
    } catch (e) {
      console.log('Error parsing user data:', e);
    }
  }

  return { userData };
};

export const testClassroomAPI = async () => {
  try {
    const response = await fetch('http://localhost:8000/api/classrooms/sections/', {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Sections API working:', data);
    } else {
      console.error('❌ Sections API failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Sections API error:', error);
  }
};