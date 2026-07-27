import api from '@/services/api';
import { ENDPOINTS } from '@/services/endpoints';

export const bookingService = {
  create: (data) => api.post(ENDPOINTS.BOOKINGS.CREATE, data),
  getDetails: (id) => api.get(ENDPOINTS.BOOKINGS.DETAILS(id)),
  getMyBookings: () => api.get(ENDPOINTS.BOOKINGS.MY_BOOKINGS),
  cancel: (id) => api.post(ENDPOINTS.BOOKINGS.CANCEL(id)),
};

