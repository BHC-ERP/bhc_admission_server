const PROGRAM_DURATION: Record<string, number> = {
  UG: 3,
  PG: 2,
  Integrated: 5,
  "B.Voc": 3,
  Diploma: 2,
  Certificate: 1,
  PhD: 3,
  "8": 5,
  "9": 3,
  "1": 3,
  "2": 2,
};

export function deriveBatch(academicYear: string, programType: string): string {
  if (!academicYear) return "";
  const startYear = parseInt(academicYear.split("-")[0]);
  if (isNaN(startYear)) return "";
  const duration = PROGRAM_DURATION[programType] || 3;
  return `${startYear}-${startYear + duration}`;
}

function pickStr(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function pickNum(...vals: (number | undefined | null)[]): number {
  for (const v of vals) {
    if (v != null && !isNaN(v)) return v;
  }
  return 0;
}

function pickBool(...vals: (boolean | undefined | null)[]): boolean {
  for (const v of vals) {
    if (v != null) return v;
  }
  return false;
}

function flattenAddress(addr: any): any {
  if (!addr) return null;
  const line1 = [addr.door_no, addr.street].filter(Boolean).join(", ");
  const line2 = [addr.area, addr.landmark].filter(Boolean).join(", ");
  return {
    address_line1: line1 || "",
    address_line2: line2 || "",
    city: addr.village_town || addr.district || "",
    state: addr.state || "",
    pincode: addr.pincode || "",
    country: addr.country || "India",
  };
}

export function buildPersonalInfo(candidate: any): any {
  const pd = candidate.personal_details || {};
  return {
    dob: pd.dateOfBirth || null,
    gender: pd.gender || "",
    blood_group: pd.bloodGroup || "",
    nationality: pd.nationality || "Indian",
    religion: pd.religion || "",
    community: pd.community || "",
    caste: pd.caste || "",
    denom: pd.christianDenomination || "",
    denom_group: "",
    diocese: pd.diocese || "",
    aadhar: pd.aadharNumber || "",
    passport_number: pd.passportNumber || "",
    epic_voter_no: "",
    first_graduation: pickBool(
      candidate.academic_background?.school_education?.is_first_generation_learner
    ),
    physically_challenged: pickBool(pd.differentlyAbled),
    disability_type: pd.differentlyAbledType || "",
    disability_percent: pd.differentlyAbledPercentage != null ? String(pd.differentlyAbledPercentage) : "",
    mother_tongue: candidate.parents?.mother_tongue || "",
  };
}

export function buildFamily(candidate: any): any {
  const p = candidate.parents || {};
  const g = p.guardian || {};
  return {
    ex_service: pickBool(candidate.personal_details?.childOfExServicemen),
    ex_grade: "Nil",
    father: {
      name: p.father_name || "",
      occupation: p.father_occupation || "",
      mobile_no: p.father_mobile || "",
      email: "",
      income: p.father_income ? Number(p.father_income) : 0,
    },
    mother: {
      name: p.mother_name || "",
      occupation: p.mother_occupation || "",
      mobile_no: p.mother_mobile || "",
      email: "",
      income: p.mother_income ? Number(p.mother_income) : 0,
    },
    guardian: {
      name: g.guardian_name || "",
      relationship: g.guardian_relation || "",
      mobile_no: g.guardian_mobile || "",
      email: "",
      is_orphan: pickBool(g.is_orphan),
      is_semi_orphan: pickBool(g.is_semi_orphan),
      is_deserted: pickBool(g.is_deserted),
    },
  };
}

export function buildContact(candidate: any): any {
  const pd = candidate.personal_details || {};
  const addr = candidate.address || {};
  return {
    student_email: pd.email || "",
    mobile_no: pd.phone ? Number(pd.phone) : null,
    alternate_mobile_no: null,
    address: {
      communication: flattenAddress(addr.present_address) || {},
      permanent: addr.permanent_address?.same_as_present
        ? flattenAddress(addr.present_address) || {}
        : flattenAddress(addr.permanent_address) || {},
    },
  };
}

export function buildAcademicInfo(candidate: any): any[] {
  const result: any[] = [];
  const ab = candidate.academic_background || {};
  const se = ab.school_education || {};
  const ug = ab.undergraduate_education || [];

  const addSchoolEntry = (key: "tenth" | "twelfth", qualification: string) => {
    const s = se[key];
    if (!s) return;
    const sad = s.school_address_details || {};
    result.push({
      qualification,
      institution: s.school_name || "",
      board: s.board || "",
      year_of_passing: s.year_of_passing || null,
      percentage: s.marks?.percentage || 0,
      marksheet: "",
      schooling_type: s.school_type || "",
      study_medium: s.medium || "",
      umis: ab.umis_number || "",
      emis: se.emis_number || "0",
      achievement: [],
      schooling_address: {
        address_type: sad.type || "",
        city: sad.district || "",
        state: sad.state || "",
        pincode: sad.pincode || "",
        country: sad.country || "India",
      },
    });
  };

  const programType = candidate.appliedProgrammeType || candidate.application_preferences?.applications?.find((a: any) => a.status === "ADMITTED")?.application_type;

  if (programType === "PG" || programType === "2") {
    if (ug.length > 0) {
      const u = ug[0];
      result.push({
        qualification: u.degree || "UG Degree",
        institution: u.college || "",
        board: u.university || "",
        year_of_passing: u.year_of_passing || null,
        percentage: u.marks?.overall_percentage || 0,
        marksheet: "",
        schooling_type: "",
        study_medium: "",
        umis: "",
        emis: "0",
        achievement: [],
        schooling_address: null,
      });
    }
  } else {
    addSchoolEntry("tenth", "SSLC");
    addSchoolEntry("twelfth", "HSC");
  }

  return result;
}

export function buildCurrentAcademic(
  candidate: any,
  app: any,
  program: any
): any {
  return {
    section: candidate.section || app?.admission_details?.section || null,
    part_one: null,
    part_five: null,
    umis: candidate.academic_background?.umis_number || "",
    semesters: [],
    extra_curricular: [],
    department_code: program?.department_code || "",
    department_name: program?.department_name || "",
    program_code: app?.program_code || "",
    program_name: (program?.program_name) || app?.program_name || "",
    program_type: app?.application_type || "",
  };
}

export function transformToEnrolledStudent(
  candidate: any,
  app: any,
  program: any
): any {
  const personalInfo = buildPersonalInfo(candidate);
  const family = buildFamily(candidate);
  const contactInfo = buildContact(candidate);

  return {
    registration_number: candidate.registration_number,
    application_no: app?.application_number,
    roll_no: null,
    admission_number: null,
    name: candidate.personal_details?.fullName || "",
    college_id: null,
    stream: app?.stream || "",
    shift: app?.shift || "",
    admission_date: app?.admission_details?.admission_date || null,
    batch: deriveBatch(candidate.academic_year, app?.application_type),
    photo: "",
    personal_info: { ...personalInfo, family },
    contact: contactInfo,
    academic_info: buildAcademicInfo(candidate),
    current_academic: buildCurrentAcademic(candidate, app, program),
    disciplinary: [],
    remarks: "",
    registration_date: (candidate as any).createdAt || null,
    status: "Active",
  };
}
