class AuthService {
    // Dynamic API URL - works in development AND production
    static API_URL = (typeof AppConfig !== 'undefined') ? AppConfig.API_URL : 'http://localhost:5000/api/v1';
    static TOKEN_KEY = 'token';
    static USER_KEY = 'user';

    static async login(email, password) {
        try {
            const response = await fetch(`${this.API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include' // For secure cookies
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            this.setSession(data);
            return data;
        } catch (error) {
            console.error('Auth error:', error);
            throw error;
        }
    }

    static async register(userData) {
        try {
            const response = await fetch(`${this.API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Registration failed');
            }

            const data = await response.json();
            this.setSession(data);
            return data;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    static setSession(authData) {
        if (authData.token) {
            localStorage.setItem(this.TOKEN_KEY, authData.token);
            localStorage.setItem(this.USER_KEY, JSON.stringify(authData.user));
        }
    }

    static clearSession() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        localStorage.removeItem('userType');
    }

    static isAuthenticated() {
        return !!localStorage.getItem(this.TOKEN_KEY);
    }
}
