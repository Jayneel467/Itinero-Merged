import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

export const authService = {
  // SMTP delivery can take 15-30s - use a longer timeout than default search calls.
  sendOtp: (identifier) =>
    api.post(ENDPOINTS.AUTH.OTP_SEND, { identifier }, { timeoutMs: 90_000 }),
  verifyOtp: (identifier, code) =>
    api.post(ENDPOINTS.AUTH.OTP_VERIFY, { identifier, code }, { timeoutMs: 45_000 }),
  loginWithGoogle: (idToken) =>
    api.post(ENDPOINTS.AUTH.GOOGLE, { id_token: idToken }, { timeoutMs: 45_000 }),
  login: (credentials) => api.post(ENDPOINTS.AUTH.LOGIN, credentials),
  register: (data) => api.post(ENDPOINTS.AUTH.REGISTER, data, { timeoutMs: 45_000 }),
  logout: () => api.post(ENDPOINTS.AUTH.LOGOUT),
  getProfile: () => api.get(ENDPOINTS.AUTH.PROFILE),
  updateProfile: (data) => api.put(ENDPOINTS.AUTH.PROFILE, data),
};
