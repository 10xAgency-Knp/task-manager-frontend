/**
 * Reusable Form Field Wrapper & Input Controls
 *
 * Provides standardized layout for form inputs including label, required marker,
 * input control slot, helper hints, error messaging, character limit badges,
 * and automated smooth-scrolling to validation errors.
 */
import { RequiredIndicator } from "./ui.jsx";
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  getDescriptionCharacterLength
} from "../utils/helpers.js";

/**
 * Standard Form Field Wrapper
 * Renders an input container with label, validation error, and character counters.
 */
export function FormField({
  label,
  isRequired,
  req, // Shorthand alias
  isFullWidth,
  full, // Shorthand alias
  errorMessage,
  err, // Shorthand alias
  helperHint,
  hint, // Shorthand alias
  hintStyle,
  characterCount,
  count, // Shorthand alias
  maxCharacters,
  max, // Shorthand alias
  as: ElementTag = "label",
  id,
  children,
  style
}) {
  const resolvedRequired = isRequired ?? req;
  const resolvedFullWidth = isFullWidth ?? full;
  const resolvedError = errorMessage ?? err;
  const resolvedHint = helperHint ?? hint;
  const resolvedCount = characterCount ?? count;
  const resolvedMax = maxCharacters ?? max;

  const currentLength = resolvedCount == null ? 0 : String(resolvedCount).length;
  const isNearLimit = resolvedMax && resolvedCount != null && currentLength >= Math.floor(resolvedMax * 0.8);

  const containerClasses = [
    "f",
    resolvedFullWidth ? "full" : "",
    resolvedError ? "has-err" : ""
  ].filter(Boolean).join(" ");

  return (
    <ElementTag className={containerClasses} id={id} style={style}>
      {label != null ? (
        <span>
          {label}
          {resolvedRequired ? <RequiredIndicator /> : null}
        </span>
      ) : null}

      {children}

      {resolvedHint ? (
        <div className="hint" style={hintStyle}>
          {resolvedHint}
        </div>
      ) : null}

      {resolvedError ? (
        <div className="ferr">
          {resolvedError}
        </div>
      ) : null}

      {isNearLimit ? (
        <div className={"fcount" + (currentLength >= resolvedMax ? " at-max" : "")}>
          {currentLength >= resolvedMax
            ? `Maximum ${resolvedMax} characters reached`
            : `${currentLength} / ${resolvedMax} characters`}
        </div>
      ) : null}
    </ElementTag>
  );
}

/**
 * Multi-line Description Field
 * Standardized 3 to 3,000 character textarea with live counter and min-length indicator.
 */
export function DescriptionFormField({
  value,
  onChange,
  disabled,
  errorMessage,
  err, // Shorthand alias
  placeholder,
  id
}) {
  const resolvedError = errorMessage ?? err;
  const charLength = getDescriptionCharacterLength(value);
  const isLengthInvalid = charLength > DESCRIPTION_MAX_LENGTH || (charLength > 0 && charLength < DESCRIPTION_MIN_LENGTH);

  return (
    <label className={"f full" + (resolvedError ? " has-err" : "")}>
      <span>
        Description
        {disabled ? null : <RequiredIndicator />}
      </span>

      <textarea
        className="i"
        id={id}
        maxLength={DESCRIPTION_MAX_LENGTH}
        minLength={disabled ? undefined : DESCRIPTION_MIN_LENGTH}
        required={!disabled}
        disabled={disabled}
        placeholder={placeholder || "What is this about? (3 to 3,000 characters)"}
        value={value}
        onChange={event => onChange(event.target.value)}
      />

      <div className="hint" style={isLengthInvalid ? { color: "var(--red)" } : undefined}>
        {charLength} / {DESCRIPTION_MAX_LENGTH.toLocaleString("en-IN")} characters
        {charLength > 0 && charLength < DESCRIPTION_MIN_LENGTH ? ` (at least ${DESCRIPTION_MIN_LENGTH})` : ""}
      </div>

      {resolvedError ? <div className="ferr">{resolvedError}</div> : null}
    </label>
  );
}

/**
 * Smoothly scrolls the viewport to the first input field displaying a validation error
 * and places focus into the element.
 */
export function scrollToError() {
  setTimeout(() => {
    const errorContainer = document.querySelector("#overlay .has-err, #content .has-err");
    if (!errorContainer) return;

    errorContainer.scrollIntoView({ block: "center", behavior: "smooth" });
    const inputElement = errorContainer.querySelector("input, textarea, select");
    if (inputElement) {
      try {
        inputElement.focus({ preventScroll: true });
      } catch (focusError) {
        // Element may not accept programmatic focus
      }
    }
  }, 0);
}

// Backward-compatible component exports
export const F = FormField;
export const DescField = DescriptionFormField;
