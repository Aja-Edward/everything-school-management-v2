export type StudentFormData = {
  photo: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  gender: string;
  bloodGroup: string;
  dateOfBirth: string;
  placeOfBirth: string;
  academicYear: string;
  education_level: string;
  student_class: string;  // This will now hold the Class/GradeLevel ID
  section: string;         // This will hold the Section ID
  stream: string;          // This will hold the Stream ID
  registration_number: string;
  existing_parent_id: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhoneNumber: string;
  parentAddress: string;
  address: string;
  phoneNumber: string;
  paymentMethod: string;
  medicalConditions: string;
  specialRequirements: string;
  relationship: string;
  isPrimaryContact: boolean;
  classroom: string;  // Optional - can be removed if backend doesn't need it
};