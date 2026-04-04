export interface Student {
  id: number;
  full_name: string;
  registration_number?: string;
  username?: string;
  is_active: boolean;
  gender?: string;
  age?: number;
}

export interface Period {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  order: number;
}

export interface TimetableSlot {
  id?: number;
  period_number: number;
  day_of_week: string;
  subject_id: number;
  subject_name: string;
  subject_code?: string;
  teacher_id: number;
  teacher_name: string;
  start_time: string;
  end_time: string;
}

export interface SlotForm {
  subject_id: number | '';
  teacher_id: number | '';
}