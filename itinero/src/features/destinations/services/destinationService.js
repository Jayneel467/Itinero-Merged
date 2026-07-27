import api from '@/services/api';
import { ENDPOINTS } from '@/services/endpoints';

export const destinationService = {
  getAll: (params) => api.get(ENDPOINTS.DESTINATIONS.LIST, params),
  getTrending: () => api.get(ENDPOINTS.DESTINATIONS.TRENDING),
  getDetails: (id) => api.get(ENDPOINTS.DESTINATIONS.DETAILS(id)),
};

