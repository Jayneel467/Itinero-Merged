import api from '@/services/api';
import { ENDPOINTS } from '@/services/endpoints';

export const authService = {
  login: (credentials) => api.post(ENDPOINTS.AUTH.LOGIN, credentials),
  register: (data) => api.post(ENDPOINTS.AUTH.REGISTER, data),
  logout: () => api.post(ENDPOINTS.AUTH.LOGOUT),
  getProfile: () => api.get(ENDPOINTS.AUTH.PROFILE),
};

