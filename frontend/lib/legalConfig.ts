export interface LegalConfig {
  legalEntityName: string;
  registeredAddress: string;
  supportEmail: string;
  privacyEmail: string;
  grievanceOfficerName: string;
  contactPhone: string;
  gstin?: string;
  jurisdictionCityState: string;
  effectiveDate: string;
  lastUpdatedDate: string;
}

export const REQUIRED_LEGAL_KEYS: (keyof LegalConfig)[] = [
  "legalEntityName",
  "registeredAddress",
  "supportEmail",
  "privacyEmail",
  "grievanceOfficerName",
  "jurisdictionCityState",
];

export const legalConfig: LegalConfig = {
  legalEntityName: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || "Nadha Labs",
  registeredAddress: process.env.NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS || "Kerala, India",
  supportEmail: process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL || "support@omlu.app",
  privacyEmail: process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL || "privacy@omlu.app",
  grievanceOfficerName: process.env.NEXT_PUBLIC_LEGAL_GRIEVANCE_OFFICER || "Grievance Officer, Nadha Labs",
  contactPhone: process.env.NEXT_PUBLIC_LEGAL_CONTACT_PHONE || "+91-0000000000",
  gstin: process.env.NEXT_PUBLIC_LEGAL_GSTIN || undefined,
  jurisdictionCityState: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "Ernakulam, Kerala, India",
  effectiveDate: "7 August 2026",
  lastUpdatedDate: "7 August 2026",
};

export function getUnresolvedPlaceholders(config: LegalConfig = legalConfig): string[] {
  const unresolved: string[] = [];
  for (const key of REQUIRED_LEGAL_KEYS) {
    const val = config[key];
    if (!val || val.includes("[") || val.includes("]")) {
      unresolved.push(key);
    }
  }
  return unresolved;
}

export function verifyLegalConfigSafety(config: LegalConfig = legalConfig): { valid: boolean; unresolved: string[] } {
  const unresolved = getUnresolvedPlaceholders(config);
  return {
    valid: unresolved.length === 0,
    unresolved,
  };
}
