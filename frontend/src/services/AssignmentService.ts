import api, { API_BASE_URL, buildUploadHeaders, handleResponseError } from './api';

export interface Assignment {
  id: number;
  classroom: number;
  classroom_name: string;
  section_name: string;
  subject: number | null;
  subject_name: string | null;
  teacher_name: string | null;
  title: string;
  instructions: string;
  due_date: string; // YYYY-MM-DD
  is_overdue: boolean;
  attachment_url: string;
  attachment_name: string;
  can_edit: boolean;
  can_delete: boolean; // the author, or an admin
  /** The student's own hand-in, or the child's the list was asked about. */
  submission: Submission | null;
  submission_count: number | null; // teachers and admins only
  student_count: number | null; // teachers and admins only
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: number;
  assignment: number;
  student: number;
  student_name: string;
  text: string;
  attachment_url: string;
  attachment_name: string;
  submitted_at: string;
  is_late: boolean;
  grade: string;
  feedback: string;
  is_graded: boolean; // once marked, the student can no longer change it
  graded_by_name: string | null;
  graded_at: string | null;
}

export interface SubmissionInput {
  text?: string;
  attachment?: File | null;
  remove_attachment?: boolean;
}

export interface ClassSubmissions {
  can_grade: boolean;
  students: { student_id: number; student_name: string; submission: Submission | null }[];
}

export interface TeachingOption {
  id: number;
  name: string;
  section_name: string;
  leads_class: boolean; // may set work with no subject
  subjects: { id: number; name: string }[];
}

export interface ChildAssignments {
  student_id: number;
  student_name: string;
  classrooms: { id: number; name: string; section_name: string }[];
  assignments: Assignment[];
}

export interface AssignmentInput {
  classroom: number;
  subject: number | null;
  title: string;
  instructions: string;
  due_date: string;
  attachment?: File | null;
  remove_attachment?: boolean;
}

const BASE = `${API_BASE_URL.replace(/\/$/, '')}/assignments/`;

// Sent as multipart so an attachment can ride along; an empty subject means
// "no subject", which the API takes as null.
const toFormData = (input: Partial<AssignmentInput> | SubmissionInput): FormData => {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'attachment') {
      if (value instanceof File) form.append('attachment', value);
      return;
    }
    form.append(key, value === null ? '' : String(value));
  });
  return form;
};

const send = async <T = Assignment>(
  method: 'POST' | 'PATCH',
  url: string,
  input: Partial<AssignmentInput> | SubmissionInput,
): Promise<T> => {
  const response = await fetch(url, {
    method,
    body: toFormData(input),
    credentials: 'include',
    headers: await buildUploadHeaders(method),
  });
  if (!response.ok) await handleResponseError(response, url, method);
  return response.json() as Promise<T>;
};

const AssignmentService = {
  list: (params?: { classroom?: number; subject?: number; student?: number }): Promise<Assignment[]> =>
    api.get('/api/assignments/', params),

  teachingOptions: (): Promise<TeachingOption[]> =>
    api.get('/api/assignments/teaching-options/'),

  forMyChildren: (): Promise<ChildAssignments[]> =>
    api.get('/api/assignments/children/'),

  create: (input: AssignmentInput) => send('POST', BASE, input),

  update: (id: number, input: Partial<AssignmentInput>) => send('PATCH', `${BASE}${id}/`, input),

  remove: (id: number) => api.delete(`/api/assignments/${id}/`),

  /** A student hands in work, or replaces it until it is marked. */
  submit: (id: number, input: SubmissionInput) => send<Submission>('POST', `${BASE}${id}/submit/`, input),

  /** The class list for one assignment, each pupil with their hand-in. */
  submissions: (id: number): Promise<ClassSubmissions> =>
    api.get(`/api/assignments/${id}/submissions/`),

  /** Blank grade and feedback hand the work back to the student. */
  grade: (id: number, submission: number, grade: string, feedback: string): Promise<Submission> =>
    api.post(`/api/assignments/${id}/grade/`, { submission, grade, feedback }),
};

/** Today in the school's timezone, as the API compares due dates. */
export const todayInLagos = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

export const formatDueDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Upcoming first (soonest due), then overdue (most recent first). */
export const sortForReading = (items: Assignment[]): Assignment[] => {
  const upcoming = items.filter((a) => !a.is_overdue).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdue = items.filter((a) => a.is_overdue).sort((a, b) => b.due_date.localeCompare(a.due_date));
  return [...upcoming, ...overdue];
};

/** A DRF error body as one readable line. */
export const describeError = (error: any, fallback: string): string => {
  const data = error?.response?.data;
  if (data && typeof data === 'object') {
    const first = Object.values(data)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string') return first;
  }
  return error?.message || fallback;
};

export default AssignmentService;
