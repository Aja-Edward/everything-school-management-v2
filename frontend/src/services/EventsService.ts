/**
 * Events Service
 *
 * Manages school events including creation, publishing, image management, and more.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Event {
  id: number;
  title: string;
  description: string;
  event_type: 'SPORTS' | 'CULTURAL' | 'ACADEMIC' | 'SOCIAL' | 'OTHER';
  event_type_display: string;
  location: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  organizer: string;
  is_published: boolean;
  is_active: boolean;
  images: EventImage[];
  created_at: string;
  updated_at: string;
}

export interface CreateEventData {
  title: string;
  description: string;
  event_type: 'SPORTS' | 'CULTURAL' | 'ACADEMIC' | 'SOCIAL' | 'OTHER';
  location: string;
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  organizer: string;
  is_published?: boolean;
  is_active?: boolean;
}

export interface UpdateEventData extends Partial<CreateEventData> {}

export interface EventFilters {
  event_type?: string;
  is_published?: boolean;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface EventImage {
  id: number;
  event: number;
  image: string; // URL to the image
  caption: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEventImageData {
  event: number;
  image: File | string; // File for upload or URL
  caption?: string;
  order?: number;
}

export interface UpdateEventImageData {
  caption?: string;
  order?: number;
}

export interface ReorderImagesData {
  image_ids: number[]; // Array of image IDs in the desired order
}

// ============================================================================
// EVENTS SERVICE
// ============================================================================

class EventsService {
  // ============================================================================
  // EVENT MANAGEMENT
  // ============================================================================

  /**
   * Get all events
   */
  async getEvents(params?: EventFilters): Promise<Event[]> {
    try {
      const response = await api.get('/api/events/events/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }

  /**
   * Get a single event by ID
   */
  async getEvent(id: number): Promise<Event> {
    try {
      const response = await api.get(`/api/events/events/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new event
   */
  async createEvent(data: CreateEventData): Promise<Event> {
    try {
      const response = await api.post('/api/events/events/', data);
      return response;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  /**
   * Update an event
   */
  async updateEvent(id: number, data: UpdateEventData): Promise<Event> {
    try {
      const response = await api.patch(`/api/events/events/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(id: number): Promise<void> {
    try {
      await api.delete(`/api/events/events/${id}/`);
    } catch (error) {
      console.error(`Error deleting event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Publish an event
   */
  async publishEvent(id: number): Promise<{ message: string; event: Event }> {
    try {
      const response = await api.post(`/api/events/events/${id}/publish/`, {});
      return response;
    } catch (error) {
      console.error(`Error publishing event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Unpublish an event
   */
  async unpublishEvent(id: number): Promise<{ message: string; event: Event }> {
    try {
      const response = await api.post(`/api/events/events/${id}/unpublish/`, {});
      return response;
    } catch (error) {
      console.error(`Error unpublishing event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Activate an event
   */
  async activateEvent(id: number): Promise<{ message: string; event: Event }> {
    try {
      const response = await api.post(`/api/events/events/${id}/activate/`, {});
      return response;
    } catch (error) {
      console.error(`Error activating event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate an event
   */
  async deactivateEvent(id: number): Promise<{ message: string; event: Event }> {
    try {
      const response = await api.post(`/api/events/events/${id}/deactivate/`, {});
      return response;
    } catch (error) {
      console.error(`Error deactivating event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an image from an event
   */
  async deleteEventImage(eventId: number, imageId: number): Promise<{ message: string }> {
    try {
      const response = await api.post(`/api/events/events/${eventId}/delete_image/`, {
        image_id: imageId,
      });
      return response;
    } catch (error) {
      console.error(`Error deleting image ${imageId} from event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Reorder images for an event
   */
  async reorderEventImages(eventId: number, data: ReorderImagesData): Promise<{ message: string; event: Event }> {
    try {
      const response = await api.post(`/api/events/events/${eventId}/reorder_images/`, data);
      return response;
    } catch (error) {
      console.error(`Error reordering images for event ${eventId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // EVENT IMAGE MANAGEMENT
  // ============================================================================

  /**
   * Get all event images
   */
  async getEventImages(params?: { event?: number }): Promise<EventImage[]> {
    try {
      const response = await api.get('/api/events/event-images/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching event images:', error);
      throw error;
    }
  }

  /**
   * Get a single event image by ID
   */
  async getEventImage(id: number): Promise<EventImage> {
    try {
      const response = await api.get(`/api/events/event-images/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching event image ${id}:`, error);
      throw error;
    }
  }

  /**
   * Upload a new event image
   */
  async uploadEventImage(data: CreateEventImageData): Promise<EventImage> {
    try {
      // If image is a File, use FormData
      if (data.image instanceof File) {
        const formData = new FormData();
        formData.append('event', data.event.toString());
        formData.append('image', data.image);
        if (data.caption) formData.append('caption', data.caption);
        if (data.order !== undefined) formData.append('order', data.order.toString());

        const response = await fetch('/api/events/event-images/', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Image upload failed' }));
          throw new Error(error.detail || `HTTP error! status: ${response.status}`);
        }

        return response.json();
      } else {
        // If image is a URL string
        const response = await api.post('/api/events/event-images/', data);
        return response;
      }
    } catch (error) {
      console.error('Error uploading event image:', error);
      throw error;
    }
  }

  /**
   * Update an event image
   */
  async updateEventImage(id: number, data: UpdateEventImageData): Promise<EventImage> {
    try {
      const response = await api.patch(`/api/events/event-images/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating event image ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an event image (via EventImage endpoint)
   */
  async deleteEventImageDirect(id: number): Promise<void> {
    try {
      await api.delete(`/api/events/event-images/${id}/`);
    } catch (error) {
      console.error(`Error deleting event image ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get published events (using dedicated backend endpoint)
   */
  async getPublishedEvents(params?: EventFilters): Promise<Event[]> {
    try {
      const response = await api.get('/api/events/events/published/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching published events:', error);
      throw error;
    }
  }

  /**
   * Get the currently active event for public display
   */
  async getActiveEvent(): Promise<Event> {
    try {
      const response = await api.get('/api/events/events/active/');
      return response;
    } catch (error) {
      console.error('Error fetching active event:', error);
      throw error;
    }
  }

  /**
   * Get events created by the current user
   */
  async getMyEvents(params?: EventFilters): Promise<Event[]> {
    try {
      const response = await api.get('/api/events/events/my_events/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching my events:', error);
      throw error;
    }
  }

  /**
   * Get unpublished events (drafts)
   */
  async getDraftEvents(params?: EventFilters): Promise<Event[]> {
    return this.getEvents({ ...params, is_published: false });
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: string, params?: EventFilters): Promise<Event[]> {
    return this.getEvents({ ...params, event_type: eventType, is_published: true, is_active: true });
  }

  /**
   * Get upcoming events
   * Returns published events starting from today onwards
   */
  async getUpcomingEvents(params?: EventFilters): Promise<Event[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getEvents({
      ...params,
      start_date: today,
      is_published: true,
      is_active: true,
    });
  }

  /**
   * Get past events
   * Returns published events that have ended
   */
  async getPastEvents(params?: EventFilters): Promise<Event[]> {
    const today = new Date().toISOString().split('T')[0];
    const events = await this.getEvents({
      ...params,
      is_published: true,
      is_active: true,
    });

    // Filter events where end_date (or start_date if no end_date) is before today
    return events.filter(event => {
      const eventDate = event.end_date || event.start_date;
      return eventDate < today;
    });
  }

  /**
   * Get current events
   * Returns published events happening today or currently ongoing
   */
  async getCurrentEvents(params?: EventFilters): Promise<Event[]> {
    const today = new Date().toISOString().split('T')[0];
    const events = await this.getEvents({
      ...params,
      is_published: true,
      is_active: true,
    });

    // Filter events where start_date <= today and (end_date >= today or no end_date)
    return events.filter(event => {
      const startDate = event.start_date;
      const endDate = event.end_date || startDate;
      return startDate <= today && endDate >= today;
    });
  }

  /**
   * Get images for a specific event
   */
  async getImagesForEvent(eventId: number): Promise<EventImage[]> {
    return this.getEventImages({ event: eventId });
  }

  /**
   * Upload multiple images to an event
   */
  async uploadMultipleImages(eventId: number, files: File[]): Promise<EventImage[]> {
    try {
      const promises = files.map((file, index) =>
        this.uploadEventImage({
          event: eventId,
          image: file,
          order: index + 1,
        })
      );
      return await Promise.all(promises);
    } catch (error) {
      console.error(`Error uploading multiple images to event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Create event with images
   * Creates an event and immediately uploads associated images
   */
  async createEventWithImages(
    eventData: CreateEventData,
    images: File[]
  ): Promise<{ event: Event; images: EventImage[] }> {
    try {
      // Create the event
      const event = await this.createEvent(eventData);

      // Upload images if provided
      let uploadedImages: EventImage[] = [];
      if (images.length > 0) {
        uploadedImages = await this.uploadMultipleImages(event.id, images);
      }

      return { event, images: uploadedImages };
    } catch (error) {
      console.error('Error creating event with images:', error);
      throw error;
    }
  }

  /**
   * Bulk publish events
   */
  async bulkPublishEvents(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.publishEvent(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk publishing events:', error);
      throw error;
    }
  }

  /**
   * Bulk delete events
   */
  async bulkDeleteEvents(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.deleteEvent(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk deleting events:', error);
      throw error;
    }
  }
}

export const eventsService = new EventsService();
export default eventsService;
