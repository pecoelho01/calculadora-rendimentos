import type { TableSort } from "./use-table-sort";

type SortableHeadingProps<Sort extends string> = {
  sortKey: Sort;
  label: string;
  className: string;
  sorting: Pick<TableSort<Sort>, "sort" | "direction" | "changeSort">;
};

export function SortableHeading<Sort extends string>({
  sortKey,
  label,
  className,
  sorting,
}: SortableHeadingProps<Sort>) {
  const isActive = sorting.sort === sortKey;
  const activeDirection =
    sorting.direction === "asc" ? "ascending" : "descending";
  const arrow = sorting.direction === "asc" ? "↑" : "↓";

  return (
    <th
      scope="col"
      aria-sort={isActive ? activeDirection : "none"}
    >
      <button
        className={className}
        onClick={() => sorting.changeSort(sortKey)}
      >
        {label} <span aria-hidden="true">{isActive ? arrow : "↕"}</span>
      </button>
    </th>
  );
}
