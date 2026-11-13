/**
 * Sales Pipeline Deal Form & Detail Modal
 *
 * Provides creation, update, and read-only inspection dialogs for CRM deals,
 * with probability defaults by stage and permission-controlled delete actions.
 */
import { useRef, useState } from "react";
import { appStore, showToast } from "../../store/appStore.js";
import { API } from "../../services/api.js";
import {
  can,
  isCurrentUserAdmin,
  getActiveUsers,
  getTeamUsers,
  getUserById,
  DEAL_STAGES,
  DEAL_STAGE_BADGE_CLASSES,
  formatCurrencyINR,
  formatDisplayDate,
  validateTextField,
  validateNumericField
} from "../../utils/helpers.js";
import { safeRefresh } from "../../services/sync.js";
import {
  openModal,
  closeModal,
  ModalFrame,
  requestCloseModal,
  confirmBox,
  stackedConfirm
} from "../Modal.jsx";
import { useDirtyFormGuard } from "../../hooks/useDirty.js";
import { FormField, scrollToError } from "../Field.jsx";
import { PersonChip, MetadataDatesLine, Badge, MultiLineText } from "../ui.jsx";

const DEFAULT_STAGE_PROBABILITIES = {
  Discovery: 10,
  Qualified: 30,
  Proposal: 50,
  Negotiation: 75,
  Won: 100,
  Lost: 0
};

/**
 * Opens deal creation or edit dialog (or read-only viewer if edit is restricted).
 * @param {string} [dealId]
 */
export function openDeal(dealId) {
  if (!can.deals()) {
    showToast("You do not have access to the sales pipeline.", "err");
    return;
  }

  const dealItem = dealId
    ? (appStore.database.deals || []).find(item => item.id === dealId)
    : null;

  if (dealItem && !dealItem.canEdit) {
    return openModal(<DealReadOnlyView dealItem={dealItem} />);
  }

  if (!dealItem && !can.createDeal()) {
    showToast("You do not have permission to create deals.", "err");
    return;
  }

  openModal(<DealForm dealToEdit={dealItem} />, { form: true });
}

/**
 * Prompts user confirmation to move a deal to the Recycle Bin.
 * @param {string} dealCode
 */
export function askDeleteDeal(dealCode) {
  const deal = (appStore.database.deals || []).find(item => item.id === dealCode);
  if (!deal) return;

  confirmBox(
    "Delete deal?",
    <p>
      <b>{deal.name}</b> will move to the <b>Recycle Bin</b>. It can be restored for 30 days.
    </p>,
    "Delete deal",
    async () => {
      await API.delDeal(dealCode);
      closeModal();
      await safeRefresh();
      showToast("Deal deleted");
    }
  );
}

function DealForm({ dealToEdit, dl }) {
  const resolvedDeal = dealToEdit || dl;

  const defaultValues = resolvedDeal || {
    name: "",
    account: "",
    ownerId: appStore.currentUser?.id,
    stage: "Discovery",
    value: "",
    probability: 10,
    close: "",
    notes: ""
  };

  const candidateOwners = isCurrentUserAdmin()
    ? getActiveUsers()
    : getTeamUsers().filter(user => user.status !== "Inactive");

  if (
    defaultValues.ownerId &&
    !candidateOwners.some(user => user.id === defaultValues.ownerId) &&
    getUserById(defaultValues.ownerId)
  ) {
    candidateOwners.push(getUserById(defaultValues.ownerId));
  }

  const initialFormData = {
    name: defaultValues.name || "",
    account: defaultValues.account || "",
    ownerId: String(defaultValues.ownerId || ""),
    stage: defaultValues.stage,
    value: defaultValues.value === "" || defaultValues.value == null ? "" : String(defaultValues.value),
    probability: String(defaultValues.probability),
    close: String(defaultValues.close || "").slice(0, 10),
    notes: defaultValues.notes || ""
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialJsonSnapshot = useRef(JSON.stringify(initialFormData));
  useDirtyFormGuard(() => JSON.stringify(formData) !== initialJsonSnapshot.current);

  const updateFormField = (fieldName, value) => {
    setFormData(previous => ({ ...previous, [fieldName]: value }));
    if (formErrors[fieldName]) {
      setFormErrors(previousErrors => ({ ...previousErrors, [fieldName]: "" }));
    }
  };

  const handleSave = async () => {
    const validationErrors = {
      name: validateTextField(formData.name, {
        label: "Deal name",
        required: true,
        min: 3,
        max: 120
      }),
      account: validateTextField(formData.account, {
        label: "Account",
        max: 120
      }),
      value: validateNumericField(formData.value, {
        label: "Value",
        min: 0,
        max: 999999999999
      }),
      probability: validateNumericField(formData.probability, {
        label: "Probability",
        min: 0,
        max: 100
      }),
      notes: validateTextField(formData.notes, {
        label: "Notes",
        max: 4000
      })
    };

    Object.keys(validationErrors).forEach(key => {
      if (!validationErrors[key]) delete validationErrors[key];
    });

    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      scrollToError();
      return;
    }

    const payload = {
      id: resolvedDeal ? resolvedDeal.id : "",
      name: formData.name.trim(),
      account: formData.account.trim(),
      ownerId: formData.ownerId ? Number(formData.ownerId) : null,
      stage: formData.stage,
      value: formData.value,
      probability: Number(formData.probability) || 0,
      close: formData.close,
      notes: formData.notes
    };

    const executeSaveRequest = async () => {
      setIsSubmitting(true);
      try {
        await API.saveDeal(payload);
        closeModal();
        await safeRefresh();
        showToast("Deal saved");
      } catch (saveError) {
        setIsSubmitting(false);
        if (saveError?.silent) return;
        if (saveError?.field) {
          setFormErrors(previous => ({
            ...previous,
            [saveError.field]: saveError.message
          }));
        }
        showToast(saveError.message, "err");
      }
    };

    if (!resolvedDeal && !isCurrentUserAdmin()) {
      stackedConfirm(
        "Create this deal?",
        <p>Once created, only an Admin can change or delete it. Please check the details.</p>,
        "Create deal",
        executeSaveRequest,
        { kind: "primary" }
      );
    } else {
      executeSaveRequest();
    }
  };

  return (
    <ModalFrame
      title={resolvedDeal ? `Edit deal ${resolvedDeal.id}` : "New Deal"}
      sub={resolvedDeal ? "" : "After the deal is created, only an Admin can change or delete it"}
      foot={
        <>
          {resolvedDeal && resolvedDeal.canDelete ? (
            <button
              className="btn btn-danger"
              id="dDel"
              style={{ marginRight: "auto" }}
              onClick={() => askDeleteDeal(resolvedDeal.id)}
            >
              Delete
            </button>
          ) : null}
          <button
            className="btn btn-ghost"
            id="mCancel"
            onClick={() => requestCloseModal()}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            id="dSave"
            disabled={isSubmitting}
            onClick={handleSave}
          >
            {isSubmitting ? "Saving..." : resolvedDeal ? "Save changes" : "Create Deal"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <FormField
          label="Deal name"
          isRequired
          isFullWidth
          errorMessage={formErrors.name}
          characterCount={formData.name}
          maxCharacters={120}
        >
          <input
            className="i"
            id="dN"
            maxLength={120}
            value={formData.name}
            placeholder="e.g. SEO + Google Ads retainer"
            onChange={event => updateFormField("name", event.target.value)}
          />
        </FormField>

        <FormField
          label="Account / client"
          errorMessage={formErrors.account}
          characterCount={formData.account}
          maxCharacters={120}
        >
          <input
            className="i"
            id="dA"
            maxLength={120}
            value={formData.account}
            placeholder="Company name"
            onChange={event => updateFormField("account", event.target.value)}
          />
        </FormField>

        <FormField label="Owner">
          <select
            className="i"
            id="dO"
            value={formData.ownerId}
            onChange={event => updateFormField("ownerId", event.target.value)}
          >
            {candidateOwners.map(owner => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Stage">
          <select
            className="i"
            id="dS"
            value={formData.stage}
            onChange={event => {
              const nextStage = event.target.value;
              setFormData(previous => ({
                ...previous,
                stage: nextStage,
                probability: String(DEFAULT_STAGE_PROBABILITIES[nextStage] ?? 0)
              }));
            }}
          >
            {DEAL_STAGES.map(stage => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Value (INR)" errorMessage={formErrors.value}>
          <input
            className="i"
            id="dV"
            type="number"
            min="0"
            max="999999999999"
            step="1"
            value={formData.value}
            placeholder="e.g. 45000"
            onChange={event => updateFormField("value", event.target.value)}
          />
        </FormField>

        <FormField label="Probability (%)" errorMessage={formErrors.probability}>
          <input
            className="i"
            id="dP"
            type="number"
            min="0"
            max="100"
            value={formData.probability}
            onChange={event => {
              updateFormField("probability", event.target.value);
              setFormErrors(previous => ({
                ...previous,
                probability: validateNumericField(event.target.value, {
                  label: "Probability",
                  min: 0,
                  max: 100
                })
              }));
            }}
          />
        </FormField>

        <FormField label="Expected close date">
          <input
            className="i"
            id="dC"
            type="date"
            value={formData.close}
            onChange={event => updateFormField("close", event.target.value)}
          />
        </FormField>

        <FormField
          label="Notes"
          isFullWidth
          errorMessage={formErrors.notes}
          characterCount={formData.notes}
          maxCharacters={4000}
        >
          <textarea
            className="i"
            id="dNo"
            maxLength={4000}
            value={formData.notes}
            onChange={event => updateFormField("notes", event.target.value)}
          />
        </FormField>
      </div>

      {resolvedDeal ? <MetadataDatesLine item={resolvedDeal} /> : null}
    </ModalFrame>
  );
}

/**
 * Read-Only Deal Inspection Modal
 */
function DealReadOnlyView({ dealItem, dl }) {
  const deal = dealItem || dl;

  return (
    <ModalFrame
      title={deal.name}
      sub={`${deal.id} - read only. Ask an Admin to make changes.`}
      foot={
        <button
          className="btn btn-primary"
          id="mCancel"
          onClick={() => requestCloseModal()}
        >
          Close
        </button>
      }
    >
      <div className="grid-2e" style={{ gap: 12 }}>
        <div className="field">
          <div className="k">Account / client</div>
          <div className="v">{deal.account || "-"}</div>
        </div>
        <div className="field">
          <div className="k">Owner</div>
          <div className="v">
            <PersonChip userId={deal.ownerId} />
          </div>
        </div>
        <div className="field">
          <div className="k">Stage</div>
          <div className="v">
            <Badge dot className={DEAL_STAGE_BADGE_CLASSES[deal.stage]}>
              {deal.stage}
            </Badge>
          </div>
        </div>
        <div className="field">
          <div className="k">Value</div>
          <div className="v">{formatCurrencyINR(deal.value)}</div>
        </div>
        <div className="field">
          <div className="k">Probability</div>
          <div className="v">{deal.probability}%</div>
        </div>
        <div className="field">
          <div className="k">Expected close</div>
          <div className="v">{formatDisplayDate(deal.close)}</div>
        </div>
      </div>

      {deal.notes ? (
        <div className="field" style={{ marginTop: 12 }}>
          <div className="k">Notes</div>
          <div className="v">
            <MultiLineText text={deal.notes} />
          </div>
        </div>
      ) : null}

      <MetadataDatesLine item={deal} />
    </ModalFrame>
  );
}
