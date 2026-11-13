/**
 * People / Assignee Multi-Picker Component
 *
 * Provides a chip-based typeahead picker allowing selection of multiple users
 * by ID from an allowed candidate pool, with keyboard navigation and search filtering.
 */
import { useRef, useState } from "react";
import { getUserById } from "../../utils/helpers.js";
import { Avatar } from "../ui.jsx";

export function PeoplePicker({
  value,
  onChange,
  editable = true,
  pool = [],
  err,
  boxId,
  listId
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const searchInputRef = useRef(null);
  const containerBoxRef = useRef(null);

  const selectedIds = value || [];
  const normalizedQuery = searchQuery.trim().toLowerCase();

  // Filter pool candidates matching query and not already selected
  const matchingCandidates = isDropdownOpen
    ? pool
        .map(getUserById)
        .filter(
          candidate =>
            candidate &&
            !candidate.archived &&
            candidate.status !== "Inactive" &&
            !selectedIds.includes(candidate.id) &&
            (!normalizedQuery ||
              candidate.name.toLowerCase().includes(normalizedQuery) ||
              String(candidate.designation || "").toLowerCase().includes(normalizedQuery) ||
              String(candidate.email || "").toLowerCase().includes(normalizedQuery))
        )
        .slice(0, 30)
    : [];

  const handleAddUser = userId => {
    onChange([...selectedIds, userId]);
    setSearchQuery("");
    setTimeout(() => searchInputRef.current && searchInputRef.current.focus(), 0);
  };

  const handleRemoveUser = userIdToRemove => {
    onChange(selectedIds.filter(id => id !== userIdToRemove));
  };

  return (
    <>
      <div
        className="chipbox"
        id={boxId}
        ref={containerBoxRef}
        onClick={event => {
          if (event.target === containerBoxRef.current && searchInputRef.current) {
            searchInputRef.current.focus();
          }
        }}
      >
        {selectedIds.map(userId => {
          const userEntity = getUserById(userId);
          return (
            <span className="chip" key={userId}>
              <Avatar user={userId} className="xs" />
              {userEntity ? userEntity.name : `#${userId}`}
              {userEntity?.designation ? (
                <span className="muted" style={{ fontWeight: 500 }}>
                  {userEntity.designation}
                </span>
              ) : null}
              {editable ? (
                <span
                  className="x"
                  data-rm={userId}
                  title="Remove"
                  onClick={event => {
                    event.stopPropagation();
                    handleRemoveUser(userId);
                  }}
                >
                  &#10005;
                </span>
              ) : null}
            </span>
          );
        })}

        {editable ? (
          <input
            className="pp-in"
            ref={searchInputRef}
            placeholder={selectedIds.length ? "Add another person..." : "Type a name or email..."}
            autoComplete="off"
            value={searchQuery}
            onChange={event => {
              setSearchQuery(event.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onBlur={() => {
              setTimeout(() => {
                const activeEl = document.activeElement;
                if (!activeEl || !containerBoxRef.current || !containerBoxRef.current.contains(activeEl)) {
                  setIsDropdownOpen(false);
                }
              }, 150);
            }}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (matchingCandidates.length > 0) {
                  handleAddUser(matchingCandidates[0].id);
                }
              } else if (event.key === "Backspace" && !searchQuery && selectedIds.length > 0) {
                onChange(selectedIds.slice(0, -1));
              } else if (event.key === "Escape") {
                event.stopPropagation();
                setIsDropdownOpen(false);
              }
            }}
          />
        ) : selectedIds.length ? null : (
          <span className="muted" style={{ fontSize: 12.4 }}>
            Nobody
          </span>
        )}
      </div>

      <div className="multi">
        <div
          id={listId}
          className="multi-list"
          style={{ display: isDropdownOpen && editable ? "block" : "none" }}
        >
          {!matchingCandidates.length ? (
            <div className="muted" style={{ fontSize: 12, padding: 8 }}>
              {normalizedQuery
                ? `Nobody matches “${normalizedQuery}”`
                : "Everyone you can choose is already added"}
            </div>
          ) : (
            matchingCandidates.map(candidateUser => {
              const matchesEmailSpecifically =
                Boolean(normalizedQuery && normalizedQuery.includes("@")) ||
                Boolean(
                  normalizedQuery &&
                    String(candidateUser.email || "").toLowerCase().includes(normalizedQuery) &&
                    !candidateUser.name.toLowerCase().includes(normalizedQuery)
                );

              return (
                <div
                  key={candidateUser.id}
                  className="multi-item"
                  data-pick={candidateUser.id}
                  onMouseDown={event => {
                    event.preventDefault();
                    handleAddUser(candidateUser.id);
                  }}
                >
                  <Avatar user={candidateUser} className="sm" />
                  <span>{candidateUser.name}</span>
                  <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>
                    {matchesEmailSpecifically && candidateUser.email
                      ? candidateUser.email
                      : candidateUser.designation || candidateUser.role}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {err ? <div className="ferr">{err}</div> : null}
    </>
  );
}
