import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { WorkspaceBundle } from "../../shared/types/models";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const ACCOUNT_USAGE_LABELS: Record<
  "daily" | "salary" | "shared" | "card_payment" | "savings" | "investment" | "loan" | "other",
  string
> = {
  daily: "일반 생활비",
  salary: "급여 수령",
  shared: "공동 자금",
  card_payment: "카드 결제",
  savings: "저축",
  investment: "투자",
  loan: "대출 관리",
  other: "기타",
};

export function ImportsPage() {
  const { commitImportedBundle, previewWorkbookImport, state } = useAppState();
  const navigate = useNavigate();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  const recentImports = [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const latestImport = recentImports[0] ?? null;
  const latestImportAction = latestImport
    ? latestImport.reviewCount > 0
      ? { to: "/reviews", label: `리뷰 ${latestImport.reviewCount}건 확인` }
      : { to: "/transactions", label: "최근 가져온 거래 보기" }
    : { to: "/imports", label: "업로드 준비 보기" };

  const applyPreviewPersonPatch = (
    personId: string,
    patch: Partial<WorkspaceBundle["people"][number]>,
  ) => {
    setPreviewBundle((current) =>
      current
        ? {
            ...current,
            people: current.people.map((person) => (person.id === personId ? { ...person, ...patch } : person)),
          }
        : current,
    );
  };

  const applyPreviewAccountPatch = (
    accountId: string,
    patch: Partial<WorkspaceBundle["accounts"][number]>,
  ) => {
    setPreviewBundle((current) => {
      if (!current) return current;
      const nextAccounts = current.accounts.map((account) => (account.id === accountId ? { ...account, ...patch } : account));
      const nextTransactions = current.transactions.map((transaction) => {
        if (transaction.accountId !== accountId && transaction.fromAccountId !== accountId && transaction.toAccountId !== accountId) {
          return transaction;
        }

        if (patch.ownerPersonId === undefined) return transaction;
        return {
          ...transaction,
          ownerPersonId: transaction.sourceType === "account" ? patch.ownerPersonId : transaction.ownerPersonId,
        };
      });

      return {
        ...current,
        accounts: nextAccounts,
        transactions: nextTransactions,
      };
    });
  };

  const applyPreviewCardPatch = (
    cardId: string,
    patch: Partial<WorkspaceBundle["cards"][number]>,
  ) => {
    setPreviewBundle((current) => {
      if (!current) return current;
      const nextCards = current.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card));
      const nextTransactions = current.transactions.map((transaction) => {
        if (transaction.cardId !== cardId) return transaction;

        return {
          ...transaction,
          ownerPersonId: patch.ownerPersonId !== undefined ? patch.ownerPersonId : transaction.ownerPersonId,
          accountId: patch.linkedAccountId !== undefined ? patch.linkedAccountId : transaction.accountId,
        };
      });

      return {
        ...current,
        cards: nextCards,
        transactions: nextTransactions,
      };
    });
  };

  const previewPeopleMap = new Map(previewBundle?.people.map((person) => [person.id, person.displayName || person.name]) ?? []);
  const previewAccountsMap = new Map(previewBundle?.accounts.map((account) => [account.id, account.alias || account.name]) ?? []);
  const linkedCardCount = previewBundle?.cards.filter((card) => card.linkedAccountId).length ?? 0;
  const ownedCardCount = previewBundle?.cards.filter((card) => card.ownerPersonId).length ?? 0;
  const ownedAccountCount = previewBundle?.accounts.filter((account) => account.ownerPersonId || account.isShared).length ?? 0;
  const missingAccountOwnerCount = previewBundle?.accounts.filter((account) => !account.ownerPersonId && !account.isShared).length ?? 0;
  const missingCardOwnerCount = previewBundle?.cards.filter((card) => !card.ownerPersonId).length ?? 0;
  const missingCardLinkCount = previewBundle?.cards.filter((card) => !card.linkedAccountId).length ?? 0;
  const previewExpenseAmount =
    previewBundle?.transactions.filter((transaction) => transaction.isExpenseImpact).reduce((sum, transaction) => sum + transaction.amount, 0) ?? 0;
  const previewRemainingMappingCount = missingAccountOwnerCount + missingCardOwnerCount + missingCardLinkCount;
  const previewNextAction = previewBundle
    ? previewRemainingMappingCount > 0
      ? {
          title: `아직 ${previewRemainingMappingCount}개의 연결 확인이 남아 있습니다`,
          description: "소유자 없는 계좌, 소유자 없는 카드, 결제 계좌가 비어 있는 카드만 먼저 채우면 거래 연결 해석이 훨씬 자연스럽습니다.",
        }
      : {
          title: "지금 바로 가져와도 되는 상태입니다",
          description: "사람, 계좌, 카드 연결이 모두 채워져 있어서 업로드 후 리뷰와 분류 화면으로 바로 이어가기 좋습니다.",
        }
    : null;
  const previewPostImportPath = previewBundle
    ? previewBundle.reviews.length > 0
      ? "/reviews"
      : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)
        ? "/transactions?cleanup=uncategorized"
        : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && transaction.tagIds.length === 0)
          ? "/transactions?cleanup=untagged"
          : "/transactions"
    : "/transactions";

  const latestImportWorkspaceAction = latestImport
    ? scope.reviews.some((review) => review.status === "open")
      ? { to: "/reviews", label: `리뷰 ${scope.reviews.filter((review) => review.status === "open").length}건 확인` }
      : scope.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)
        ? {
            to: "/transactions?cleanup=uncategorized",
            label: `미분류 ${scope.transactions.filter((transaction) => transaction.isExpenseImpact && !transaction.categoryId).length}건 정리`,
          }
        : scope.transactions.some((transaction) => transaction.isExpenseImpact && transaction.tagIds.length === 0)
          ? {
              to: "/transactions?cleanup=untagged",
              label: `무태그 ${scope.transactions.filter((transaction) => transaction.isExpenseImpact && transaction.tagIds.length === 0).length}건 정리`,
            }
          : latestImportAction
    : latestImportAction;
  const previewPostImportLabel = previewBundle
    ? previewBundle.reviews.length > 0
      ? `리뷰 ${previewBundle.reviews.length}건 확인`
      : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)
        ? "미분류 거래 정리"
        : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && transaction.tagIds.length === 0)
          ? "무태그 거래 정리"
          : "거래 화면 보기"
    : "거래 화면 보기";

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 센터</span>
            <h2 className="section-title">업로드 전에 연결 정보 먼저 잡기</h2>
          </div>
        </div>
        <p className="text-secondary">
          사람, 계좌, 카드 관리 화면에서 만든 구조를 기준으로 업로드 데이터를 정리하는 흐름입니다. 업로드 직후 바로 가져오지 않고, 누가
          쓴 데이터인지와 어떤 카드 또는 계좌에 연결할지를 먼저 확인합니다.
        </p>
        <div className="d-flex flex-wrap gap-2 mb-4">
          <Link to="/people" className="btn btn-outline-secondary btn-sm">
            사람 관리
          </Link>
          <Link to="/accounts" className="btn btn-outline-secondary btn-sm">
            계좌 관리
          </Link>
          <Link to="/cards" className="btn btn-outline-secondary btn-sm">
            카드 관리
          </Link>
        </div>
        <div className="classification-flow-grid">
          <article className="stat-card">
            <span className="stat-label">현재 사람</span>
            <strong>{scope.people.length}명</strong>
            <div className="small text-secondary mt-2">활성 구성원을 먼저 정리해두면 업로드 미리보기에서도 소유자 기준을 맞추기 쉽습니다.</div>
          </article>
          <article className="stat-card">
            <span className="stat-label">현재 계좌</span>
            <strong>{scope.accounts.length}개</strong>
            <div className="small text-secondary mt-2">카드 결제 계좌와 공동 계좌를 구분해두면 매핑 실수가 줄어듭니다.</div>
          </article>
          <article className="stat-card">
            <span className="stat-label">현재 카드</span>
            <strong>{scope.cards.length}개</strong>
            <div className="small text-secondary mt-2">카드 이름과 카드사가 정리돼 있으면 업로드 후 검토량이 줄어듭니다.</div>
          </article>
        </div>

        <label className="upload-dropzone mt-4">
          <div>
            <strong>가계부 워크북 업로드</strong>
            <p className="mb-0 text-secondary">파일을 바로 반영하지 않고, 먼저 사람·계좌·카드 매핑까지 점검할 수 있는 미리보기를 준비합니다.</p>
          </div>
          <input
            hidden
            type="file"
            accept=".xlsx,.xls"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;

              setIsPreparingPreview(true);
              try {
                const bundle = await previewWorkbookImport(file);
                setPreviewBundle(bundle);
                setPreviewFileName(file.name);
              } finally {
                setIsPreparingPreview(false);
                event.currentTarget.value = "";
              }
            }}
          />
        </label>
        {isPreparingPreview ? <p className="small text-secondary mt-3 mb-0">업로드 미리보기와 매핑 데이터를 준비하고 있습니다.</p> : null}
      </section>

      {previewBundle ? (
        <section className="card shadow-sm" style={getMotionStyle(1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">업로드 미리보기</span>
              <h2 className="section-title">{previewFileName} 연결 확인</h2>
            </div>
            <span className="badge text-bg-primary">{activeWorkspace?.name ?? previewBundle.workspace.name}</span>
          </div>
          <p className="text-secondary">
            아래에서 업로드 데이터의 사람, 계좌, 카드 연결을 먼저 맞춘 뒤 <strong>{activeWorkspace?.name ?? "현재 가계부"}</strong>에
            가져오세요. 여기서 맞춘 연결 정보는 거래 소유자와 카드 결제 계좌에도 같이 반영됩니다.
          </p>

          {previewNextAction ? (
            <div className="review-summary-panel mt-4">
              <div className="review-summary-copy">
                <strong>{previewNextAction.title}</strong>
                <p className="mb-0 text-secondary">{previewNextAction.description}</p>
              </div>
              <Link to={previewPostImportPath} className="btn btn-outline-secondary btn-sm">
                업로드 후 {previewPostImportLabel}
              </Link>
            </div>
          ) : null}
          <div className="classification-flow-grid">
            <article className="stat-card">
              <span className="stat-label">거래</span>
              <strong>{previewBundle.transactions.length}건</strong>
              <div className="small text-secondary mt-2">지출 합계 {formatCurrency(previewExpenseAmount)}</div>
            </article>
            <article className="stat-card">
              <span className="stat-label">계좌 소유자</span>
              <strong>{ownedAccountCount}/{previewBundle.accounts.length}</strong>
              <div className="small text-secondary mt-2">공동 계좌 또는 개인 소유자까지 잡힌 계좌 수입니다.</div>
            </article>
            <article className="stat-card">
              <span className="stat-label">카드 연결</span>
              <strong>{linkedCardCount}/{previewBundle.cards.length}</strong>
              <div className="small text-secondary mt-2">소유자 {ownedCardCount}개 · 결제 계좌 {linkedCardCount}개 연결</div>
            </article>
          </div>

          {missingAccountOwnerCount || missingCardOwnerCount || missingCardLinkCount ? (
            <div className="review-summary-panel mt-4">
              <div className="review-summary-copy">
                <strong>가져오기 전에 확인할 매핑이 남아 있습니다</strong>
                <p className="mb-0 text-secondary">
                  빈 매핑이 남아 있으면 거래 소유자나 결제 흐름이 비어 들어올 수 있습니다. 필요한 항목만 먼저 채워주세요.
                </p>
              </div>
              <div className="action-row">
                {missingAccountOwnerCount ? <span className="badge text-bg-warning">소유자 없는 계좌 {missingAccountOwnerCount}개</span> : null}
                {missingCardOwnerCount ? <span className="badge text-bg-warning">소유자 없는 카드 {missingCardOwnerCount}개</span> : null}
                {missingCardLinkCount ? <span className="badge text-bg-warning">결제 계좌 없는 카드 {missingCardLinkCount}개</span> : null}
              </div>
            </div>
          ) : null}

          <div className="section-head mt-4">
            <div>
              <span className="section-kicker">1단계</span>
              <h3 className="section-title">사람 이름 정리</h3>
            </div>
          </div>
          <div className="resource-grid">
            {previewBundle.people.map((person, index) => (
              <article key={person.id} className="resource-card" style={getMotionStyle(index + 2)}>
                <h3>{person.displayName || person.name}</h3>
                <p className="mb-0 text-secondary">이 사람이 계좌/카드/거래의 소유자 기준으로 사용됩니다.</p>
                <form
                  className="profile-form w-100"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    applyPreviewPersonPatch(person.id, {
                      name: String(formData.get("name") ?? "").trim(),
                      displayName: String(formData.get("displayName") ?? "").trim() || String(formData.get("name") ?? "").trim(),
                      role: String(formData.get("role") ?? "member") === "owner" ? "owner" : "member",
                    });
                  }}
                >
                  <label>
                    원본 이름
                    <input name="name" className="form-control" defaultValue={person.name} />
                  </label>
                  <label>
                    표시 이름
                    <input name="displayName" className="form-control" defaultValue={person.displayName} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    역할
                    <select name="role" className="form-select" defaultValue={person.role}>
                      <option value="owner">기본 사용자</option>
                      <option value="member">구성원</option>
                    </select>
                  </label>
                  <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
                    <button className="btn btn-outline-primary btn-sm" type="submit">
                      적용
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>

          <div className="section-head mt-4">
            <div>
              <span className="section-kicker">2단계</span>
              <h3 className="section-title">계좌 소유자와 용도 매핑</h3>
            </div>
          </div>
          <div className="resource-grid">
            {previewBundle.accounts.map((account, index) => (
              <article key={account.id} className="resource-card" style={getMotionStyle(index + 4)}>
                <h3>{account.alias || account.name}</h3>
                <p className="mb-0 text-secondary">{account.institutionName} · {ACCOUNT_USAGE_LABELS[account.usageType]}</p>
                <form
                  className="profile-form w-100"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    const isShared = formData.get("isShared") === "on";
                    applyPreviewAccountPatch(account.id, {
                      name: String(formData.get("name") ?? "").trim(),
                      alias: String(formData.get("alias") ?? "").trim(),
                      ownerPersonId: isShared ? null : String(formData.get("ownerPersonId") ?? "") || null,
                      usageType: String(formData.get("usageType") ?? "daily") as
                        | "daily"
                        | "salary"
                        | "shared"
                        | "card_payment"
                        | "savings"
                        | "investment"
                        | "loan"
                        | "other",
                      isShared,
                    });
                  }}
                >
                  <label>
                    계좌 이름
                    <input name="name" className="form-control" defaultValue={account.name} />
                  </label>
                  <label>
                    표시명
                    <input name="alias" className="form-control" defaultValue={account.alias} />
                  </label>
                  <label>
                    소유자
                    <select name="ownerPersonId" className="form-select" defaultValue={account.ownerPersonId ?? ""}>
                      <option value="">미지정</option>
                      {previewBundle.people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName || person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    용도
                    <select name="usageType" className="form-select" defaultValue={account.usageType}>
                      {Object.entries(ACCOUNT_USAGE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="compact-check" style={{ gridColumn: "1 / -1" }}>
                    <span className="fw-semibold">공동 자금 계좌</span>
                    <input name="isShared" type="checkbox" className="form-check-input mt-0" defaultChecked={account.isShared} />
                  </label>
                  <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
                    <button className="btn btn-outline-primary btn-sm" type="submit">
                      적용
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>

          <div className="section-head mt-4">
            <div>
              <span className="section-kicker">3단계</span>
              <h3 className="section-title">카드 소유자와 결제 계좌 매핑</h3>
            </div>
          </div>
          <div className="resource-grid">
            {previewBundle.cards.map((card, index) => (
              <article key={card.id} className="resource-card" style={getMotionStyle(index + 6)}>
                <h3>{card.name}</h3>
                <p className="mb-0 text-secondary">
                  {card.issuerName} · 소유자 {previewPeopleMap.get(card.ownerPersonId ?? "") ?? "미지정"} · 결제{" "}
                  {previewAccountsMap.get(card.linkedAccountId ?? "") ?? "미연결"}
                </p>
                <form
                  className="profile-form w-100"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    applyPreviewCardPatch(card.id, {
                      name: String(formData.get("name") ?? "").trim(),
                      issuerName: String(formData.get("issuerName") ?? "").trim(),
                      ownerPersonId: String(formData.get("ownerPersonId") ?? "") || null,
                      linkedAccountId: String(formData.get("linkedAccountId") ?? "") || null,
                      cardType: String(formData.get("cardType") ?? "credit") as "credit" | "check" | "debit" | "prepaid" | "other",
                    });
                  }}
                >
                  <label>
                    카드 이름
                    <input name="name" className="form-control" defaultValue={card.name} />
                  </label>
                  <label>
                    카드사
                    <input name="issuerName" className="form-control" defaultValue={card.issuerName} />
                  </label>
                  <label>
                    소유자
                    <select name="ownerPersonId" className="form-select" defaultValue={card.ownerPersonId ?? ""}>
                      <option value="">미지정</option>
                      {previewBundle.people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName || person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    결제 계좌
                    <select name="linkedAccountId" className="form-select" defaultValue={card.linkedAccountId ?? ""}>
                      <option value="">연결 안 함</option>
                      {previewBundle.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.alias || account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    카드 종류
                    <select name="cardType" className="form-select" defaultValue={card.cardType}>
                      <option value="credit">신용카드</option>
                      <option value="check">체크카드</option>
                      <option value="debit">직불카드</option>
                      <option value="prepaid">선불카드</option>
                      <option value="other">기타</option>
                    </select>
                  </label>
                  <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
                    <button className="btn btn-outline-primary btn-sm" type="submit">
                      적용
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>

          <div className="d-flex flex-wrap gap-2 mt-4">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                commitImportedBundle(previewBundle, previewFileName);
                setPreviewBundle(null);
                setPreviewFileName("");
                void navigate(previewPostImportPath);
              }}
            >
              매핑 확인 후 가져오기
            </button>
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => {
                setPreviewBundle(null);
                setPreviewFileName("");
              }}
            >
              미리보기 닫기
            </button>
          </div>
        </section>
      ) : null}

      <section className="card shadow-sm" style={getMotionStyle(previewBundle ? 2 : 1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">최근 업로드</span>
            <h2 className="section-title">가져온 파일 기록</h2>
          </div>
          <span className="badge text-bg-dark">{scope.imports.length}건</span>
        </div>
        {!scope.imports.length ? (
          <EmptyStateCallout
            kicker="이력 없음"
            title="아직 업로드한 파일이 없습니다"
            description="워크북을 업로드하면 이 화면에서 어떤 파일을 언제 가져왔는지 계속 확인할 수 있습니다."
            actions={
              <>
                <Link to="/people" className="btn btn-outline-primary btn-sm">
                  사람 관리 먼저 보기
                </Link>
                <Link to="/accounts" className="btn btn-outline-secondary btn-sm">
                  계좌 관리 보기
                </Link>
              </>
            }
          />
        ) : (
          <>
            <div className="review-summary-panel mb-4">
              <div className="review-summary-copy">
                <strong>최근 업로드에서 바로 이어서 정리할 수 있습니다</strong>
                <p className="mb-0 text-secondary">
                  검토가 남아 있으면 리뷰로, 아니면 거래 정리 화면으로 바로 이동해서 업로드 직후 흐름을 이어가세요.
                </p>
              </div>
              <Link to={latestImportWorkspaceAction.to} className="btn btn-outline-primary btn-sm">
                {latestImportWorkspaceAction.label}
              </Link>
            </div>
          <div className="review-list">
            {recentImports.map((item, index) => (
                <article key={item.id} className="review-card" style={getMotionStyle(index + 10)}>
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div className="review-card-main">
                      <span className="review-type">{item.parserId}</span>
                      <h3>{item.fileName}</h3>
                      <p className="mb-0 text-secondary">
                        {item.importedAt.slice(0, 19).replace("T", " ")} · 거래 {item.rowCount}건 · 검토 {item.reviewCount}건
                      </p>
                    </div>
                    <div className="action-row justify-content-end">
                      {item.id === latestImport?.id ? (
                        <Link to={latestImportWorkspaceAction.to} className="btn btn-sm btn-outline-primary">
                          {latestImportWorkspaceAction.label}
                        </Link>
                      ) : item.reviewCount > 0 ? (
                        <Link to="/reviews" className="btn btn-sm btn-outline-primary">
                          리뷰 {item.reviewCount}건 보기
                        </Link>
                      ) : null}
                      <Link to="/transactions" className="btn btn-sm btn-outline-secondary">
                        가져온 거래 보기
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
          </div>
          </>
        )}
      </section>
    </div>
  );
}
