import { cn } from "./cn";
import { CheckIcon, WarningIcon } from "./icons";
import { MatchMarker } from "./match-marker";
import { SectionLabel } from "./section-label";
import { statusWords, type RequirementStatus } from "./status-chip";

export type Requirement = {
  /** The requirement, in the ad's own words where possible. */
  text: string;
  status: RequirementStatus;
  /** For a tailored requirement: the number of the CV line that answers it. */
  line?: number;
  /** A short note, such as "Matched in your experience" or "Not on your CV. We won’t add it." */
  note?: string;
};

export type RequirementGroup = { title: string; items: Requirement[] };

type RequirementListProps = {
  /** Usually Essential, then Desirable. A group with no items is left out. */
  groups: RequirementGroup[];
  /** compact: smaller type and spacing, for small cards such as the job ad on the home page. */
  size?: "default" | "compact";
  /** The heading level of each group's label, under the section it sits in. */
  headingLevel?: "h3" | "h4";
  className?: string;
};

/**
 * Plan A's list of what the job ad asks for (docs/design/paper-desk): each requirement with a tick, the number of the
 * CV line that answers it, or a warning, and a short note. A screen reader hears the status in words first.
 */
export function RequirementList({ groups, size = "default", headingLevel = "h3", className }: RequirementListProps) {
  const compact = size === "compact";
  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6", className)}>
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.title}>
            <SectionLabel as={headingLevel}>{group.title}</SectionLabel>
            <ul className={cn("mt-2.5 flex flex-col", compact ? "gap-2 text-sm" : "gap-3")}>
              {group.items.map((item) => (
                <RequirementItem key={item.text} item={item} compact={compact} />
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function RequirementItem({ item, compact }: { item: Requirement; compact: boolean }) {
  const tailored = item.status === "tailored";
  return (
    <li className={cn("flex gap-2.5", tailored && "-mx-2.5 rounded-lg bg-fit p-2.5")}>
      <span className="mt-0.5 flex shrink-0">
        {tailored && item.line !== undefined ? (
          <MatchMarker line={item.line} />
        ) : item.status === "missing" ? (
          <WarningIcon className="size-[18px] text-warning" />
        ) : (
          <CheckIcon className="size-[18px] text-accent" />
        )}
      </span>
      <div className="min-w-0">
        <p className="font-semibold [overflow-wrap:anywhere]">
          <span className="sr-only">{statusWords[item.status]}: </span>
          {item.text}
        </p>
        {item.note &&
          (item.status === "missing" ? (
            <p className={cn("mt-1 inline-block rounded-md bg-warning-bg px-2 py-0.5 font-semibold text-warning", compact ? "text-xs" : "text-[12.5px]")}>
              {item.note}
            </p>
          ) : (
            <p className={cn("mt-0.5", compact ? "text-xs" : "text-[12.5px]", tailored ? "font-semibold text-accent" : "text-text-muted")}>
              {item.note}
            </p>
          ))}
      </div>
    </li>
  );
}
