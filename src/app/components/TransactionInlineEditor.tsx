import { AppSelect } from "./AppSelect";
import { SOURCE_TYPE_OPTIONS, getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import type { Account, Card, Person, Transaction } from "../../shared/types/models";

export interface TransactionEditDraft {
  sourceType: Transaction["sourceType"];
  ownerPersonId: string;
  accountId: string;
  cardId: string;
  occurredAt: string;
  settledAt: string;
  merchantName: string;
  description: string;
  amount: string;
}

interface TransactionInlineEditorProps {
  draft: TransactionEditDraft;
  people: Person[];
  accounts: Account[];
  cards: Card[];
  ownerDisabled?: boolean;
  saveDisabled: boolean;
  onDraftChange: (patch: Partial<TransactionEditDraft>) => void;
  onSourceTypeChange: (sourceType: Transaction["sourceType"]) => void;
  onAccountSelect: (accountId: string) => void;
  onCardSelect: (cardId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function TransactionInlineEditor({
  draft,
  people,
  accounts,
  cards,
  ownerDisabled = false,
  saveDisabled,
  onDraftChange,
  onSourceTypeChange,
  onAccountSelect,
  onCardSelect,
  onSave,
  onCancel,
}: TransactionInlineEditorProps) {
  const accountSharedMap = new Map(accounts.map((account) => [account.id, account.isShared]));

  return (
    <div className="review-summary-panel mt-3">
      <div className="review-summary-copy">
        <strong>이 거래 기본 정보 수정</strong>
        <p className="mb-0 text-secondary">
          수단, 사용자, 계좌, 카드, 사용일, 결제일, 가맹점, 설명, 금액을 바로 수정할 수 있습니다.
        </p>
      </div>
      <div className="d-flex flex-column gap-2 w-100">
        <div className="d-flex flex-wrap gap-2">
          <AppSelect
            size="sm"
            value={draft.sourceType}
            onChange={(nextValue) => onSourceTypeChange(nextValue as Transaction["sourceType"])}
            options={SOURCE_TYPE_OPTIONS.map((sourceType) => ({
              value: sourceType,
              label: getSourceTypeLabel(sourceType),
            }))}
            ariaLabel="거래 수단"
          />
          <AppSelect
            size="sm"
            value={draft.ownerPersonId}
            disabled={ownerDisabled}
            onChange={(nextValue) => onDraftChange({ ownerPersonId: nextValue })}
            placeholder="사용자 선택 없음"
            options={people.map((person) => ({ value: person.id, label: person.displayName || person.name }))}
            ariaLabel="거래 사용자"
          />
          <AppSelect
            size="sm"
            value={draft.accountId}
            onChange={onAccountSelect}
            placeholder="계좌 연결 없음"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.alias || account.name}${account.isShared ? " (공동)" : ""}`,
            }))}
            ariaLabel="거래 계좌"
          />
          <AppSelect
            size="sm"
            value={draft.cardId}
            onChange={onCardSelect}
            placeholder="카드 연결 없음"
            options={cards.map((card) => ({
              value: card.id,
              label: `${card.name}${card.linkedAccountId && accountSharedMap.get(card.linkedAccountId) ? " (공동 계좌)" : ""}`,
            }))}
            ariaLabel="거래 카드"
          />
        </div>
        {ownerDisabled ? (
          <div className="small text-secondary">공유 계좌에 연결된 거래라서 사용자는 공동으로 고정됩니다.</div>
        ) : null}
        <div className="d-flex flex-wrap gap-2">
          <input className="form-control form-control-sm" type="date" value={draft.occurredAt} onChange={(event) => onDraftChange({ occurredAt: event.target.value })} />
          <input className="form-control form-control-sm" type="date" value={draft.settledAt} onChange={(event) => onDraftChange({ settledAt: event.target.value })} />
        </div>
        <input
          className="form-control form-control-sm"
          value={draft.merchantName}
          onChange={(event) => onDraftChange({ merchantName: event.target.value })}
          placeholder="가맹점 또는 거래명"
        />
        <input
          className="form-control form-control-sm"
          value={draft.description}
          onChange={(event) => onDraftChange({ description: event.target.value })}
          placeholder="설명"
        />
        <input
          className="form-control form-control-sm"
          type="number"
          min="0"
          step="1"
          value={draft.amount}
          onChange={(event) => onDraftChange({ amount: event.target.value })}
          placeholder="금액"
        />
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" type="button" disabled={saveDisabled} onClick={onSave}>
            기본 정보 저장
          </button>
          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
