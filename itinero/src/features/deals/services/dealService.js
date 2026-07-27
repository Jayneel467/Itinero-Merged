import api from '@/services/api';
import { ENDPOINTS } from '@/services/endpoints';

export const dealService = {
  getAll: (params) => api.get(ENDPOINTS.DEALS.LIST, params),
  getFeatured: () => api.get(ENDPOINTS.DEALS.FEATURED),
};

