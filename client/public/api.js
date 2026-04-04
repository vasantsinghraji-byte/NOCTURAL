const getApiUrl = (endpoint) => {
  const normalizedEndpoint = endpoint.replace(/^\//, '');

  if (typeof AppConfig !== 'undefined' && typeof AppConfig.api === 'function') {
    return AppConfig.api(normalizedEndpoint);
  }

  return `/api/v1/${normalizedEndpoint}`;
};

const requestWithAppConfig = (endpoint, options = {}) => {
  const normalizedEndpoint = endpoint.replace(/^\//, '');

  if (typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function') {
    return AppConfig.fetch(normalizedEndpoint, options);
  }

  const requestOptions = { ...options };
  const shouldParseJson = requestOptions.parseJson === true;
  const shouldParseText = requestOptions.parseText === true;

  delete requestOptions.parseJson;
  delete requestOptions.parseText;

  return fetch(getApiUrl(normalizedEndpoint), requestOptions).then(async (response) => {
    if (!shouldParseJson) {
      if (!shouldParseText) {
        return response;
      }

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || 'Something went wrong');
      }

      return text;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error((data && data.message) || 'Something went wrong');
    }

    return data;
  });
};

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
    parseJson: true,
    headers
  };

  try {
    return await requestWithAppConfig(endpoint, config);
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
