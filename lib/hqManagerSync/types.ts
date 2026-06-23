export type HqManagerSyncPayload = {
  spreadsheetId: string;
  sheetName: string;
  rowNumber: number;
  newManagerName: string;
  customerName: string;
  phone: string;
  eventId: string;
};

export type HqManagerAssignResult = {
  ok: boolean;
  eventId: string;
  assignmentComplete: boolean;
  syncComplete: boolean;
  rowNumber?: number;
  syncError?: string;
  message?: string;
  cached?: boolean;
};
