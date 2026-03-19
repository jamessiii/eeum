interface DiagnosisReadyInput {
  hasTransactions: boolean;
  postImportReady: boolean;
  monthlyNetIncome: number;
}

export function isDiagnosisReady(input: DiagnosisReadyInput) {
  return input.hasTransactions && input.postImportReady && input.monthlyNetIncome > 0;
}
