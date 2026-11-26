import type { Asset, Loan, LoanStatus } from '../types';

export function isApprovedLoanStatus(status: LoanStatus): boolean {
  return status === 'Disetujui' || status === 'Dipinjam' || status === 'Dikembalikan';
}

export function isReturnableLoanStatus(status: LoanStatus): boolean {
  return status === 'Disetujui' || status === 'Dipinjam';
}

export function getLoanRefCode(loanId: string): string {
  return loanId.slice(0, 10).toUpperCase();
}

export function buildLoanQrPayload(loan: Loan): string {
  return JSON.stringify({
    type: 'SIPALAK_LOAN',
    loanId: loan.id,
    refCode: getLoanRefCode(loan.id),
    code: loan.assetCode,
    assetId: loan.assetId,
    assetName: loan.assetName,
    borrower: loan.borrowerName,
    status: loan.status,
  });
}

export interface ParsedScanResult {
  raw: string;
  loanId?: string;
  refCode?: string;
  assetCode?: string;
}

export function parseScannedIdentifier(rawValue: string): ParsedScanResult {
  const raw = rawValue.trim();
  if (!raw) return { raw: '' };

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as {
        loanId?: unknown;
        refCode?: unknown;
        code?: unknown;
        assetCode?: unknown;
      };
      return {
        raw,
        loanId: typeof parsed.loanId === 'string' && parsed.loanId.trim() ? parsed.loanId.trim() : undefined,
        refCode:
          typeof parsed.refCode === 'string' && parsed.refCode.trim()
            ? parsed.refCode.trim()
            : undefined,
        assetCode:
          typeof parsed.code === 'string' && parsed.code.trim()
            ? parsed.code.trim()
            : typeof parsed.assetCode === 'string' && parsed.assetCode.trim()
              ? parsed.assetCode.trim()
              : undefined,
      };
    } catch {
      // Fallback to raw text
    }
  }

  return { raw };
}

export function findMatchingLoanForScan(
  loans: Loan[],
  assets: Asset[],
  parsed: ParsedScanResult,
  canAccessLoan: (loan: Loan) => boolean,
  options?: { allowAssetCodeMatch?: boolean }
): {
  returnableLoan: Loan | null;
  otherStatusLoan: Loan | null;
  foundAsset: Asset | null;
  matchedAssetOnly: boolean;
  displayCode: string;
} {
  const allowAssetCodeMatch = options?.allowAssetCodeMatch ?? true;
  const candidates = [parsed.loanId, parsed.refCode, parsed.assetCode, parsed.raw]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim());

  const displayCode = candidates[0] || '';
  if (candidates.length === 0) {
    return {
      returnableLoan: null,
      otherStatusLoan: null,
      foundAsset: null,
      matchedAssetOnly: false,
      displayCode: '',
    };
  }

  const normalizedCandidates = candidates.map((c) => c.toLowerCase());
  const accessibleLoans = loans.filter(canAccessLoan);

  const matchesLoan = (loan: Loan, assetMatch: Asset | null): boolean => {
    const loanIdLower = loan.id.toLowerCase();
    const refLower = getLoanRefCode(loan.id).toLowerCase();
    const assetCodeLower = loan.assetCode.toLowerCase();
    const assetIdLower = loan.assetId.toLowerCase();

    return normalizedCandidates.some(
      (q) =>
        loanIdLower === q ||
        refLower === q ||
        (allowAssetCodeMatch &&
          (assetCodeLower === q ||
            assetIdLower === q ||
            (assetMatch ? loan.assetId === assetMatch.id : false)))
    );
  };

  const foundAsset =
    assets.find((a) => {
      const codeLower = a.code.toLowerCase();
      const idLower = a.id.toLowerCase();
      return normalizedCandidates.some((q) => codeLower === q || idLower === q);
    }) ?? null;

  const dipinjamLoans = accessibleLoans.filter((l) => l.status === 'Dipinjam');
  const disetujuiLoans = accessibleLoans.filter((l) => l.status === 'Disetujui');

  const exactIdMatch = (list: Loan[]) =>
    list.find((l) => {
      const idLower = l.id.toLowerCase();
      const refLower = getLoanRefCode(l.id).toLowerCase();
      return normalizedCandidates.some((q) => idLower === q || refLower === q);
    }) ?? null;

  let returnableLoan: Loan | null = exactIdMatch(dipinjamLoans);
  if (!returnableLoan && allowAssetCodeMatch) {
    returnableLoan = dipinjamLoans.find((l) => matchesLoan(l, foundAsset)) ?? null;
  }
  if (!returnableLoan) {
    returnableLoan = exactIdMatch(disetujuiLoans);
  }
  if (!returnableLoan && allowAssetCodeMatch) {
    returnableLoan = disetujuiLoans.find((l) => matchesLoan(l, foundAsset)) ?? null;
  }

  if (returnableLoan) {
    return {
      returnableLoan,
      otherStatusLoan: null,
      foundAsset: foundAsset ?? assets.find((a) => a.id === returnableLoan.assetId) ?? null,
      matchedAssetOnly: false,
      displayCode,
    };
  }

  let otherStatusLoan: Loan | null = exactIdMatch(accessibleLoans);
  if (!otherStatusLoan && allowAssetCodeMatch) {
    otherStatusLoan = accessibleLoans.find((l) => matchesLoan(l, foundAsset)) ?? null;
  }

  const matchedAssetOnly = !allowAssetCodeMatch && Boolean(foundAsset);

  return {
    returnableLoan: null,
    otherStatusLoan,
    foundAsset,
    matchedAssetOnly,
    displayCode,
  };
}
