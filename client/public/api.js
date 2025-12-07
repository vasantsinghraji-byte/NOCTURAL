// Dynamic API URL - works in development AND production
const API_URL = (typeof AppConfig !== 'undefined') ? AppConfig.API_URL : 'http://localhost:5000/api/v1';
let authToken = null;

export const setAuthToken = (token) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

export const clearAuthToken = () => {
  authToken = null;
};

const apiCall = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export const authAPI = {
  register: async (userData) => {
    const response = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    
    if (response.success && response.token) {
      setAuthToken(response.token);
    }
    
    return response;
  },

  login: async (email, password) => {
    const response = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (response.success && response.token) {
      setAuthToken(response.token);
    }
    
    return response;
  },

  logout: () => {
    clearAuthToken();
  }
};

export const dutiesAPI = {
  getDuties: async () => {
    return await apiCall('/duties');
  },

  createDuty: async (dutyData) => {
    return await apiCall('/duties', {
      method: 'POST',
      body: JSON.stringify(dutyData)
    });
  }
};

export const applicationsAPI = {
  getMyApplications: async () => {
    return await apiCall('/applications');
  },

  getDutyApplications: async (dutyId) => {
    return await apiCall(`/applications/duty/${dutyId}`);
  },

  applyForDuty: async (dutyId, coverLetter) => {
    return await apiCall('/applications', {
      method: 'POST',
      body: JSON.stringify({ duty: dutyId, coverLetter })
    });
  },

  updateApplicationStatus: async (applicationId, status) => {
    return await apiCall(`/applications/${applicationId}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }
};